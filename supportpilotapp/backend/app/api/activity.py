from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_staff
from app.db.pool import pool

router = APIRouter(prefix="/activity", tags=["activity"])

@router.get("")
def get_activity_log(
    executed_by: str | None = None,
    action_type: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    _: dict = Depends(get_current_staff),
):
    with pool.connection() as conn:
        filters = ["1=1"]
        params = []

        if executed_by and executed_by != "all":
            filters.append("a.executed_by = %s")
            params.append(executed_by)

        if action_type and action_type != "all":
            filters.append("a.type = %s")
            params.append(action_type)

        where_clause = " and ".join(filters)

        sql = f"""
            select a.id,
                   a.ticket_id,
                   a.type as action_type,
                   a.amount_cents,
                   a.stripe_charge_id,
                   a.stripe_ref,
                   a.status,
                   a.executed_by,
                   a.error,
                   a.created_at,
                   a.completed_at,
                   t.use_case,
                   c.email as customer_email,
                   su.name as decided_by_name
            from actions a
            join tickets t on a.ticket_id = t.id
            left join customers c on t.customer_id = c.id
            left join approvals ap on a.approval_id = ap.id
            left join staff_users su on ap.decided_by = su.id
            where {where_clause}
            order by a.created_at desc
            limit %s offset %s
        """
        params.extend([limit, offset])
        actions_rows = conn.execute(sql, tuple(params)).fetchall()

        # Count total
        count_sql = f"select count(*) as total from actions a where {where_clause}"
        total = conn.execute(count_sql, tuple(params[:-2])).fetchone()["total"]

        # Emails sent log
        emails = conn.execute(
            """
            select id, ticket_id, dedupe_key, to_email, subject, provider, status, sent_at, created_at, error
            from email_outbox
            order by created_at desc
            limit 50
            """
        ).fetchall()

        return {
            "total": total,
            "actions": [dict(r) for r in actions_rows],
            "emails": [dict(e) for e in emails],
        }
