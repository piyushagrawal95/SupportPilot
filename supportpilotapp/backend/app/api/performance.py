from fastapi import APIRouter, Depends
from app.core.security import get_current_staff
from app.db.pool import pool

router = APIRouter(prefix="/performance", tags=["performance"])

@router.get("")
def get_ai_performance(_: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        # 1. Actions the AI took on its own
        actions_ai_own = conn.execute(
            "select count(*) as count, coalesce(sum(amount_cents), 0) as total_cents "
            "from actions where executed_by = 'ai_auto' and status = 'done'"
        ).fetchone()

        # 2. Actions approved by humans
        actions_approved = conn.execute(
            "select count(*) as count, coalesce(sum(amount_cents), 0) as total_cents "
            "from approvals where status = 'approved'"
        ).fetchone()

        # 3. Actions rejected by humans
        actions_rejected = conn.execute(
            "select count(*) as count from approvals where status = 'rejected'"
        ).fetchone()

        # 4. Spot-checked tickets flagged wrong
        flagged_wrong_count = conn.execute(
            "select count(*) as count from tickets where flagged_wrong = true"
        ).fetchone()["count"]

        # 5. Human disagreement rate:
        # Disagreements = rejected approvals + flagged wrong
        total_human_reviews = actions_approved["count"] + actions_rejected["count"]
        disagreements = actions_rejected["count"] + flagged_wrong_count
        disagreement_rate = (
            round((disagreements / (total_human_reviews + flagged_wrong_count)) * 100, 1)
            if (total_human_reviews + flagged_wrong_count) > 0
            else 0.0
        )

        # 5b. Watching Mode: AI suggestion vs human decision agreement rate (Bug 20 fix)
        watching_stats = conn.execute(
            """
            select
                count(*) filter (where a.status = 'approved') as agreed,
                count(*) filter (where a.status = 'rejected') as disagreed,
                count(*) as total
            from approvals a
            where a.ai_suggestion is not null and a.status in ('approved', 'rejected')
            """
        ).fetchone()
        watching_total = watching_stats["total"] or 0
        watching_agreed = watching_stats["agreed"] or 0
        watching_disagreed = watching_stats["disagreed"] or 0
        watching_agreement_rate_pct = (
            round((watching_agreed / watching_total) * 100, 1)
            if watching_total > 0
            else 100.0
        )


        # 6. Hand-off to humans stats and breakdown of reasons
        handoffs = conn.execute(
            """
            select coalesce(handoff_reason, 'unspecified') as reason, count(*) as count
            from tickets
            where status in ('needs_human', 'waiting_for_agent') or handoff_reason is not null
            group by coalesce(handoff_reason, 'unspecified')
            order by count desc
            """
        ).fetchall()
        total_handoffs = sum(r["count"] for r in handoffs)

        # 7. Breakdown by use case
        use_cases = conn.execute(
            """
            select coalesce(use_case, 'unknown') as use_case,
                   count(*) as total,
                   count(*) filter (where status = 'resolved_by_ai') as resolved_by_ai,
                   count(*) filter (where status in ('waiting_for_approval', 'waiting_for_agent', 'needs_human')) as pending_or_human,
                   coalesce(avg(extract(epoch from (updated_at - created_at))), 0)::int as avg_seconds
            from tickets
            group by coalesce(use_case, 'unknown')
            order by total desc
            """
        ).fetchall()

        # 8. Overall average resolution time (for tickets marked resolved_by_ai or closed)
        avg_res = conn.execute(
            """
            select coalesce(avg(extract(epoch from (updated_at - created_at))), 0)::int as avg_seconds
            from tickets
            where status in ('resolved_by_ai', 'closed')
            """
        ).fetchone()["avg_seconds"]

        # 9. List of flagged wrong tickets for spot check review
        flagged_tickets = conn.execute(
            """
            select t.id, t.source, t.use_case, t.status, t.resolved_by, t.updated_at,
                   c.email as customer_email,
                   (select data->>'reason' from ticket_events where ticket_id = t.id and kind = 'decision_flagged_wrong' limit 1) as flag_reason
            from tickets t
            left join customers c on t.customer_id = c.id
            where t.flagged_wrong = true
            order by t.updated_at desc
            """
        ).fetchall()

        return {
            "ai_own_actions": {
                "count": actions_ai_own["count"],
                "total_cents": actions_ai_own["total_cents"],
                "total_dollars": round(actions_ai_own["total_cents"] / 100, 2),
            },
            "approved_actions": {
                "count": actions_approved["count"],
                "total_cents": actions_approved["total_cents"],
                "total_dollars": round(actions_approved["total_cents"] / 100, 2),
            },
            "rejected_actions": {
                "count": actions_rejected["count"],
            },
            "disagreement_rate_pct": disagreement_rate,
            "watching_mode": {
                "total_suggestions": watching_total,
                "agreed": watching_agreed,
                "disagreed": watching_disagreed,
                "agreement_rate_pct": watching_agreement_rate_pct,
            },
            "flagged_wrong_count": flagged_wrong_count,

            "total_handoffs": total_handoffs,
            "handoff_reasons": [dict(r) for r in handoffs],
            "use_case_breakdown": [dict(u) for u in use_cases],
            "average_resolution_seconds": avg_res,
            "flagged_tickets": [dict(f) for f in flagged_tickets],
        }
