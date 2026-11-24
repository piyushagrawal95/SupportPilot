from datetime import datetime, timedelta, timezone

from app.domain.decisions import Outcome
from app.domain.facts import ChargeFacts, CustomerHistory
from app.services.limits import build_limits, load_history, load_limits
from app.services.planner import plan_refund

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)

SETTINGS = {
    "ai_enabled": True, "watching_mode": False, "auto_refund_limit_cents": 5000,
    "daily_cap_cents": 50000, "auto_refunds_paused": False,
    "auto_mode": {"duplicate_charge": True, "refund": False},
}


def test_build_limits_maps_settings():
    lim = build_limits(SETTINGS, 1500, "duplicate_charge")
    assert (lim.auto_refund_limit_cents, lim.daily_cap_cents, lim.auto_refunded_today_cents) == (5000, 50000, 1500)
    assert lim.ai_enabled and not lim.watching_mode and lim.auto_mode_for_case


def test_auto_mode_is_per_case_and_defaults_to_off():
    assert build_limits(SETTINGS, 0, "refund").auto_mode_for_case is False
    assert build_limits(SETTINGS, 0, "cancellation").auto_mode_for_case is False   # key hi nahi hai
    assert build_limits({**SETTINGS, "auto_mode": None}, 0, "refund").auto_mode_for_case is False


def test_paused_cap_sends_money_actions_to_approval():
    t = NOW - timedelta(minutes=1)
    charges = [ChargeFacts("b", 2000, 0, t, t, t + timedelta(days=30)),
               ChargeFacts("a", 2000, 0, t - timedelta(minutes=1), t, t + timedelta(days=30))]
    lim = build_limits({**SETTINGS, "auto_refunds_paused": True}, 0, "duplicate_charge")
    p = plan_refund("duplicate_charge", charges, CustomerHistory(False), lim, NOW)
    assert (p.decision.outcome, p.decision.rule) == (Outcome.NEEDS_APPROVAL, "DAILY_CAP")


class FakeConn:
    """DB ki jagah: jo bhi query aaye, queue se agla jawab de deta hai."""
    def __init__(self, *answers):
        self.answers, self.sql = list(answers), []
    def execute(self, sql, params=None):
        self.sql.append(sql)
        a = self.answers.pop(0)
        return type("R", (), {"fetchone": lambda self_: a})()


def test_load_limits_reads_settings_then_today_total():
    conn = FakeConn(SETTINGS, {"total": 1500})
    lim = load_limits(conn, "duplicate_charge")
    assert lim.auto_refunded_today_cents == 1500 and lim.auto_mode_for_case
    assert "from settings" in conn.sql[0] and "executed_by='ai_auto'" in conn.sql[1]


def test_load_history_true_only_if_recent_auto_refund_exists():
    assert load_history(FakeConn({"?column?": 1}), "cus_1").auto_refund_in_last_30_days is True
    assert load_history(FakeConn(None), "cus_1").auto_refund_in_last_30_days is False