from datetime import datetime, timedelta, timezone

import pytest

from app.domain.decisions import Outcome
from app.domain.facts import ChargeFacts, CustomerHistory, Limits
from app.services.planner import plan_refund, route
from app.services.understand import Understanding

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
HISTORY = CustomerHistory(auto_refund_in_last_30_days=False)
LIMITS = Limits(5000, 50000, 0, True, False, True)


def ch(cid, minutes_ago, amount=2000):
    t = NOW - timedelta(minutes=minutes_ago)
    return ChargeFacts(cid, amount, 0, t, t, t + timedelta(days=30))


def u(**kw):
    return Understanding(**kw)


# ---------- route ----------
def test_asks_for_human_goes_to_handoff():
    assert route(u(intents=["refund_request"], asks_for_human=True), 0).kind == "handoff"

def test_upset_and_bank_go_to_handoff():
    assert route(u(very_upset=True), 0).kind == "handoff"
    assert route(u(mentions_legal_or_bank=True), 0).kind == "handoff"

def test_unclear_first_time_asks_second_time_hands_off():
    r = route(u(intents=["unclear"], question_for_customer="Which charge?"), 0)
    assert (r.kind, r.question) == ("ask", "Which charge?")
    assert route(u(intents=["unclear"]), 1).kind == "handoff"

def test_duplicate_is_handled():
    r = route(u(intents=["duplicate_charge"]), 0)
    assert (r.kind, r.use_case) == ("handle", "duplicate_charge")

def test_two_requests_first_by_priority_and_second_is_remembered():
    r = route(u(intents=["cancel_subscription", "refund_request"]), 0)
    assert (r.kind, r.intent, r.also) == ("handle", "refund_request", "cancellation")

def test_cancel_is_now_supported():
    r = route(u(intents=["cancel_subscription"]), 0)
    assert (r.kind, r.use_case) == ("handle", "cancellation")


# ---------- plan_refund ----------
def test_no_charges():
    assert plan_refund("duplicate_charge", [], HISTORY, LIMITS, NOW).kind == "no_payments"

def test_customer_claims_duplicate_but_stripe_shows_one_charge():
    assert plan_refund("duplicate_charge", [ch("a", 5)], HISTORY, LIMITS, NOW).kind == "no_duplicate"

def test_real_duplicate_refunds_the_second_charge_and_is_allowed():
    p = plan_refund("duplicate_charge", [ch("b", 1), ch("a", 2)], HISTORY, LIMITS, NOW)
    assert p.kind == "decide" and p.charge.charge_id == "b"
    assert (p.decision.outcome, p.decision.amount_cents) == (Outcome.ALLOW, 2000)

def test_big_duplicate_needs_approval():
    p = plan_refund("duplicate_charge", [ch("b", 1, 8000), ch("a", 2, 8000)], HISTORY, LIMITS, NOW)
    assert p.decision.outcome == Outcome.NEEDS_APPROVAL

def test_refund_request_uses_newest_charge():
    p = plan_refund("refund_request", [ch("new", 60), ch("old", 60 * 24 * 40)], HISTORY, LIMITS, NOW)
    assert p.charge.charge_id == "new" and p.decision.outcome == Outcome.ALLOW

def test_cancellation_plan_works():
    p = plan_refund("cancel_subscription", [ch("a", 5)], HISTORY, LIMITS, NOW)
    assert p.kind == "decide" and p.decision.rule == "CANCEL_AT_PERIOD_END"

def test_unknown_intent_raises():
    with pytest.raises(ValueError):
        plan_refund("unrecognized_intent_123", [ch("a", 5)], HISTORY, LIMITS, NOW)
