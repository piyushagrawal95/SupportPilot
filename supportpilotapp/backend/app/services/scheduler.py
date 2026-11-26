import asyncio
import logging
from datetime import datetime, timezone
from psycopg.types.json import Jsonb
from app.core.config import settings
from app.services import emailer

log = logging.getLogger(__name__)

def _perform_sync_checks(pool):
    """Synchronous worker running on threadpool to avoid blocking FastAPI event loop."""
    with pool.connection() as conn:
        # 1. Check live chat 2-minute timeouts (Bug 12 & 18)
        timed_out_tickets = conn.execute(
            """
            update tickets
            set status = 'needs_human',
                updated_at = now()
            where status = 'waiting_for_agent'
              and assigned_agent_id is null
              and updated_at < now() - interval '2 minutes'
            returning id
            """
        ).fetchall()

        for r in timed_out_tickets:
            tid = r["id"]
            msg = (
                "Our team isn't available right now. I've saved our conversation "
                f"as ticket #{tid}, and someone will email you within a few hours."
            )
            # Insert with sender='system' so both frontend and poll widgets display it immediately (Bug 18 fix)
            conn.execute("insert into messages (ticket_id, sender, content) values (%s, 'system', %s)", (tid, msg))
            conn.execute(
                "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'agent_timeout', 'system', %s)",
                (tid, Jsonb({"reason": "No agent accepted within 2 minutes"})),
            )
            log.info("Ticket #%s timed out from waiting_for_agent to needs_human", tid)

        # Dynamic email configuration (Bug 12 fix)
        stg = conn.execute("select approver_emails from settings where id = 1").fetchone()
        approver_email = None
        if stg and (isinstance(stg, dict) or hasattr(stg, "get")) and stg.get("approver_emails"):
            emails = [e for e in stg["approver_emails"] if e and e.strip()]
            if emails:
                approver_email = emails[0].strip()
        if not approver_email:
            approver_user = conn.execute(
                "select email from staff_users where role = 'approver' order by id limit 1"
            ).fetchone()
            approver_email = (approver_user.get("email") if approver_user and (isinstance(approver_user, dict) or hasattr(approver_user, "get")) else None) or "anita@cloudnotes.com"

        admin_user = conn.execute(
            "select email from staff_users where role = 'admin' order by id limit 1"
        ).fetchone()
        admin_email = (admin_user.get("email") if admin_user and (isinstance(admin_user, dict) or hasattr(admin_user, "get")) else None) or "rahul@cloudnotes.com"

        # 2. Check 12-hour pending approval reminders (Bug 18)
        approvals_12h = conn.execute(
            """
            select a.id, a.ticket_id, a.amount_cents, a.token_hash, a.created_at
            from approvals a
            where a.status = 'pending'
              and a.created_at < now() - interval '12 hours'
              and not exists (
                  select 1 from ticket_events
                  where ticket_id = a.ticket_id and kind = 'approval_reminder_sent'
              )
            """
        ).fetchall()

        for app in approvals_12h:
            aid = app["id"]
            tid = app["ticket_id"]
            amt = f"${(app['amount_cents'] or 0)/100:.2f}"
            emailer.send_once(
                pool,
                dedupe_key=f"approval_reminder:{aid}",
                to_email=approver_email,
                subject=f"Reminder: Approval pending for ticket #{tid} ({amt})",
                text=f"Hello Approver,\n\nApproval #{aid} for ticket #{tid} ({amt}) has been pending for over 12 hours.\n"
                     f"Please review and decide in SupportPilot: {settings.frontend_url}/approvals\n\nSupportPilot Automated Governance",
                ticket_id=tid,
            )
            conn.execute(
                "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_reminder_sent', 'system', %s)",
                (tid, Jsonb({"approval_id": aid, "hours_pending": 12, "sent_to": approver_email})),
            )
            log.info("Approval #%s 12-hour reminder sent to %s", aid, approver_email)

        # 3. Check 24-hour pending approval admin escalations (Bug 14 & 18 fix)
        # Approval expiry is 48 hours, so admin receives escalation at 24 hours while approval is still fully active
        approvals_24h = conn.execute(
            """
            select a.id, a.ticket_id, a.amount_cents, a.created_at
            from approvals a
            where a.status = 'pending'
              and a.created_at < now() - interval '24 hours'
              and not exists (
                  select 1 from ticket_events
                  where ticket_id = a.ticket_id and kind = 'approval_escalated_to_admin'
              )
            """
        ).fetchall()

        for app in approvals_24h:
            aid = app["id"]
            tid = app["ticket_id"]
            amt = f"${(app['amount_cents'] or 0)/100:.2f}"
            emailer.send_once(
                pool,
                dedupe_key=f"approval_escalation:{aid}",
                to_email=admin_email,
                subject=f"ESCALATION: Approval for ticket #{tid} ({amt}) overdue (>24h)",
                text=f"Hello Administrator,\n\nApproval #{aid} for ticket #{tid} ({amt}) has remained undecided for over 24 hours.\n"
                     f"This approval has been escalated for manager action: {settings.frontend_url}/approvals\n\nSupportPilot Escalation Service",
                ticket_id=tid,
            )
            conn.execute(
                "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'approval_escalated_to_admin', 'system', %s)",
                (tid, Jsonb({"approval_id": aid, "hours_pending": 24, "sent_to": admin_email})),
            )
            log.warning("Approval #%s escalated to admin %s (>24h overdue)", aid, admin_email)

        # 4. Check failed-payment reminder after 2 days (Bug 20 fix: Spec Example 4)
        unpaid_tickets = conn.execute(
            """
            select t.id, t.customer_id, c.email as customer_email,
                   te.data->>'invoice_url' as invoice_url
            from tickets t
            join customers c on t.customer_id = c.id
            left join ticket_events te on te.ticket_id = t.id and te.kind = 'update_card_link_sent'
            where t.use_case = 'failed_payment'
              and t.status = 'waiting_for_customer'
              and t.created_at < now() - interval '2 days'
              and not exists (
                  select 1 from ticket_events
                  where ticket_id = t.id and kind = 'failed_payment_reminder_sent'
              )
            """
        ).fetchall()

        for ut in unpaid_tickets:
            tid = ut["id"]
            c_email = ut["customer_email"]
            inv_url = ut["invoice_url"] or f"{settings.cloudnotes_frontend_url}?billing=update"
            if c_email:
                emailer.send_once(
                    pool,
                    dedupe_key=f"failed_payment_reminder:{tid}",
                    to_email=c_email,
                    subject="Reminder: Please update payment card for CloudNotes",
                    text=f"Hello,\n\nThis is a friendly reminder to update your payment method for your CloudNotes subscription.\n"
                         f"Please use the following secure link to update your card:\n{inv_url}\n\n"
                         "Thank you,\nCloudNotes Billing Support",
                    ticket_id=tid,
                )
                conn.execute(
                    "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'failed_payment_reminder_sent', 'system', %s)",
                    (tid, Jsonb({"invoice_url": inv_url})),
                )
                log.info("Ticket #%s sent failed-payment reminder to %s", tid, c_email)

async def run_periodic_checks(pool):
    """Background task running every 20 seconds using threadpool (Medium fix)."""
    while True:
        try:
            await asyncio.to_thread(_perform_sync_checks, pool)
        except Exception:
            log.exception("Scheduler periodic checks encountered error")

        await asyncio.sleep(20)

def start_background_scheduler(pool):
    task = asyncio.create_task(run_periodic_checks(pool))
    return task

def stop_background_scheduler(task):
    if task:
        task.cancel()
