from datetime import datetime, timedelta

from app.domain.decisions import Decision, Outcome
from app.domain.facts import ChargeFacts, CustomerHistory, Limits

DUPLICATE_WINDOW = timedelta(days=60)
FULL_REFUND_WINDOW = timedelta(days=7)
PARTIAL_REFUND_WINDOW = timedelta(days=30)


def _check_aware(now: datetime, charge: ChargeFacts) -> None:
    """Safety check: dono datetime me timezone hona chahiye, warna turant error."""
    if now.tzinfo is None or charge.created_at.tzinfo is None:
        raise ValueError("datetimes must be timezone-aware")


def refundable_cents(charge: ChargeFacts) -> int:
    """Kitna refund abhi baaki hai: original amount minus pehle ka refund. Kabhi negative nahi."""
    return max(charge.amount_cents - charge.refunded_cents, 0)


def unused_cents(charge: ChargeFacts, now: datetime) -> int:
    """Partial refund ka hisaab: amount x bacha hua time / poora period.
    Integer math hai aur neeche round hota hai, taaki float ki galti na aaye."""
    if charge.period_start is None or charge.period_end is None:
        return 0
    total = int((charge.period_end - charge.period_start).total_seconds())
    left = int((charge.period_end - now).total_seconds())
    if total <= 0 or left <= 0:
        return 0
    left = min(left, total)
    amount = charge.amount_cents * left // total
    return min(amount, refundable_cents(charge))


def _switch_check(amount, rule, limits: Limits) -> Decision | None:
    """Teen switches jo HAR automatic action pe lagte hain (paisa ho ya na ho):
    kill switch, watching mode, aur is case type ka auto mode.
    Koi fail ho to NEEDS_APPROVAL lautata hai, sab theek ho to None."""
    checks = [
        (not limits.ai_enabled, "AI_SWITCHED_OFF", "AI is switched off"),
        (limits.watching_mode, "WATCHING_MODE", "Watching mode: AI only suggests"),
        (not limits.auto_mode_for_case, "AUTO_MODE_OFF", "Automatic mode is off for this case type"),
    ]
    for failed, gate_rule, gate_reason in checks:
        if failed:
            return Decision(Outcome.NEEDS_APPROVAL, gate_rule, f"{gate_reason} (eligible under {rule})", amount)
    return None


def _gate(amount, rule, reason, history: CustomerHistory, limits: Limits) -> Decision:
    """Paisa jaane wale action ka gate. Pehle switches, phir $50 limit,
    30-din me ek auto refund, aur daily cap. Ek bhi fail to NEEDS_APPROVAL,
    sab pass hone par hi ALLOW."""
    blocked = _switch_check(amount, rule, limits)
    if blocked:
        return blocked
    checks = [
        (amount > limits.auto_refund_limit_cents, "OVER_AUTO_LIMIT", "Amount is above the automatic limit"),
        (history.auto_refund_in_last_30_days, "ONE_AUTO_REFUND_PER_30_DAYS", "Customer already had an automatic refund in the last 30 days"),
        (limits.auto_refunded_today_cents + amount > limits.daily_cap_cents, "DAILY_CAP", "Daily automatic refund cap would be exceeded"),
    ]
    for failed, gate_rule, gate_reason in checks:
        if failed:
            return Decision(Outcome.NEEDS_APPROVAL, gate_rule, f"{gate_reason} (eligible under {rule})", amount)
    return Decision(Outcome.ALLOW, rule, reason, amount)


def _gate_no_money(rule, reason, limits: Limits) -> Decision:
    """Jis action me paisa nahi jaata (cancel at period end, card link):
    sirf teen switches dekhta hai. Limit ya 30-din ka rule yahan nahi lagta."""
    return _switch_check(0, rule, limits) or Decision(Outcome.ALLOW, rule, reason, 0)


def decide_refund_request(charge, history, limits, now) -> Decision:
    """Customer ne refund maanga (use case 4). Charge kitna purana hai us hisaab se amount nikalta hai:
    7 din tak full, 8 se 30 din tak unused hissa, uske baad BLOCK."""
    _check_aware(now, charge)
    refundable = refundable_cents(charge)
    if refundable == 0:
        return Decision(Outcome.BLOCK, "ALREADY_REFUNDED", "This payment is already fully refunded")

    age = max(now - charge.created_at, timedelta(0))
    if age <= FULL_REFUND_WINDOW:
        return _gate(refundable, "REFUND_FULL_7_DAYS", "Payment is within 7 days: full refund", history, limits)
    if age <= PARTIAL_REFUND_WINDOW:
        amount = unused_cents(charge, now)
        if amount == 0:
            return Decision(Outcome.BLOCK, "NO_UNUSED_PORTION", "No unused part of the period is left to refund")
        return _gate(amount, "REFUND_PARTIAL_30_DAYS", "Payment is 8 to 30 days old: refund for the unused part", history, limits)
    return Decision(Outcome.BLOCK, "REFUND_WINDOW_EXPIRED", "Payment is older than 30 days")


def decide_duplicate_refund(charge, history, limits, now) -> Decision:
    """Duplicate charge (use case 1). 60 din ke andar full refund banta hai, uske baad BLOCK.
    Duplicate asli hai ya nahi, ye yahan check nahi hota, wo Stripe se facts nikalte waqt hoga."""
    _check_aware(now, charge)
    refundable = refundable_cents(charge)
    if refundable == 0:
        return Decision(Outcome.BLOCK, "ALREADY_REFUNDED", "This payment is already fully refunded")
    if now - charge.created_at > DUPLICATE_WINDOW:
        return Decision(Outcome.BLOCK, "DUPLICATE_WINDOW_EXPIRED", "Duplicate was reported after 60 days")
    return _gate(refundable, "DUPLICATE_FULL_REFUND", "Confirmed duplicate charge: full refund", history, limits)


def decide_cancellation(charge, wants_immediate, history, limits, now) -> Decision:
    """Cancel request (use case 2).
    Default: plan period ke end tak chalta hai, koi refund nahi.
    Turant cancel + partial refund sirf tab jab customer maange aur last payment 30 din ke andar ho."""
    _check_aware(now, charge)
    if not wants_immediate:
        return _gate_no_money("CANCEL_AT_PERIOD_END", "Plan ends at the end of the current billing period", limits)

    if now - charge.created_at > PARTIAL_REFUND_WINDOW:
        return _gate_no_money(
            "CANCEL_AT_PERIOD_END",
            "Payment is older than 30 days so immediate refund cannot be issued; subscription cancelled at period end",
            limits,
        )

    amount = unused_cents(charge, now)
    if amount == 0:
        return _gate_no_money("CANCEL_AT_PERIOD_END", "Nothing left to refund, plan ends at the end of the billing period", limits)
    return _gate(amount, "CANCEL_IMMEDIATE_PARTIAL_REFUND", "Immediate cancellation with refund for the unused part", history, limits)


def decide_failed_payment_link(limits) -> Decision:
    """Payment fail hua (use case 3): customer ko card update karne ka link bhejna.
    Paisa nahi jaata, to sirf switches dekhte hain."""
    return _gate_no_money("SEND_UPDATE_CARD_LINK", "Send the customer a secure link to update their card", limits)


ALWAYS_HUMAN = {"dispute", "account_deletion", "payment_details_change"}


def decide_always_human(kind: str) -> Decision:
    """Dispute, account deletion aur payment details badalna: hamesha human, kabhi automatic nahi.
    Koi aur kind aaye to ValueError, taaki galti chupke se na nikal jaaye."""
    if kind not in ALWAYS_HUMAN:
        raise ValueError(f"unknown kind: {kind}")
    return Decision(Outcome.HUMAN_ONLY, f"ALWAYS_HUMAN_{kind.upper()}", f"{kind} is always handled by a human, never automatically")