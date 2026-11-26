from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest

from app.domain.decisions import Outcome
from app.domain.facts import ChargeFacts, CustomerHistory, Limits
from app.domain.policy import (
    decide_always_human,
    decide_cancellation,
    decide_duplicate_refund,
    decide_failed_payment_link,
    decide_refund_request,
)

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)


def charge(days_old, amount=2000, refunded=0, period_days=30):
    """Ek payment jo `days_old` din pehle hui, aur 30 din ke period ki hai."""
    created = NOW - timedelta(days=days_old)
    return ChargeFacts(
        "ch_1", amount, refunded, created,
        period_start=created, period_end=created + timedelta(days=period_days),
    )


CLEAN_HISTORY = CustomerHistory(auto_refund_in_last_30_days=False)
LIMITS = Limits(
    auto_refund_limit_cents=5000, daily_cap_cents=50000, auto_refunded_today_cents=0,
    ai_enabled=True, watching_mode=False, auto_mode_for_case=True,
)


# ---------- Refund request (use case 4) ----------

def test_refund_within_7_days_is_full_and_allowed():
    d = decide_refund_request(charge(3), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule, d.amount_cents) == (Outcome.ALLOW, "REFUND_FULL_7_DAYS", 2000)


def test_refund_on_day_7_exactly_is_still_full():
    d = decide_refund_request(charge(7), CLEAN_HISTORY, LIMITS, NOW)
    assert d.rule == "REFUND_FULL_7_DAYS"


def test_refund_on_day_8_is_partial_for_unused_part():
    # 8 din purana, 30 din ka period: 22 din bache -> 2000 * 22 / 30 = 1466
    d = decide_refund_request(charge(8), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule, d.amount_cents) == (Outcome.ALLOW, "REFUND_PARTIAL_30_DAYS", 1466)


def test_refund_on_day_30_exactly_is_still_partial():
    d = decide_refund_request(charge(30, period_days=60), CLEAN_HISTORY, LIMITS, NOW)
    assert d.rule == "REFUND_PARTIAL_30_DAYS"


def test_refund_after_30_days_is_blocked():
    d = decide_refund_request(charge(31), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.BLOCK, "REFUND_WINDOW_EXPIRED")


def test_refund_blocked_when_period_already_over():
    d = decide_refund_request(charge(20, period_days=10), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.BLOCK, "NO_UNUSED_PORTION")


def test_refund_blocked_when_already_fully_refunded():
    d = decide_refund_request(charge(2, refunded=2000), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.BLOCK, "ALREADY_REFUNDED")


def test_refund_never_exceeds_what_is_left_after_partial_refund():
    d = decide_refund_request(charge(2, refunded=500), CLEAN_HISTORY, LIMITS, NOW)
    assert d.amount_cents == 1500


# ---------- Duplicate charge (use case 1) ----------

def test_duplicate_under_limit_is_allowed_in_full():
    d = decide_duplicate_refund(charge(1), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule, d.amount_cents) == (Outcome.ALLOW, "DUPLICATE_FULL_REFUND", 2000)


def test_duplicate_works_even_after_day_30_if_within_60():
    d = decide_duplicate_refund(charge(45), CLEAN_HISTORY, LIMITS, NOW)
    assert d.outcome == Outcome.ALLOW


def test_duplicate_after_60_days_is_blocked():
    d = decide_duplicate_refund(charge(61), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.BLOCK, "DUPLICATE_WINDOW_EXPIRED")


def test_duplicate_above_50_dollars_needs_approval():
    d = decide_duplicate_refund(charge(1, amount=8000), CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule, d.amount_cents) == (Outcome.NEEDS_APPROVAL, "OVER_AUTO_LIMIT", 8000)


def test_duplicate_of_exactly_50_dollars_is_allowed():
    d = decide_duplicate_refund(charge(1, amount=5000), CLEAN_HISTORY, LIMITS, NOW)
    assert d.outcome == Outcome.ALLOW


def test_second_automatic_refund_in_30_days_needs_approval():
    history = CustomerHistory(auto_refund_in_last_30_days=True)
    d = decide_duplicate_refund(charge(1), history, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "ONE_AUTO_REFUND_PER_30_DAYS")


# ---------- Daily cap, kill switch, watching mode, auto mode ----------

def test_daily_cap_stops_automatic_refunds():
    limits = replace(LIMITS, auto_refunded_today_cents=49000)
    d = decide_duplicate_refund(charge(1), CLEAN_HISTORY, limits, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "DAILY_CAP")


def test_daily_cap_allows_refund_that_fits_exactly():
    limits = replace(LIMITS, auto_refunded_today_cents=48000)
    d = decide_duplicate_refund(charge(1), CLEAN_HISTORY, limits, NOW)
    assert d.outcome == Outcome.ALLOW


def test_kill_switch_sends_refund_to_humans():
    limits = replace(LIMITS, ai_enabled=False)
    d = decide_duplicate_refund(charge(1), CLEAN_HISTORY, limits, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "AI_SWITCHED_OFF")


def test_watching_mode_never_allows_automatic_action():
    limits = replace(LIMITS, watching_mode=True)
    d = decide_refund_request(charge(2), CLEAN_HISTORY, limits, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "WATCHING_MODE")


def test_auto_mode_off_for_case_type_needs_approval():
    limits = replace(LIMITS, auto_mode_for_case=False)
    d = decide_duplicate_refund(charge(1), CLEAN_HISTORY, limits, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "AUTO_MODE_OFF")


def test_blocked_stays_blocked_even_with_all_switches_off():
    limits = replace(LIMITS, ai_enabled=False, watching_mode=True)
    d = decide_refund_request(charge(40), CLEAN_HISTORY, limits, NOW)
    assert d.outcome == Outcome.BLOCK


# ---------- Cancellation (use case 2) ----------

def test_default_cancel_ends_at_period_end_with_no_refund():
    d = decide_cancellation(charge(10), False, CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule, d.amount_cents) == (Outcome.ALLOW, "CANCEL_AT_PERIOD_END", 0)


def test_immediate_cancel_within_30_days_refunds_unused_part():
    # 10 din purana, 20 din bache -> 2000 * 20 / 30 = 1333
    d = decide_cancellation(charge(10), True, CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule, d.amount_cents) == (Outcome.ALLOW, "CANCEL_IMMEDIATE_PARTIAL_REFUND", 1333)


def test_immediate_cancel_after_30_days_is_blocked():
    # Customer requested immediate cancel after 30 days: refund blocked, but defaults to cancel at period end
    d = decide_cancellation(charge(40), True, CLEAN_HISTORY, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.ALLOW, "CANCEL_AT_PERIOD_END")


def test_cancel_at_period_end_ignores_the_refund_rules():
    # pehle auto refund mil chuka hai, par period-end cancel me paisa nahi jaata, to allowed
    history = CustomerHistory(auto_refund_in_last_30_days=True)
    d = decide_cancellation(charge(10), False, history, LIMITS, NOW)
    assert d.outcome == Outcome.ALLOW


def test_immediate_cancel_with_refund_obeys_refund_rules():
    history = CustomerHistory(auto_refund_in_last_30_days=True)
    d = decide_cancellation(charge(10), True, history, LIMITS, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "ONE_AUTO_REFUND_PER_30_DAYS")


def test_kill_switch_also_stops_cancellation():
    limits = replace(LIMITS, ai_enabled=False)
    d = decide_cancellation(charge(10), False, CLEAN_HISTORY, limits, NOW)
    assert (d.outcome, d.rule) == (Outcome.NEEDS_APPROVAL, "AI_SWITCHED_OFF")


# ---------- Failed payment (use case 3) ----------

def test_failed_payment_sends_update_card_link():
    d = decide_failed_payment_link(LIMITS)
    assert (d.outcome, d.rule) == (Outcome.ALLOW, "SEND_UPDATE_CARD_LINK")


def test_kill_switch_stops_card_link_email_too():
    d = decide_failed_payment_link(replace(LIMITS, ai_enabled=False))
    assert d.outcome == Outcome.NEEDS_APPROVAL


# ---------- Always human (use case 5 aur baaki) ----------

@pytest.mark.parametrize("kind", ["dispute", "account_deletion", "payment_details_change"])
def test_always_human_cases_are_never_automatic(kind):
    d = decide_always_human(kind)
    assert d.outcome == Outcome.HUMAN_ONLY


def test_unknown_always_human_kind_raises():
    with pytest.raises(ValueError):
        decide_always_human("something_else")


# ---------- Safety ----------

def test_naive_datetime_is_rejected():
    naive = ChargeFacts("ch_1", 2000, 0, datetime(2026, 11, 19))
    with pytest.raises(ValueError):
        decide_refund_request(naive, CLEAN_HISTORY, LIMITS, NOW)