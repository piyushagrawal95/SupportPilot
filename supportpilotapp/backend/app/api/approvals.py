import hashlib
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from app.core.security import get_current_staff, require_internal_or_staff, require_roles
from app.db.pool import pool
from app.services import actions, emailer, replies

router = APIRouter(prefix="/approvals", tags=["approvals"])

class ApprovalDecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str = Field(min_length=2, max_length=1000)
    approver_email: str | None = None

@router.get("")
def list_approvals(
    status_filter: str | None = Query(default="pending", alias="status"),
    limit: int = Query(default=100, le=500),
    _: dict = Depends(get_current_staff),
):
    with pool.connection() as conn:
        where = "1=1"
        params = []
        if status_filter and status_filter != "all":
            where += " and a.status = %s"
            params.append(status_filter)

        sql = f"""
            select a.*,
                   t.customer_ref,
                   t.stripe_customer_id,
                   t.use_case,
                   c.email as customer_email,
                   su.name as decided_by_name
            from approvals a
            join tickets t on a.ticket_id = t.id
            left join customers c on t.customer_id = c.id
            left join staff_users su on a.decided_by = su.id
            where {where}
            order by a.created_at desc
            limit %s
        """
        params.append(limit)
        rows = conn.execute(sql, tuple(params)).fetchall()
        return [dict(r) for r in rows]

@router.get("/{approval_id}")
def get_approval(approval_id: int, _: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        row = conn.execute(
            """
            select a.*,
                   t.customer_ref,
                   t.stripe_customer_id,
                   t.use_case,
                   c.email as customer_email,
                   su.name as decided_by_name
            from approvals a
            join tickets t on a.ticket_id = t.id
            left join customers c on t.customer_id = c.id
            left join staff_users su on a.decided_by = su.id
            where a.id = %s
            """,
            (approval_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Approval not found")
        return dict(row)

@router.post("/{approval_id}/decide")
def decide_approval(
    approval_id: int,
    body: ApprovalDecisionIn,
    current_user: dict = Depends(require_roles(["approver", "admin"])),
):
    staff_id = current_user["id"]
    staff_name = current_user.get("name") or "Approver"

    with pool.connection() as conn:
        # Advisory session lock guarantees strict serialization without invalid DB states
        conn.execute("select pg_advisory_lock(hashtext('approval_decide_' || %s))", (str(approval_id),))
        try:
            a = conn.execute(
                "select a.*, t.stripe_customer_id, t.use_case, c.email as customer_email "
                "from approvals a "
                "join tickets t on a.ticket_id = t.id "
                "left join customers c on t.customer_id = c.id "
                "where a.id = %s",
                (approval_id,),
            ).fetchone()

            if not a:
                raise HTTPException(status_code=404, detail="Approval not found")

            # Check expiry
            now = datetime.now(timezone.utc)
            if a["expires_at"] < now:
                conn.execute("update approvals set status = 'expired' where id = %s", (approval_id,))
                conn.commit()
                raise HTTPException(status_code=400, detail="This approval request has expired")

            if a["status"] != "pending":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Approval has already been decided: {a['status']}",
                )

            ticket_id = a["ticket_id"]
            amount_cents = a["amount_cents"] or 0
            action_type = a.get("action_type") or "refund"

            if body.decision == "approved":
                if action_type == "cancel_subscription":
                    evidence = a.get("evidence") or {}
                    mode = evidence.get("mode") or "period_end"
                    res = actions.execute_cancellation(
                        pool,
                        ticket_id=ticket_id,
                        stripe_customer_id=a["stripe_customer_id"],
                        mode=mode,
                        refund_amount_cents=amount_cents,
                        charge_id=a["stripe_charge_id"],
                        executed_by="ai_after_approval",
                        approval_id=approval_id,
                    )
                    if res.status in ("done", "already_done"):
                        conn.execute(
                            """
                            update approvals
                            set status = 'approved',
                                decided_by = %s,
                                decision_reason = %s,
                                decided_at = now()
                            where id = %s
                            """,
                            (staff_id, body.reason, approval_id),
                        )
                        if mode == "period_end":
                            reply_text = "Your subscription cancellation has been approved by our team and scheduled for the end of your current billing period."
                        else:
                            refund_note = f", and a refund of {replies.money(amount_cents)} for the unused portion has been issued" if amount_cents > 0 else ""
                            reply_text = f"Your subscription cancellation has been approved by our team{refund_note}."

                        conn.execute("insert into messages (ticket_id, sender, content) values (%s, 'ai', %s)", (ticket_id, reply_text))
                        conn.execute("update tickets set status = 'resolved_by_ai', resolved_by = 'ai_after_approval', updated_at = now() where id = %s", (ticket_id,))
                        conn.execute(
                            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_approved', %s, %s)",
                            (ticket_id, f"human:{staff_id}", Jsonb({"reason": body.reason, "mode": mode, "amount_cents": amount_cents})),
                        )
                        conn.commit()

                        if a["customer_email"]:
                            emailer.send_once(
                                pool,
                                dedupe_key=f"ticket:{ticket_id}:approved_cancellation",
                                to_email=a["customer_email"],
                                subject=f"Cancellation approved for ticket #{ticket_id}",
                                text=f"{reply_text}\n\nTicket #{ticket_id}\nCloudNotes Support",
                                ticket_id=ticket_id,
                            )
                        return {"ok": True, "status": "approved", "action_type": "cancel_subscription"}
                    else:
                        conn.execute(
                            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_execution_failed', %s, %s)",
                            (ticket_id, f"human:{staff_id}", Jsonb({"error": res.message, "action_type": "cancel_subscription"})),
                        )
                        conn.execute("update tickets set status = 'needs_human', updated_at = now() where id = %s", (ticket_id,))
                        conn.commit()
                        return {"ok": False, "status": "execution_failed", "error": res.message}
                else:
                    # refund
                    res = actions.execute_refund(
                        pool,
                        ticket_id=ticket_id,
                        stripe_customer_id=a["stripe_customer_id"],
                        charge_id=a["stripe_charge_id"],
                        amount_cents=amount_cents,
                        executed_by="ai_after_approval",
                        approval_id=approval_id,
                        use_case=a["use_case"],
                    )
                    if res.status in ("done", "already_done"):
                        conn.execute(
                            """
                            update approvals
                            set status = 'approved',
                                decided_by = %s,
                                decision_reason = %s,
                                decided_at = now()
                            where id = %s
                            """,
                            (staff_id, body.reason, approval_id),
                        )
                        reply_text = f"Your refund of {replies.money(amount_cents)} has been approved by our team and issued. It will reach your card in a few days."
                        conn.execute("insert into messages (ticket_id, sender, content) values (%s, 'ai', %s)", (ticket_id, reply_text))
                        conn.execute("update tickets set status = 'resolved_by_ai', resolved_by = 'ai_after_approval', updated_at = now() where id = %s", (ticket_id,))
                        conn.execute(
                            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_approved', %s, %s)",
                            (ticket_id, f"human:{staff_id}", Jsonb({"reason": body.reason, "amount_cents": amount_cents, "stripe_ref": res.stripe_ref})),
                        )
                        conn.commit()

                        if a["customer_email"]:
                            emailer.send_once(
                                pool,
                                dedupe_key=f"ticket:{ticket_id}:approved_refund",
                                to_email=a["customer_email"],
                                subject=f"Refund approved for ticket #{ticket_id}",
                                text=f"{reply_text}\n\nTicket #{ticket_id}\nCloudNotes Support",
                                ticket_id=ticket_id,
                            )
                        return {"ok": True, "status": "approved", "refund_status": res.status, "stripe_ref": res.stripe_ref}
                    else:
                        # Execution failed - do not mark rejected to avoid skewing agreement performance
                        conn.execute(
                            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_execution_failed', %s, %s)",
                            (ticket_id, f"human:{staff_id}", Jsonb({"error": res.reason or res.message, "action_type": "refund"})),
                        )
                        conn.execute("update tickets set status = 'needs_human', updated_at = now() where id = %s", (ticket_id,))
                        conn.commit()
                        return {"ok": False, "status": "execution_failed", "error": res.reason or res.message}

            else:
                # Rejected
                conn.execute(
                    """
                    update approvals
                    set status = 'rejected',
                        decided_by = %s,
                        decision_reason = %s,
                        decided_at = now()
                    where id = %s
                    """,
                    (staff_id, body.reason, approval_id),
                )
                decline_msg = f"Our team reviewed your request for {a['action_type']} and did not approve it. Reason: {body.reason}."
                conn.execute("insert into messages (ticket_id, sender, content) values (%s, 'ai', %s)", (ticket_id, decline_msg))
                conn.execute("update tickets set status = 'needs_human', updated_at = now() where id = %s", (ticket_id,))
                conn.execute(
                    "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_rejected', %s, %s)",
                    (ticket_id, f"human:{staff_id}", Jsonb({"reason": body.reason})),
                )
                conn.commit()

                if a["customer_email"]:
                    emailer.send_once(
                        pool,
                        dedupe_key=f"ticket:{ticket_id}:rejected_approval",
                        to_email=a["customer_email"],
                        subject=f"Update on your request #{ticket_id}",
                        text=f"{decline_msg}\n\nTicket #{ticket_id}\nCloudNotes Support",
                        ticket_id=ticket_id,
                    )
                return {"ok": True, "status": "rejected"}

        finally:
            conn.execute("select pg_advisory_unlock(hashtext('approval_decide_' || %s))", (str(approval_id),))


@router.get("/token/{raw_token}")
def get_approval_by_token(raw_token: str):
    token_hash = hashlib.sha256(raw_token.strip().encode()).hexdigest()
    with pool.connection() as conn:
        a = conn.execute(
            """
            select a.id, a.ticket_id, a.action_type, a.stripe_charge_id, a.amount_cents,
                   a.evidence, a.ai_suggestion, a.status, a.expires_at,
                   t.use_case, c.email as customer_email
            from approvals a
            join tickets t on a.ticket_id = t.id
            left join customers c on t.customer_id = c.id
            where a.token_hash = %s
            """,
            (token_hash,),
        ).fetchone()

        if not a:
            raise HTTPException(status_code=404, detail="Invalid approval link")
        return dict(a)

@router.post("/token/{raw_token}/decide")
def decide_approval_by_token(raw_token: str, body: ApprovalDecisionIn):
    token_hash = hashlib.sha256(raw_token.strip().encode()).hexdigest()
    with pool.connection() as conn:
        a = conn.execute(
            "select id, approver_email, evidence from approvals where token_hash = %s",
            (token_hash,),
        ).fetchone()
        if not a:
            raise HTTPException(status_code=404, detail="Invalid approval link")
        approval_id = a["id"]

        # Bug 2 fix: Body ka approver_email field ignore karo.
        # Token ke saath jo approver_email save hua tha wahi use karo.
        saved_email = (a.get("approver_email") or "").strip()
        if not saved_email and a.get("evidence"):
            saved_email = ((a.get("evidence") or {}).get("approver_email") or "").strip()

        approver = None
        if saved_email:
            u = conn.execute(
                "select id, name, role, email from staff_users where lower(email) = lower(%s)",
                (saved_email,),
            ).fetchone()
            if u:
                approver = dict(u)

        # Email na mile to reject karo, "System Approver" id 1 mat banao
        if not approver:
            raise HTTPException(
                status_code=400,
                detail=f"Assigned approver ({saved_email or 'unknown'}) not found in staff users. Approval token cannot be processed.",
            )

    return decide_approval(approval_id, body, approver)
