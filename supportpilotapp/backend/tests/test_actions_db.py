"""Asli Postgres chahiye. TEST_DATABASE_URL set na ho to ye tests skip ho jaate hain.
Tests sirf apna banaya data delete karte hain, aur settings ko test ke baad wapas pehle jaisa kar dete hain."""
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
import stripe
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.services import actions

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")

SETTING_COLS = ("ai_enabled", "watching_mode", "auto_refund_limit_cents", "daily_cap_cents", "auto_refunds_paused")


@pytest.fixture
def pool():
    p = ConnectionPool(URL, min_size=1, max_size=8, kwargs={"row_factory": dict_row}, open=True)
    yield p
    p.close()


def today_total(pool):
    with pool.connection() as c:
        return c.execute(
            "select coalesce(sum(amount_cents),0) as t from actions where type='refund' and status='done' "
            "and executed_by='ai_auto' and (completed_at at time zone %s)::date = (now() at time zone %s)::date",
            (actions.CAP_TZ, actions.CAP_TZ)).fetchone()["t"]


def set_settings(pool, **kw):
    sets = ", ".join(f"{k}=%s" for k in kw)
    with pool.connection() as c:
        c.execute(f"update settings set {sets} where id=1", tuple(kw.values()))


@pytest.fixture(autouse=True)
def open_settings(pool):
    """Har test shuru me: AI on, watching off, limit $50, cap bahut bada. Test ke baad asli settings wapas."""
    with pool.connection() as c:
        orig = c.execute(f"select {', '.join(SETTING_COLS)} from settings where id=1").fetchone()
    set_settings(pool, ai_enabled=True, watching_mode=False, auto_refunds_paused=False,
                 auto_refund_limit_cents=5000, daily_cap_cents=today_total(pool) + 10_000_000)
    yield
    set_settings(pool, **orig)


@pytest.fixture
def ticket(pool):
    with pool.connection() as c:
        tid = c.execute("insert into tickets (source) values ('chat') returning id").fetchone()["id"]
    yield tid
    with pool.connection() as c:
        c.execute("delete from tickets where id=%s", (tid,))   # actions/events cascade


ACTIVE = None   # abhi chal raha FakeStripe


class FakeStripe:
    """customer=None: charge usi customer ka maana jaata hai jo call() me diya gaya.
    customer="cus_X": charge hamesha cus_X ka (mismatch test ke liye)."""
    def __init__(self, monkeypatch, customer=None, amount=2000, refunded=0, delay=0.0):
        global ACTIVE
        ACTIVE = self
        self.refund_calls = []
        self.refund_error = None
        self.refund_status = "succeeded"
        self.customer, self.amount, self.base_refunded = customer, amount, refunded
        self.owner = {}              # charge_id -> customer
        self.refunded = {}           # charge_id -> kitna refund ho chuka
        self.delay = delay
        self.lock = threading.Lock()
        monkeypatch.setattr(stripe.Charge, "retrieve", self._retrieve)
        monkeypatch.setattr(stripe.Refund, "create", self._create)

    def _retrieve(self, cid):
        return {"id": cid, "customer": self.customer or self.owner.get(cid), "amount": self.amount,
                "amount_refunded": self.base_refunded + self.refunded.get(cid, 0),
                "status": "succeeded", "paid": True}

    def _create(self, **kw):
        time.sleep(self.delay)
        if self.refund_error:
            raise self.refund_error
        with self.lock:
            self.refund_calls.append(kw)
            n = len(self.refund_calls)
            self.refunded[kw["charge"]] = self.refunded.get(kw["charge"], 0) + kw["amount"]
        return {"id": f"re_{n}", "status": self.refund_status}


def call(pool, ticket, charge_id, amount=2000, customer="cus_1", by="ai_auto",use_case=None):
    if ACTIVE is not None and ACTIVE.customer is None:
        ACTIVE.owner.setdefault(charge_id, customer)
    return actions.execute_refund(pool, ticket_id=ticket, stripe_customer_id=customer,
                                  charge_id=charge_id, amount_cents=amount, executed_by=by,use_case=use_case)


def cid():
    return "ch_" + uuid.uuid4().hex[:12]


def ucus():
    return "cus_" + uuid.uuid4().hex[:10]


# ---------------- Step 3a: exactly-once ----------------

def test_happy_path_writes_action_and_event(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    c = cid()
    r = call(pool, ticket, c)
    assert (r.status, r.stripe_ref) == ("done", "re_1")
    assert len(fs.refund_calls) == 1
    assert fs.refund_calls[0]["idempotency_key"] == f"refund:{c}:2000"
    with pool.connection() as conn:
        a = conn.execute("select status, stripe_ref, executed_by, stripe_customer_id from actions where ticket_id=%s", (ticket,)).fetchone()
        e = conn.execute("select kind from ticket_events where ticket_id=%s", (ticket,)).fetchall()
    assert a == {"status": "done", "stripe_ref": "re_1", "executed_by": "ai_auto", "stripe_customer_id": "cus_1"}
    assert [x["kind"] for x in e] == ["action_done"]


def test_retry_does_not_refund_twice(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    c = cid()
    assert call(pool, ticket, c).status == "done"
    r2 = call(pool, ticket, c)
    assert r2.status == "already_done" and r2.stripe_ref == "re_1"
    assert len(fs.refund_calls) == 1


def test_two_chats_same_charge_same_moment_refund_once(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, delay=0.3)
    c = cid()
    with ThreadPoolExecutor(2) as ex:
        results = list(ex.map(lambda _: call(pool, ticket, c), range(2)))
    assert sorted(r.status for r in results) == ["already_done", "done"]
    assert len(fs.refund_calls) == 1


def test_amount_more_than_refundable_is_rejected(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, amount=2000, refunded=1500)
    r = call(pool, ticket, cid(), amount=1000)
    assert r.status == "rejected" and fs.refund_calls == []


def test_already_fully_refunded_is_rejected(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, amount=2000, refunded=2000)
    assert call(pool, ticket, cid()).status == "rejected"
    assert fs.refund_calls == []


def test_charge_of_another_customer_is_rejected(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, customer="cus_OTHER")
    r = call(pool, ticket, cid(), customer="cus_1")
    assert r.status == "rejected" and "customer" in r.reason and fs.refund_calls == []


def test_zero_or_negative_amount_is_rejected(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    assert call(pool, ticket, cid(), amount=0).status == "rejected"
    assert call(pool, ticket, cid(), amount=-5).status == "rejected"
    assert fs.refund_calls == []


def test_stripe_error_marks_failed_and_retry_can_succeed(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    fs.refund_error = stripe.APIConnectionError("network down")
    c = cid()
    assert call(pool, ticket, c).status == "failed"
    with pool.connection() as conn:
        assert conn.execute("select status from actions where ticket_id=%s", (ticket,)).fetchone()["status"] == "failed"
    fs.refund_error = None
    assert call(pool, ticket, c).status == "done"
    assert len(fs.refund_calls) == 1


def test_refund_not_succeeded_is_never_reported_done(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    fs.refund_status = "pending"
    assert call(pool, ticket, cid()).status == "failed"


# ---------------- Step 3b: execution-time guards ----------------

def assert_blocked(r, fs, code):
    assert r.status == "blocked" and r.code == code
    assert fs.refund_calls == []


def test_kill_switch_blocks_even_a_ready_refund(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    set_settings(pool, ai_enabled=False)
    assert_blocked(call(pool, ticket, cid(), customer=ucus()), fs, "kill_switch")


def test_watching_mode_blocks(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    set_settings(pool, watching_mode=True)
    assert_blocked(call(pool, ticket, cid(), customer=ucus()), fs, "watching_mode")

def test_auto_mode_off_for_case_type_blocks(pool, ticket, monkeypatch):
    import json
    fs = FakeStripe(monkeypatch)
    with pool.connection() as c:
        orig = c.execute("select auto_mode from settings where id=1").fetchone()["auto_mode"]
        c.execute("update settings set auto_mode = %s::jsonb where id=1",
                  ('{"duplicate_charge": false, "refund": true}',))
    try:
        # duplicate_charge ka auto mode off h, toh block hona chahiye
        r = call(pool, ticket, cid(), customer=ucus(), use_case="duplicate_charge")
        assert_blocked(r, fs, "auto_mode_off")
        # refund ka auto mode on h, toh ye chalna chahiye
        assert call(pool, ticket, cid(), customer=ucus(), use_case="refund").status == "done"
    finally:
        with pool.connection() as c:
            c.execute("update settings set auto_mode = %s::jsonb where id=1", (json.dumps(orig),))


def test_blocked_leaves_no_action_row_but_logs_event(pool, ticket, monkeypatch):
    FakeStripe(monkeypatch)
    set_settings(pool, ai_enabled=False)
    call(pool, ticket, cid(), customer=ucus())
    with pool.connection() as c:
        n = c.execute("select count(*) as n from actions where ticket_id=%s", (ticket,)).fetchone()["n"]
        kinds = [x["kind"] for x in c.execute("select kind from ticket_events where ticket_id=%s", (ticket,)).fetchall()]
    assert n == 0 and kinds == ["action_blocked"]


def test_amount_above_auto_limit_is_blocked(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, amount=6000)
    assert_blocked(call(pool, ticket, cid(), amount=6000, customer=ucus()), fs, "over_limit")


def test_second_auto_refund_for_same_customer_within_30_days_is_blocked(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    cus = ucus()
    assert call(pool, ticket, cid(), customer=cus).status == "done"
    n = len(fs.refund_calls)
    r = call(pool, ticket, cid(), customer=cus)
    assert r.status == "blocked" and r.code == "customer_limit" and len(fs.refund_calls) == n


def test_auto_refund_older_than_30_days_does_not_count(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    cus = ucus()
    assert call(pool, ticket, cid(), customer=cus).status == "done"
    with pool.connection() as c:
        c.execute("update actions set completed_at = now() - interval '31 days' where ticket_id=%s", (ticket,))
    assert call(pool, ticket, cid(), customer=cus).status == "done"


def test_approved_and_human_refunds_skip_auto_limits(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, amount=9000)
    cus = ucus()
    set_settings(pool, ai_enabled=False, watching_mode=True)       # AI band hai, phir bhi insaan ka faisla chalega
    assert call(pool, ticket, cid(), amount=9000, customer=cus, by="ai_after_approval").status == "done"
    assert call(pool, ticket, cid(), amount=9000, customer=cus, by="human").status == "done"


def test_daily_cap_blocks_and_pauses_until_admin_resumes(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch)
    set_settings(pool, daily_cap_cents=today_total(pool) + 3000)
    assert call(pool, ticket, cid(), customer=ucus()).status == "done"          # 2000 of 3000
    r = call(pool, ticket, cid(), customer=ucus())                              # +2000 > cap
    assert r.status == "blocked" and r.code == "daily_cap"
    with pool.connection() as c:
        assert c.execute("select auto_refunds_paused from settings where id=1").fetchone()["auto_refunds_paused"] is True
    assert call(pool, ticket, cid(), amount=100, customer=ucus()).code == "paused"   # chhota amount bhi band
    set_settings(pool, auto_refunds_paused=False, daily_cap_cents=today_total(pool) + 10_000)  # admin wapas chalata hai
    assert call(pool, ticket, cid(), customer=ucus()).status == "done"
    assert len(fs.refund_calls) == 2


def test_many_requests_at_the_same_moment_cannot_break_the_daily_cap(pool, ticket, monkeypatch):
    fs = FakeStripe(monkeypatch, delay=0.2)
    set_settings(pool, daily_cap_cents=today_total(pool) + 2000)      # sirf ek refund ki jagah
    customers = [ucus() for _ in range(5)]
    with ThreadPoolExecutor(5) as ex:
        results = list(ex.map(lambda cu: call(pool, ticket, cid(), customer=cu), customers))
    assert sorted(r.status for r in results) == ["blocked"] * 4 + ["done"]
    assert len(fs.refund_calls) == 1