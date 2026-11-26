from fastapi import APIRouter, Depends
from app.core.security import get_current_staff
from app.db.pool import pool
from app.services.actions import CAP_TZ

router = APIRouter(prefix="/overview", tags=["overview"])

@router.get("")
def get_overview(_: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        # Today's ticket count (in CAP_TZ)
        tickets_today = conn.execute(
            "select count(*) as count from tickets "
            "where (created_at at time zone %s)::date = (now() at time zone %s)::date",
            (CAP_TZ, CAP_TZ),
        ).fetchone()["count"]

        # Resolved by AI today
        resolved_by_ai_today = conn.execute(
            "select count(*) as count from tickets "
            "where status = 'resolved_by_ai' and (updated_at at time zone %s)::date = (now() at time zone %s)::date",
            (CAP_TZ, CAP_TZ),
        ).fetchone()["count"]

        # All-time resolved by AI
        resolved_by_ai_total = conn.execute(
            "select count(*) as count from tickets where status = 'resolved_by_ai'"
        ).fetchone()["count"]

        # Waiting for approval count
        waiting_for_approval = conn.execute(
            "select count(*) as count from tickets where status = 'waiting_for_approval'"
        ).fetchone()["count"]

        # Live chats waiting for an agent
        waiting_for_agent = conn.execute(
            "select count(*) as count from tickets where status = 'waiting_for_agent'"
        ).fetchone()["count"]

        # Needs human count
        needs_human = conn.execute(
            "select count(*) as count from tickets where status = 'needs_human'"
        ).fetchone()["count"]

        # Total open / active tickets (not closed and not resolved_by_ai)
        open_tickets = conn.execute(
            "select count(*) as count from tickets where status not in ('resolved_by_ai', 'closed')"
        ).fetchone()["count"]

        # Money refunded automatically today (ai_auto)
        refunded_today_cents = conn.execute(
            "select coalesce(sum(amount_cents), 0) as total from actions "
            "where type = 'refund' and status = 'done' and executed_by = 'ai_auto' "
            "and (completed_at at time zone %s)::date = (now() at time zone %s)::date",
            (CAP_TZ, CAP_TZ),
        ).fetchone()["total"]

        # Settings for AI status and limits
        settings = conn.execute(
            "select ai_enabled, watching_mode, auto_refunds_paused, auto_refund_limit_cents, daily_cap_cents "
            "from settings where id = 1"
        ).fetchone()

        # Recent tickets
        recent_tickets = conn.execute(
            "select t.id, t.source, t.use_case, t.status, t.created_at, t.customer_ref, "
            "c.email as customer_email, su.name as agent_name "
            "from tickets t "
            "left join customers c on t.customer_id = c.id "
            "left join staff_users su on t.assigned_agent_id = su.id "
            "order by t.created_at desc limit 8"
        ).fetchall()

        # Available agents
        available_agents = conn.execute(
            "select id, name, email, role, availability from staff_users where availability = 'available'"
        ).fetchall()

        return {
            "tickets_today": tickets_today,
            "resolved_by_ai_today": resolved_by_ai_today,
            "resolved_by_ai_total": resolved_by_ai_total,
            "waiting_for_approval": waiting_for_approval,
            "waiting_for_agent": waiting_for_agent,
            "needs_human": needs_human,
            "open_tickets": open_tickets,
            "refunded_today_cents": int(refunded_today_cents),
            "refunded_today_dollars": round(int(refunded_today_cents) / 100, 2),
            "daily_cap_cents": settings["daily_cap_cents"],
            "daily_cap_dollars": round(settings["daily_cap_cents"] / 100, 2),
            "ai_enabled": settings["ai_enabled"],
            "watching_mode": settings["watching_mode"],
            "auto_refunds_paused": settings["auto_refunds_paused"],
            "auto_refund_limit_dollars": round(settings["auto_refund_limit_cents"] / 100, 2),
            "recent_tickets": [dict(r) for r in recent_tickets],
            "available_agents": [dict(a) for a in available_agents],
        }
