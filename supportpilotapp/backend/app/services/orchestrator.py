"""Orchestrator: chat ka poora safar jodta hai.
message -> samjho -> Stripe se facts -> rules -> action / approval / hand-off -> sachcha jawab.

Ye generator hai: kaam karte hue 'status' events deta hai ("Checking your payments...")
aur aakhir me ek 'reply' event. Customer ko jo bhi dikhta hai wo replies.py se aata hai.
Identity ticket ki customer_ref se aati hai (login se bani), customer ke text se kabhi nahi.
"""
import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Iterator

from psycopg.types.json import Jsonb

from app.core.config import settings
from app.db.pool import pool
from app.domain.decisions import Outcome
from app.services import actions, email_templates, emailer, limits, replies
from app.services.actions import _log
from app.services.limits import load_history, load_limits
from app.services.planner import plan_refund, route
from app.services.stripe_facts import CustomerNotLinked, fetch_charge_facts, get_stripe_customer_id
from app.services.understand import forced_handoff_reason, understand

log = logging.getLogger(__name__)

HELD = ("waiting_for_approval", "needs_human", "waiting_for_agent")   # kisi insaan ke paas
APPROVAL_HOURS = 48


# ---------- chhote helpers ----------

def _status(text: str) -> dict:
    return {"type": "status", "text": text}


def _end(ticket_id: int, text: str, status: str, **cols) -> dict:
    """Jawab ko DB me likhta hai aur ticket ka status badalta hai, ek hi transaction me.
    Customer ko status update email bhejta hai only on distinct major status transitions."""
    with pool.connection() as conn:
        msg_id = conn.execute(
            "insert into messages (ticket_id, sender, content) values (%s, 'ai', %s) returning id",
            (ticket_id, text),
        ).fetchone()["id"]
        _log(conn, ticket_id, "ai_reply", "ai",
             {"text": text, "ticket_status": status, **{k: v for k, v in cols.items() if v}})
        t = conn.execute(
            "update tickets set status=%s, use_case=coalesce(%s, use_case), "
            "resolved_by=coalesce(%s, resolved_by), handoff_reason=coalesce(%s, handoff_reason), "
            "updated_at=now() where id=%s returning customer_id, customer_ref",
            (status, cols.get("use_case"), cols.get("resolved_by"), cols.get("handoff_reason"), ticket_id)).fetchone()

        # Bug 19 fix: Email only on terminal or critical waiting states, never during live chat or waiting_for_agent
        EMAILABLE_STATUSES = {"resolved_by_ai", "needs_human", "waiting_for_customer", "waiting_for_approval"}
        if t and t["customer_id"] and status in EMAILABLE_STATUSES:
            cust = conn.execute("select email from customers where id=%s", (t["customer_id"],)).fetchone()
            if cust and cust["email"]:
                tpl = email_templates.for_status(ticket_id, status, text)
                if tpl:
                    subject, body = tpl
                    emailer.send_once(
                        pool,
                        dedupe_key=f"customer_email:{ticket_id}:{status}",
                        to_email=cust["email"],
                        subject=subject,
                        text=body,
                        ticket_id=ticket_id,
                    )

    return {"type": "reply", "text": text, "ticket_status": status, "message_id": msg_id}


def _handoff(ticket_id: int, reason: str) -> dict:
    """Bug 11 & 16 fix: If an online agent is available, transition to waiting_for_agent.
    Do not announce agent name until agent actually clicks Accept in live console."""
    with pool.connection() as conn:
        online = conn.execute(
            "select id, name from staff_users where role in ('agent', 'admin') and availability = 'available' "
            "and (last_seen_at > now() - interval '30 minutes' or last_seen_at is null) "
            "order by last_seen_at desc nulls last limit 1"
        ).fetchone()

    if online:
        msg = "Connecting you to an agent from our support team. Please hold on..."
        return _end(ticket_id, msg, "waiting_for_agent", handoff_reason=reason)

    return _end(ticket_id, replies.handoff(ticket_id), "needs_human", handoff_reason=reason)


def _save_understanding(ticket_id: int, data: dict) -> None:
    with pool.connection() as conn:
        conn.execute("update tickets set ai_understanding=%s, updated_at=now() where id=%s", (Jsonb(data), ticket_id))
        _log(conn, ticket_id, "understanding", "ai", data)


def _request_approval(ticket_id, charge, amount_cents, use_case, rule, reason, is_dup, also, action_type="refund", mode=None) -> dict:
    """Bug 9, 12, 14, 16 fix: Generates approval with proper action_type (refund / cancel_subscription),
    resolves approver email dynamically from settings/staff, and uses 48-hour expiration."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    charge_id = charge.charge_id if charge else None
    evidence = {"charge_id": charge_id, "amount_cents": amount_cents, "rule": rule, "reason": reason}
    if mode:
        evidence["mode"] = mode

    suggestion = f"Cancel subscription ({rule}): {reason}" if action_type == "cancel_subscription" else f"Refund {replies.money(amount_cents)} ({rule}): {reason}"

    with pool.connection() as conn:
        # Dynamic approver email resolution from settings or staff
        stg = conn.execute("select approver_emails from settings where id=1").fetchone()
        approver_email = None
        if stg and stg.get("approver_emails"):
            emails = [e for e in stg["approver_emails"] if e and e.strip()]
            if emails:
                approver_email = emails[0].strip()
        if not approver_email:
            approver_user = conn.execute(
                "select email from staff_users where role = 'approver' order by id limit 1"
            ).fetchone()
            if approver_user and approver_user.get("email"):
                approver_email = approver_user["email"].strip()
        # Bug 3 fix: Settings aur staff dono khaali ho to approval admin ko bhejo (never hardcoded anita)
        if not approver_email:
            admin_user = conn.execute(
                "select email from staff_users where role = 'admin' order by id limit 1"
            ).fetchone()
            if admin_user and admin_user.get("email"):
                approver_email = admin_user["email"].strip()
            else:
                approver_email = "admin@cloudnotes.com"

        evidence["approver_email"] = approver_email

        row = conn.execute(
            "insert into approvals (ticket_id, action_type, stripe_charge_id, amount_cents, evidence, "
            "ai_suggestion, token_hash, approver_email, expires_at) "
            "values (%s, %s, %s, %s, %s, %s, %s, %s, now() + make_interval(hours => %s)) "
            "on conflict (stripe_charge_id, action_type) "
            "where status='pending' and stripe_charge_id is not null do nothing returning id",
            (ticket_id, action_type, charge_id, amount_cents, Jsonb(evidence),
             suggestion, token_hash, approver_email, APPROVAL_HOURS),
        ).fetchone()
        is_new = row is not None
        if not is_new:
            row = conn.execute(
                "select id from approvals where stripe_charge_id=%s and action_type=%s and status='pending'",
                (charge_id, action_type)).fetchone()
            # Ensure approver_email is recorded
            conn.execute(
                "update approvals set approver_email = coalesce(approver_email, %s) where id = %s",
                (approver_email, row["id"]),
            )
        approval_id = row["id"]
        _log(conn, ticket_id, "approval_requested", "ai",
             {"approval_id": approval_id, "new": is_new, "action_type": action_type, **evidence})

    # Dispatch email to approver with raw token link
    approval_link = f"{settings.frontend_url}/approve?token={raw_token}"
    action_label = "Cancellation" if action_type == "cancel_subscription" else f"Refund {replies.money(amount_cents)}"
    emailer.send_once(
        pool,
        dedupe_key=f"approval_req:{approval_id}",
        to_email=approver_email,
        subject=f"Approval Required: {action_label} for Ticket #{ticket_id}",
        text=f"Hello Approver,\n\nSupportPilot requested approval for {action_label}.\n"
             f"Rule: {rule}\nReason: {reason}\n\n"
             f"Click to review and decide in SupportPilot:\n{approval_link}\n\n"
             f"This link expires in 48 hours.\n\nSupportPilot Automated Operations",
        ticket_id=ticket_id,
    )

    if action_type == "cancel_subscription":
        text = replies.cancellation_needs_approval(amount_cents, ticket_id) + also
    else:
        text = replies.needs_approval(amount_cents, ticket_id, is_dup) + also
    return _end(ticket_id, text, "waiting_for_approval", use_case=use_case)



# ---------- main flow ----------

def run(ticket_id: int) -> Iterator[dict]:
    """Bahar se yahi bulate hain. Kuch bhi toot jaye to customer ko sach bolte hain:
    'ticket saved, team dekhegi', kabhi 'ho gaya' nahi."""
    try:
        yield from _run(ticket_id)
    except Exception:
        log.exception("orchestrator failed for ticket %s", ticket_id)
        try:
            yield _end(ticket_id, replies.system_error(ticket_id), "needs_human", handoff_reason="system error")
        except Exception:
            log.exception("could not even record the error for ticket %s", ticket_id)
            yield {"type": "reply", "text": replies.system_error(ticket_id), "ticket_status": "needs_human"}


def _run(ticket_id: int) -> Iterator[dict]:
    with pool.connection() as conn:
        t = conn.execute("select id, status, customer_ref, assigned_agent_id from tickets where id=%s", (ticket_id,)).fetchone()
        msgs = conn.execute("select sender, content from messages where ticket_id=%s order by id", (ticket_id,)).fetchall()
        prior_unclear = conn.execute(
            "select count(*) as n from ticket_events where ticket_id=%s and kind='unclear_try'",
            (ticket_id,)).fetchone()["n"]

    # Bug 21 & 17 fix: If human agent accepted, AI must stay silent; if in queue waiting, reassure customer
    if t.get("assigned_agent_id") is not None:
        yield {"type": "done", "ticket_status": t["status"]}
        return

    if t["status"] == "waiting_for_agent":
        yield {
            "type": "reply",
            "text": "Thanks for your patience! Your message has been received and our next available support agent will assist you shortly.",
            "ticket_status": "waiting_for_agent",
        }
        return

    # Ticket pehle se insaan ke paas hai: dobara process nahi, bas sach status
    if t["status"] in HELD:
        yield _end(ticket_id, replies.held(t["status"], ticket_id), t["status"])
        return

    text, history = msgs[-1]["content"], msgs[:-1]

    # Seedhe hand-off wale shabd: LLM ko bulane ki zarurat nahi
    forced = forced_handoff_reason(text)
    if forced:
        _save_understanding(ticket_id, {"forced_handoff": forced})
        yield _handoff(ticket_id, forced)
        return

    yield _status("Reading your message…")
    u = understand(history, text)
    _save_understanding(ticket_id, u.model_dump())

    r = route(u, prior_unclear)
    if r.kind == "handoff":
        yield _handoff(ticket_id, r.reason)
    elif r.kind == "ask":
        with pool.connection() as conn:
            _log(conn, ticket_id, "unclear_try", "ai", {"question": r.question})
        yield _end(ticket_id, replies.ask_question(r.question, text), "open")
    elif r.kind == "unsupported":
        yield _end(ticket_id, replies.not_automatic_yet(ticket_id), "needs_human",
                   use_case=r.use_case, handoff_reason=f"{r.intent} is not handled automatically yet")
    else:
        yield from _handle_refund(ticket_id, t["customer_ref"], r, u)


def _handle_refund(ticket_id: int, user_id: str, r, u=None) -> Iterator[dict]:
    with pool.connection() as conn:
        try:
            scid = get_stripe_customer_id(conn, user_id)
        except CustomerNotLinked:
            scid = None
    if scid is None:
        yield _end(ticket_id, replies.not_linked(), "open", use_case=r.use_case)
        return

    yield _status("Checking your payments…")
    charges = fetch_charge_facts(scid)          # Stripe se, customer ke shabdon se nahi
    now = datetime.now(timezone.utc)
    with pool.connection() as conn:
        # Bug 22 fix: Problem 8 Unusual Activity detection
        unusual = limits.detect_unusual_activity(conn, scid, ticket_id)
        if unusual:
            _log(conn, ticket_id, "unusual_activity_detected", "ai", unusual)
            yield _end(
                ticket_id,
                "Your request has been routed to our senior support team for review due to multiple recent activities on your account. An agent will follow up with you shortly.",
                "needs_human",
                handoff_reason=f"unusual_activity: {unusual['reason']}",
            )
            return

        limits_data = load_limits(conn, r.use_case)
        history = load_history(conn, scid)
        conn.execute("update tickets set stripe_customer_id=%s where id=%s and stripe_customer_id is null",
                     (scid, ticket_id))
        _log(conn, ticket_id, "facts_checked", "system", {"charges": [
            {"charge_id": c.charge_id, "amount_cents": c.amount_cents,
             "refunded_cents": c.refunded_cents, "created_at": c.created_at.isoformat()}
            for c in charges[:10]]})

    wants_imm = getattr(u, "wants_immediate_cancel", False) if u else False
    plan = plan_refund(r.intent, charges, history, limits_data, now, wants_immediate=wants_imm)
    d = plan.decision
    with pool.connection() as conn:
        _log(conn, ticket_id, "rule_decision", "system", {
            "intent": r.intent, "plan": plan.kind,
            "charge_id": plan.charge.charge_id if plan.charge else None,
            "outcome": d.outcome.value if d else None, "rule": d.rule if d else None,
            "reason": d.reason if d else None, "amount_cents": d.amount_cents if d else 0})

    also = replies.also_mentioned(r.also) if r.also else ""
    is_dup = r.intent == "duplicate_charge"

    if plan.kind == "no_payments":
        yield _end(ticket_id, replies.no_payments_found(), "open", use_case=r.use_case)
        return
    if plan.kind == "no_duplicate":
        yield _end(ticket_id, replies.no_duplicate_found(), "open", use_case=r.use_case)
        return

    # Bug 7, 8, 9, 10 fix: Handle cancellation action with strict result validation
    if r.intent == "cancel_subscription":
        mode = "immediate" if d.rule == "CANCEL_IMMEDIATE_PARTIAL_REFUND" else "period_end"
        if d.outcome == Outcome.BLOCK:
            yield _end(ticket_id, replies.declined(d.rule, ticket_id) + also, "resolved_by_ai",
                       use_case=r.use_case, resolved_by="ai")
            return
        if d.outcome == Outcome.NEEDS_APPROVAL:
            yield _request_approval(ticket_id, plan.charge, d.amount_cents, r.use_case, d.rule, d.reason, False, also,
                                   action_type="cancel_subscription", mode=mode)
            return

        yield _status("Processing your cancellation…")
        res = actions.execute_cancellation(
            pool, ticket_id=ticket_id, stripe_customer_id=scid, mode=mode,
            refund_amount_cents=d.amount_cents, charge_id=plan.charge.charge_id if plan.charge else None,
            executed_by="ai_auto"
        )
        if res.status not in ("done", "already_done"):
            # Bug 7 fix: Never say it's done until it is done
            yield _end(
                ticket_id,
                f"We encountered an issue while processing your cancellation ({res.message}). I have transferred this to our support team to complete manually for you.",
                "needs_human",
                use_case="cancellation",
            )
            return

        from datetime import timedelta
        if mode == "period_end":
            if wants_imm and plan.charge and (now - plan.charge.created_at > timedelta(days=30)):
                reply_text = (
                    "Because your latest payment is older than 30 days, an immediate refund cannot be issued. "
                    "However, your subscription has been successfully scheduled to cancel at the end of your current billing period. "
                    "You will retain full access until then with no further charges."
                )
            else:
                reply_text = "Your subscription has been scheduled to cancel at the end of your current billing period. You retain full access until then."
        else:
            refund_note = f", and a refund of {replies.money(d.amount_cents)} for the unused portion has been issued" if d.amount_cents > 0 else ""
            reply_text = f"Your subscription has been cancelled immediately{refund_note}."

        yield _end(ticket_id, reply_text + also, "resolved_by_ai", use_case="cancellation", resolved_by="ai")
        return

    if d.outcome == Outcome.BLOCK:
        yield _end(ticket_id, replies.declined(d.rule, ticket_id) + also, "resolved_by_ai",
                   use_case=r.use_case, resolved_by="ai")
        return

    if d.outcome == Outcome.NEEDS_APPROVAL:
        yield _request_approval(ticket_id, plan.charge, d.amount_cents, r.use_case, d.rule, d.reason, is_dup, also)
        return

    # ALLOW: AI khud karega. execute_refund Stripe se dobara check karke hi paisa hilata hai.
    yield _status("Processing your refund…")
    res = actions.execute_refund(
        pool, ticket_id=ticket_id, stripe_customer_id=scid, charge_id=plan.charge.charge_id,
        amount_cents=d.amount_cents, executed_by="ai_auto", use_case=r.use_case)

    if res.status == "done":
        yield _end(ticket_id, replies.refund_done(res.amount_cents, is_dup) + also, "resolved_by_ai",
                   use_case=r.use_case, resolved_by="ai")
    elif res.status == "already_done":
        yield _end(ticket_id, replies.refund_already_done(res.amount_cents) + also, "resolved_by_ai",
                   use_case=r.use_case, resolved_by="ai")
    elif res.status == "blocked":      # lock ke andar limit/cap lag gaya: insaan decide karega
        yield _request_approval(ticket_id, plan.charge, d.amount_cents, r.use_case, res.code, res.reason, is_dup, also)
    else:                              # rejected / failed: "ho gaya" kabhi nahi bolte
        yield _end(ticket_id, replies.action_failed(ticket_id), "needs_human", use_case=r.use_case,
                   handoff_reason=f"refund {res.status}: {res.reason}")
