import json
import re
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.security import require_internal_key
from app.db.pool import pool
from app.services import orchestrator

router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(require_internal_key)])

TERMINAL = ("resolved_by_ai", "closed")      # in tickets pe baat khatam, nayi baat = naya ticket
WORD_DELAY = 0.03        # seconds, sirf dikhane ke liye. Tests isko 0 kar dete hain.


class ChatIn(BaseModel):
    user_id: UUID          # CloudNotes backend ne login token se nikala hua
    message: str = Field(min_length=1, max_length=2000)
    ticket_id: int | None = None


def _find_or_create_ticket(conn, user_id: str, ticket_id: int | None):
    if ticket_id is not None:
        # Ticket isi customer ki honi chahiye, warna "nahi mila" (dusre ka ticket kabhi nahi dikhta)
        t = conn.execute("select id, status from tickets where id=%s and customer_ref=%s",
                         (ticket_id, user_id)).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if t["status"] not in TERMINAL:
            return t
        # Ticket khatam ho chuka: neeche naya ticket banega
    else:
        # Is customer ka chal raha chat ticket (approval/agent ke paas wala bhi) ho to wahi
        t = conn.execute(
            "select id, status from tickets where customer_ref=%s and source='chat' "
            "and status not in ('resolved_by_ai','closed') order by created_at desc limit 1",
            (user_id,)).fetchone()
        if t:
            return t

    cust = conn.execute("select id, stripe_customer_id from customers where cloudnotes_user_id=%s::uuid",
                        (user_id,)).fetchone()
    t = conn.execute(
        "insert into tickets (source, customer_ref, customer_id, stripe_customer_id, status) "
        "values ('chat', %s, %s, %s, 'open') returning id, status",
        (user_id, cust["id"] if cust else None, cust["stripe_customer_id"] if cust else None)).fetchone()
    conn.execute("insert into ticket_events (ticket_id, kind, actor) values (%s, 'ticket_created', 'system')",
                 (t["id"],))
    return t


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _words(text: str) -> list[str]:
    """Text ko words me todta hai, space saath rakhta hai. ''.join(_words(t)) == t hamesha."""
    return re.findall(r"\S+\s*", text)


@router.post("/message")
def send_message(body: ChatIn):
    text = body.message.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message is empty")

    user_id = str(body.user_id)
    with pool.connection() as conn:
        ticket = _find_or_create_ticket(conn, user_id, body.ticket_id)
        conn.execute("insert into messages (ticket_id, sender, content) values (%s, 'customer', %s)",
                     (ticket["id"], text))
        conn.execute("insert into ticket_events (ticket_id, kind, actor) values (%s, 'message', 'customer')",
                     (ticket["id"],))

    def stream():
        yield _sse({"type": "ticket", "ticket_id": ticket["id"], "status": ticket["status"]})
        for event in orchestrator.run(ticket["id"]):
            if event["type"] == "reply":
                # Reply DB me pehle hi likha ja chuka hai (orchestrator._end). Ye sirf dikhane ka effect hai.
                for w in _words(event["text"]):
                    yield _sse({"type": "token", "text": w})
                    time.sleep(WORD_DELAY)
                yield _sse({"type": "done", "ticket_status": event["ticket_status"]})
            else:
                yield _sse(event)      # status events ("Checking your payments…")

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})