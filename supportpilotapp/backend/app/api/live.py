from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from app.core.security import get_current_staff, require_internal_or_staff, require_roles, require_internal_or_admin
from app.db.pool import pool

router = APIRouter(prefix="/live", tags=["live"])

class LiveAcceptIn(BaseModel):
    ticket_id: int

class LiveSendIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

@router.get("/queue")
def get_live_queue(_: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        rows = conn.execute(
            """
            select t.id, t.status, t.handoff_reason, t.use_case, t.created_at, t.updated_at,
                   c.email as customer_email,
                   (select content from messages where ticket_id = t.id and sender = 'customer' order by id desc limit 1) as customer_query,
                   extract(epoch from (now() - t.updated_at))::int as seconds_waiting
            from tickets t
            left join customers c on t.customer_id = c.id
            where t.status = 'waiting_for_agent' and t.assigned_agent_id is null
            order by t.updated_at asc
            """
        ).fetchall()
        return [dict(r) for r in rows]

@router.post("/{ticket_id}/accept")
def accept_live_chat(ticket_id: int, current_user: dict = Depends(require_roles(["agent", "admin"]))):
    agent_id = current_user["id"]
    agent_name = current_user.get("name") or "our team"

    with pool.connection() as conn:
        # Atomic lock & update: if two agents click at once, only one gets the row
        row = conn.execute(
            """
            update tickets
            set assigned_agent_id = %s,
                status = 'open',
                updated_at = now()
            where id = %s and status = 'waiting_for_agent' and assigned_agent_id is null
            returning id, assigned_agent_id
            """,
            (agent_id, ticket_id),
        ).fetchone()

        if not row:
            # Check who got it
            current = conn.execute(
                "select assigned_agent_id, su.name from tickets t "
                "left join staff_users su on t.assigned_agent_id = su.id where t.id = %s",
                (ticket_id,),
            ).fetchone()
            other_name = (current["name"] if current else None) or "another agent"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This chat was already accepted by {other_name}.",
            )

        # Notify customer in chat: "Connecting you to Ravi from our team"
        system_text = f"Connecting you to {agent_name} from our team."
        conn.execute(
            "insert into messages (ticket_id, sender, content) values (%s, 'system', %s)",
            (ticket_id, system_text),
        )

        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'agent_accepted', %s, %s)",
            (ticket_id, f"human:{agent_id}", Jsonb({"agent_id": agent_id, "agent_name": agent_name})),
        )

        return {
            "ok": True,
            "ticket_id": ticket_id,
            "assigned_agent_id": agent_id,
            "agent_name": agent_name,
            "system_message": system_text,
        }

@router.post("/{ticket_id}/timeout")
def timeout_live_chat(ticket_id: int, _: dict = Depends(require_internal_or_admin)):
    with pool.connection() as conn:
        row = conn.execute(
            """
            update tickets
            set status = 'needs_human',
                updated_at = now()
            where id = %s and status = 'waiting_for_agent' and assigned_agent_id is null
            returning id
            """,
            (ticket_id,),
        ).fetchone()

        if row:
            msg = (
                "Our team isn't available right now. I've saved our conversation "
                f"as ticket #{ticket_id}, and someone will email you within a few hours."
            )
            conn.execute(
                "insert into messages (ticket_id, sender, content) values (%s, 'ai', %s)",
                (ticket_id, msg),
            )
            conn.execute(
                "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'agent_timeout', 'system', %s)",
                (ticket_id, Jsonb({"reason": "No agent accepted within 2 minutes"})),
            )
            return {"ok": True, "timed_out": True}

    return {"ok": True, "timed_out": False}

@router.get("/{ticket_id}/messages")
def get_live_messages(
    ticket_id: int,
    after_id: int = Query(default=0),
    customer_ref: str | None = Query(default=None),
    auth: dict = Depends(require_internal_or_staff),
):
    with pool.connection() as conn:
        t = conn.execute(
            "select t.id, t.status, t.customer_ref, t.assigned_agent_id, su.name as agent_name from tickets t "
            "left join staff_users su on t.assigned_agent_id = su.id where t.id = %s",
            (ticket_id,),
        ).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Bug 1 fix: Enforce ownership check if called on behalf of a customer
        if customer_ref is not None:
            if str(t["customer_ref"]) != str(customer_ref):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to view this ticket")
        elif auth.get("type") != "staff":
            # If internal caller did not provide customer_ref, it must be staff or specify customer_ref
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer_ref is required for internal requests")

        rows = conn.execute(
            "select id, sender, content, created_at from messages "
            "where ticket_id = %s and id > %s order by id asc",
            (ticket_id, after_id),
        ).fetchall()

        return {
            "ticket_id": ticket_id,
            "status": t["status"],
            "assigned_agent_id": t["assigned_agent_id"],
            "agent_name": t["agent_name"],
            "messages": [dict(r) for r in rows],
        }

@router.post("/{ticket_id}/send")
def send_live_agent_message(
    ticket_id: int,
    body: LiveSendIn,
    current_user: dict = Depends(require_roles(["agent", "admin"])),
):
    agent_id = current_user["id"]
    agent_name = current_user.get("name") or "Agent"
    role = current_user.get("role")

    with pool.connection() as conn:
        t = conn.execute("select id, status, assigned_agent_id from tickets where id = %s", (ticket_id,)).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Bug 3 fix: Agent can only send message to ticket assigned to them (unless admin)
        if t["assigned_agent_id"] != agent_id and role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot message a chat assigned to another agent",
            )

        # Insert agent message
        msg_id = conn.execute(
            "insert into messages (ticket_id, sender, content) values (%s, 'agent', %s) returning id",
            (ticket_id, body.message),
        ).fetchone()["id"]

        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'agent_live_message', %s, %s)",
            (ticket_id, f"human:{agent_id}", Jsonb({"agent_name": agent_name, "message": body.message})),
        )

        conn.execute(
            "update tickets set updated_at = now() where id = %s",
            (ticket_id,),
        )

        return {"ok": True, "message_id": msg_id}

