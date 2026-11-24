from dataclasses import dataclass

import stripe
from psycopg.types.json import Jsonb

from app.services.stripe_facts import _plain


@dataclass(frozen=True)
class ActionResult:
    status: str                 # done | already_done | rejected | failed | blocked
    reason: str = ""
    stripe_ref: str | None = None
    amount_cents: int = 0
    code: str = ""              # blocked ke case me: kill_switch, watching_mode, auto_mode_off, paused, over_limit, customer_limit, daily_cap


def refund_key(charge_id: str, amount_cents: int) -> str:
    """Same charge + same amount = same key, chahe kisi bhi ticket/chat se aaye.
    Isi key se humare DB me aur Stripe me, dono jagah duplicate rukta hai."""
    return f"refund:{charge_id}:{amount_cents}"


def _log(conn, ticket_id: int, kind: str, actor: str, data: dict) -> None:
    conn.execute(
        "insert into ticket_events (ticket_id, kind, actor, data) values (%s, %s, %s, %s)",
        (ticket_id, kind, actor, Jsonb(data)),
    )


CAP_TZ = "Asia/Kolkata"     # "aaj" ka din kis timezone me ginna hai


def _auto_guard(conn, stripe_customer_id: str, amount_cents: int, use_case: str | None = None):
    """Sirf AI-on-its-own (ai_auto) refunds ke liye. Caller ke paas global auto-lock hona chahiye,
    tabhi ye gine hue paise sach rehte hain. Blocked ho to (code, reason), warna None."""
    s = conn.execute(
        "select ai_enabled, watching_mode, auto_refund_limit_cents, daily_cap_cents, auto_refunds_paused, auto_mode "
        "from settings where id=1").fetchone()
    if not s["ai_enabled"]:
        return "kill_switch", "AI is switched off, so every action needs a human"
    if s["watching_mode"]:
        return "watching_mode", "Watching mode is on, so the AI may only suggest"
    # Is case type (duplicate_charge, refund, cancellation...) ke liye auto mode on hai? Default off.
    # use_case None = purane callers; Step 3 me orchestrator hamesha use_case dega.
    if use_case is not None and not (s["auto_mode"] or {}).get(use_case, False):
        return "auto_mode_off", f"Automatic mode is not enabled for '{use_case}' cases"
    if s["auto_refunds_paused"]:
        return "paused", "Automatic refunds are paused until an admin turns them back on"
    if amount_cents > s["auto_refund_limit_cents"]:
        return "over_limit", "Amount is above the automatic refund limit"

    recent = conn.execute(
        "select 1 from actions where type='refund' and status='done' and executed_by='ai_auto' "
        "and stripe_customer_id=%s and completed_at > now() - interval '30 days' limit 1",
        (stripe_customer_id,)).fetchone()
    if recent:
        return "customer_limit", "This customer already had an automatic refund in the last 30 days"

    today = conn.execute(
        "select coalesce(sum(amount_cents),0) as total from actions "
        "where type='refund' and status='done' and executed_by='ai_auto' "
        "and (completed_at at time zone %s)::date = (now() at time zone %s)::date",
        (CAP_TZ, CAP_TZ)).fetchone()["total"]
    if today + amount_cents > s["daily_cap_cents"]:
        conn.execute("update settings set auto_refunds_paused=true, updated_at=now() where id=1")
        return "daily_cap", "Daily automatic refund cap reached; automatic refunds are now paused"
    return None


def _finish(conn, action_id, ticket_id, actor, status, error=None, stripe_ref=None, data=None):
    conn.execute(
        "update actions set status=%s, error=%s, stripe_ref=%s, completed_at=now() where id=%s",
        (status, error, stripe_ref, action_id),
    )
    _log(conn, ticket_id, "action_done" if status == "done" else "action_failed", actor,
         {"action_id": action_id, "error": error, "stripe_ref": stripe_ref, **(data or {})})


def execute_refund(pool, *, ticket_id: int, stripe_customer_id: str, charge_id: str,
                   amount_cents: int, executed_by: str, approval_id: int | None = None,
                   use_case: str | None = None) -> ActionResult:
    """Refund karta hai, aur sirf ek hi baar.
    Order: (1) charge pe lock  (2) actions me row  (3) Stripe se dobara check
           (4) Stripe refund  (5) tabhi 'done' likhna jab Stripe 'succeeded' bole."""
    if amount_cents <= 0:
        return ActionResult("rejected", "Refund amount must be positive")

    key = refund_key(charge_id, amount_cents)

    with pool.connection() as conn:
        # (1) Is charge pe ek waqt me sirf ek hi kaam. Dusra yahin ruk jaata hai, transaction khatam hone tak.
        conn.execute("select pg_advisory_xact_lock(hashtext(%s))", (charge_id,))

        # (1b) AI-on-its-own refunds sab ek line me: cap ki ginti race se bachane ke liye
        if executed_by == "ai_auto":
            conn.execute("select pg_advisory_xact_lock(hashtext('auto_refund_global'))")

        # (2) Pehle se koi row hai?
        row = conn.execute("select id, status, stripe_ref from actions where idempotency_key=%s", (key,)).fetchone()
        if row and row["status"] == "done":
            return ActionResult("already_done", "This refund was already issued", row["stripe_ref"], amount_cents)
        if row:
            action_id = row["id"]       # pending/failed: pichli koshish adhuri thi, wahi key se dobara try
            conn.execute("update actions set status='pending', error=null, completed_at=null where id=%s", (action_id,))
        else:
            # (2b) Limits/kill switch dobara check, ab, paisa hilne se theek pehle
            if executed_by == "ai_auto":
                blocked = _auto_guard(conn, stripe_customer_id, amount_cents, use_case)
                if blocked:
                    code, reason = blocked
                    _log(conn, ticket_id, "action_blocked", executed_by,
                         {"code": code, "reason": reason, "charge_id": charge_id, "amount_cents": amount_cents})
                    return ActionResult("blocked", reason, code=code)
            action_id = conn.execute(
                "insert into actions (ticket_id, type, stripe_charge_id, stripe_customer_id, amount_cents, "
                "idempotency_key, executed_by, approval_id) "
                "values (%s, 'refund', %s, %s, %s, %s, %s, %s) returning id",
                (ticket_id, charge_id, stripe_customer_id, amount_cents, key, executed_by, approval_id),
            ).fetchone()["id"]

        # (3) Kaam se theek pehle Stripe se taaza facts
        try:
            charge = _plain(stripe.Charge.retrieve(charge_id))
        except stripe.StripeError as e:
            _finish(conn, action_id, ticket_id, executed_by, "failed", error=f"could not load charge: {e}")
            return ActionResult("failed", "Could not verify the charge with Stripe")

        problem = None
        if charge.get("customer") != stripe_customer_id:
            problem = "Charge does not belong to this customer"
        elif charge.get("status") != "succeeded" or not charge.get("paid", False):
            problem = "Charge was not successful"
        elif amount_cents > charge["amount"] - charge.get("amount_refunded", 0):
            problem = "Amount is more than what is still refundable on this charge"
        if problem:
            _finish(conn, action_id, ticket_id, executed_by, "failed", error=problem, data={"rejected": True})
            return ActionResult("rejected", problem)

        # (4) Asli refund. Stripe ko bhi wahi key, to retry pe wahi refund wapas milta hai.
        try:
            refund = _plain(stripe.Refund.create(charge=charge_id, amount=amount_cents, idempotency_key=key))
        except stripe.StripeError as e:
            _finish(conn, action_id, ticket_id, executed_by, "failed", error=str(e))
            return ActionResult("failed", "Stripe could not complete the refund")

        # (5) Customer ko "refunded" tabhi jab Stripe ne succeeded kaha
        if refund.get("status") != "succeeded":
            _finish(conn, action_id, ticket_id, executed_by, "failed",
                    error=f"stripe refund status: {refund.get('status')}", stripe_ref=refund.get("id"))
            return ActionResult("failed", "Stripe has not confirmed the refund yet", refund.get("id"))

        _finish(conn, action_id, ticket_id, executed_by, "done", stripe_ref=refund["id"],
                data={"charge_id": charge_id, "amount_cents": amount_cents})
        return ActionResult("done", "Refund completed", refund["id"], amount_cents)