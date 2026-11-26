from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from app.core.security import require_internal_or_staff, require_internal_or_admin
from app.db.pool import pool

router = APIRouter(prefix="/tickets", tags=["tickets"])

class TicketCreate(BaseModel):
    source: Literal["chat", "stripe_event"] = "chat"
    customer_ref: str | None = None
    use_case: Literal["duplicate_charge", "cancellation", "failed_payment", "refund", "dispute", "unknown"] | None = None

class TicketReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    new_status: str | None = None

class TicketStatusIn(BaseModel):
    status: Literal["open", "resolved_by_ai", "waiting_for_approval", "waiting_for_agent", "needs_human", "waiting_for_customer", "closed"]

class FlagWrongIn(BaseModel):
    reason: str = Field(min_length=2, max_length=1000)

@router.post("")
def create_ticket(body: TicketCreate, _: dict = Depends(require_internal_or_admin)):
    with pool.connection() as conn:
        ticket = conn.execute(
            "insert into tickets (source, customer_ref, use_case) values(%s, %s, %s) returning *",
            (body.source, body.customer_ref, body.use_case),
        ).fetchone()
        conn.execute(
            "insert into ticket_events(ticket_id, kind, actor) values(%s, 'ticket_created', 'system')",
            (ticket["id"],),
        )
    return ticket


@router.get("")
def list_tickets(
    status: str | None = None,
    use_case: str | None = None,
    q: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    _: dict = Depends(require_internal_or_staff),
):
    with pool.connection() as conn:
        filters = ["1=1"]
        params = []

        if status and status != "all":
            filters.append("t.status = %s")
            params.append(status)

        if use_case and use_case != "all":
            filters.append("t.use_case = %s")
            params.append(use_case)

        if q and q.strip():
            query_str = f"%{q.strip().lower()}%"
            filters.append("(cast(t.id as text) like %s or lower(coalesce(c.email, '')) like %s or lower(coalesce(t.customer_ref, '')) like %s or lower(coalesce(t.stripe_customer_id, '')) like %s)")
            params.extend([query_str, query_str, query_str, query_str])

        where_clause = " and ".join(filters)
        sql = f"""
            select t.*,
                   c.email as customer_email,
                   su.name as agent_name,
                   (select content from messages where ticket_id = t.id order by id desc limit 1) as last_message,
                   (select created_at from messages where ticket_id = t.id order by id desc limit 1) as last_message_at
            from tickets t
            left join customers c on t.customer_id = c.id
            left join staff_users su on t.assigned_agent_id = su.id
            where {where_clause}
            order by t.created_at desc
            limit %s offset %s
        """
        params.extend([limit, offset])
        rows = conn.execute(sql, tuple(params)).fetchall()

    return [dict(r) for r in rows]

@router.get("/{ticket_id}")
def get_ticket(ticket_id: int, _: dict = Depends(require_internal_or_staff)):
    with pool.connection() as conn:
        t = conn.execute(
            """
            select t.*,
                   c.email as customer_email,
                   c.cloudnotes_user_id,
                   su.name as agent_name,
                   su.email as agent_email
            from tickets t
            left join customers c on t.customer_id = c.id
            left join staff_users su on t.assigned_agent_id = su.id
            where t.id = %s
            """,
            (ticket_id,),
        ).fetchone()

        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        messages = conn.execute(
            "select id, sender, content, created_at from messages where ticket_id = %s order by id asc",
            (ticket_id,),
        ).fetchall()

        events = conn.execute(
            "select id, kind, actor, data, created_at from ticket_events where ticket_id = %s order by id asc",
            (ticket_id,),
        ).fetchall()

        actions_list = conn.execute(
            "select * from actions where ticket_id = %s order by id asc",
            (ticket_id,),
        ).fetchall()

        approvals_list = conn.execute(
            "select * from approvals where ticket_id = %s order by id asc",
            (ticket_id,),
        ).fetchall()

        return {
            "ticket": dict(t),
            "messages": [dict(m) for m in messages],
            "events": [dict(e) for e in events],
            "actions": [dict(a) for a in actions_list],
            "approvals": [dict(ap) for ap in approvals_list],
        }

@router.post("/{ticket_id}/reply")
def reply_to_ticket(ticket_id: int, body: TicketReplyIn, auth: dict = Depends(require_internal_or_staff)):
    user = auth.get("user") or {}
    role = user.get("role")
    
    # Bug 2 fix: Viewers cannot reply
    if auth.get("type") == "staff" and role not in ("agent", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Only agents and admins can reply to tickets.")

    agent_id = user.get("id", 1)
    agent_name = user.get("name", "Support Agent")

    with pool.connection() as conn:
        t = conn.execute("select id, status, customer_id, assigned_agent_id from tickets where id = %s", (ticket_id,)).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Bug 3 fix: If assigned to another agent, non-admin cannot send replies
        if auth.get("type") == "staff" and t["assigned_agent_id"] and t["assigned_agent_id"] != agent_id and role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ticket is assigned to another agent.")

        conn.execute(
            "insert into messages (ticket_id, sender, content) values (%s, 'agent', %s)",
            (ticket_id, body.message),
        )

        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'agent_reply', %s, %s)",
            (ticket_id, f"human:{agent_id}", Jsonb({"agent_name": agent_name, "message": body.message})),
        )

        next_status = body.new_status or "waiting_for_customer"
        conn.execute(
            "update tickets set status = %s, assigned_agent_id = coalesce(assigned_agent_id, %s), updated_at = now() where id = %s",
            (next_status, agent_id, ticket_id),
        )

    return {"ok": True, "ticket_id": ticket_id, "status": next_status}

@router.post("/{ticket_id}/takeover")
def takeover_ticket(ticket_id: int, auth: dict = Depends(require_internal_or_staff)):
    user = auth.get("user") or {}
    role = user.get("role")

    # Bug 2 fix: Viewers cannot takeover
    if auth.get("type") == "staff" and role not in ("agent", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Only agents and admins can takeover tickets.")

    agent_id = user.get("id", 1)
    agent_name = user.get("name", "Support Agent")

    with pool.connection() as conn:
        t = conn.execute("select id, status from tickets where id = %s", (ticket_id,)).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        conn.execute(
            "update tickets set assigned_agent_id = %s, status = 'open', updated_at = now() where id = %s",
            (agent_id, ticket_id),
        )

        conn.execute(
            "insert into messages (ticket_id, sender, content) values (%s, 'system', %s)",
            (ticket_id, f"Agent {agent_name} took over this ticket."),
        )

        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'ticket_takeover', %s, %s)",
            (ticket_id, f"human:{agent_id}", Jsonb({"agent_name": agent_name})),
        )

    return {"ok": True, "ticket_id": ticket_id, "assigned_agent_id": agent_id}

@router.post("/{ticket_id}/status")
def change_ticket_status(ticket_id: int, body: TicketStatusIn, auth: dict = Depends(require_internal_or_staff)):
    user = auth.get("user") or {}
    role = user.get("role")

    # Bug 2 fix: Viewers cannot change status
    if auth.get("type") == "staff" and role not in ("agent", "admin", "approver"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Viewers cannot change ticket status.")

    staff_id = user.get("id", 1)

    with pool.connection() as conn:
        t = conn.execute("select id, status from tickets where id = %s", (ticket_id,)).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        conn.execute(
            "update tickets set status = %s, updated_at = now() where id = %s",
            (body.status, ticket_id),
        )

        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'status_changed', %s, %s)",
            (ticket_id, f"human:{staff_id}", Jsonb({"old_status": t["status"], "new_status": body.status})),
        )

    return {"ok": True, "ticket_id": ticket_id, "status": body.status}

@router.post("/{ticket_id}/flag-wrong")
def flag_ticket_wrong(ticket_id: int, body: FlagWrongIn, auth: dict = Depends(require_internal_or_staff)):
    user = auth.get("user") or {}
    role = user.get("role")

    # Bug 2 fix: Viewers cannot flag decisions
    if auth.get("type") == "staff" and role not in ("agent", "admin", "approver"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Viewers cannot flag decisions.")

    staff_id = user.get("id", 1)

    with pool.connection() as conn:
        t = conn.execute("select id from tickets where id = %s", (ticket_id,)).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Ticket not found")

        conn.execute(
            "update tickets set flagged_wrong = true, updated_at = now() where id = %s",
            (ticket_id,),
        )

        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'decision_flagged_wrong', %s, %s)",
            (ticket_id, f"human:{staff_id}", Jsonb({"reason": body.reason})),
        )

    return {"ok": True, "ticket_id": ticket_id, "flagged_wrong": True}

