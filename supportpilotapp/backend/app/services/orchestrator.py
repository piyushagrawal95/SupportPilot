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

from app.db.pool import pool
from app.domain.decisions import Outcome
from app.services import actions,email_templates,emailer, replies
from app.services.actions import _log
from app.services.limits import load_history, load_limits
from app.services.planner import plan_refund, route
from app.services.stripe_facts import CustomerNotLinked, fetch_charge_facts, get_stripe_customer_id
from app.services.understand import forced_handoff_reason, understand

log = logging.getLogger(__name__)

HELD = ("waiting_for_approval", "needs_human", "waiting_for_agent")   # kisi insaan ke paas
APPROVAL_HOURS = 24


# ---------- chhote helpers ----------

def _status(text: str) -> dict:
    return {"type": "status", "text": text}


def _end(ticket_id: int, text: str, status: str, **cols) -> dict:
    """Jawab ko DB me likhta hai aur ticket ka status badalta hai, ek hi transaction me.
    cols: use_case, resolved_by, handoff_reason (jo None nahi, wahi badalte hain)."""
    with pool.connection() as conn:
        conn.execute("insert into messages (ticket_id, sender, content) values (%s, 'ai', %s)", (ticket_id, text))
        _log(conn, ticket_id, "ai_reply", "ai",
             {"text": text, "ticket_status": status, **{k: v for k, v in cols.items() if v}})
        conn.execute(
            "update tickets set status=%s, use_case=coalesce(%s, use_case), "
            "resolved_by=coalesce(%s, resolved_by), handoff_reason=coalesce(%s, handoff_reason), "
            "updated_at=now() where id=%s",
            (status, cols.get("use_case"), cols.get("resolved_by"), cols.get("handoff_reason"), ticket_id))
    return {"type": "reply", "text": text, "ticket_status": status}


def _handoff(ticket_id: int, reason: str) -> dict:
    # Live agent wala flow baad ke step me aayega. Abhi: ticket 'needs_human' me, email se jawab.
    return _end(ticket_id, replies.handoff(ticket_id), "needs_human", handoff_reason=reason)


def _save_understanding(ticket_id: int, data: dict) -> None:
    with pool.connection() as conn:
        conn.execute("update tickets set ai_understanding=%s, updated_at=now() where id=%s", (Jsonb(data), ticket_id))
        _log(conn, ticket_id, "understanding", "ai", data)


def _request_approval(ticket_id, charge, amount_cents, use_case, rule, reason, is_dup, also) -> dict:
    """Insaan ke approval ke liye row banata hai. Ek charge ke liye ek hi pending approval
    (DB ka unique index). Asli email-token baad me bhejte waqt banega, abhi sirf hash rakha hai."""
    token_hash = hashlib.sha256(secrets.token_urlsafe(32).encode()).hexdigest()
    evidence = {"charge_id": charge.charge_id, "amount_cents": amount_cents, "rule": rule, "reason": reason}
    with pool.connection() as conn:
        row = conn.execute(
            "insert into approvals (ticket_id, action_type, stripe_charge_id, amount_cents, evidence, "
            "ai_suggestion, token_hash, expires_at) "
            "values (%s, 'refund', %s, %s, %s, %s, %s, now() + make_interval(hours => %s)) "
            "on conflict (stripe_charge_id, action_type) "
            "where status='pending' and stripe_charge_id is not null do nothing returning id",
            (ticket_id, charge.charge_id, amount_cents, Jsonb(evidence),
             f"Refund {replies.money(amount_cents)} ({rule}): {reason}", token_hash, APPROVAL_HOURS),
        ).fetchone()
        is_new = row is not None
        if not is_new:
            row = conn.execute(
                "select id from approvals where stripe_charge_id=%s and action_type='refund' and status='pending'",
                (charge.charge_id,)).fetchone()
        _log(conn, ticket_id, "approval_requested", "ai",
             {"approval_id": row["id"], "new": is_new, **evidence})
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
        t = conn.execute("select id, status, customer_ref from tickets where id=%s", (ticket_id,)).fetchone()
        msgs = conn.execute("select sender, content from messages where ticket_id=%s order by id", (ticket_id,)).fetchall()
        prior_unclear = conn.execute(
            "select count(*) as n from ticket_events where ticket_id=%s and kind='unclear_try'",
            (ticket_id,)).fetchone()["n"]

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
        yield _end(ticket_id, replies.ask_question(r.question), "open")
    elif r.kind == "unsupported":
        yield _end(ticket_id, replies.not_automatic_yet(ticket_id), "needs_human",
                   use_case=r.use_case, handoff_reason=f"{r.intent} is not handled automatically yet")
    else:
        yield from _handle_refund(ticket_id, t["customer_ref"], r)


def _handle_refund(ticket_id: int, user_id: str, r) -> Iterator[dict]:
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
        limits = load_limits(conn, r.use_case)
        history = load_history(conn, scid)
        conn.execute("update tickets set stripe_customer_id=%s where id=%s and stripe_customer_id is null",
                     (scid, ticket_id))
        _log(conn, ticket_id, "facts_checked", "system", {"charges": [
            {"charge_id": c.charge_id, "amount_cents": c.amount_cents,
             "refunded_cents": c.refunded_cents, "created_at": c.created_at.isoformat()}
            for c in charges[:10]]})

    plan = plan_refund(r.intent, charges, history, limits, now)
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