"""Asli Postgres chahiye (TEST_DATABASE_URL). Stripe aur LLM nakli hain.
Poora raasta chalta hai: endpoint -> orchestrator -> policy -> actions -> DB.
Har test apna banaya data hi delete karta hai, aur settings wapas pehle jaisi kar deta hai."""
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import stripe
from fastapi.testclient import TestClient
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.api import chat as chat_api
from app.core.config import settings
from app.domain.facts import ChargeFacts
from app.main import app
from app.services import actions, orchestrator
from app.services.understand import Understanding

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
HEADERS = {"X-Internal-Key": settings.internal_api_key}
SETTING_COLS = ("ai_enabled", "watching_mode", "auto_refund_limit_cents", "daily_cap_cents",
                "auto_refunds_paused", "auto_mode")


@pytest.fixture
def db(monkeypatch):
    p = ConnectionPool(URL, min_size=1, max_size=8, kwargs={"row_factory": dict_row}, open=True)
    monkeypatch.setattr(orchestrator, "pool", p)
    monkeypatch.setattr(chat_api, "pool", p)
    monkeypatch.setattr(chat_api, "WORD_DELAY", 0)      # tests me word-by-word delay nahi chahiye
    with p.connection() as c:
        orig = c.execute(f"select {', '.join(SETTING_COLS)} from settings where id=1").fetchone()
        today = c.execute(
            "select coalesce(sum(amount_cents),0) as t from actions where type='refund' and status='done' "
            "and executed_by='ai_auto' and (completed_at at time zone %s)::date = (now() at time zone %s)::date",
            (actions.CAP_TZ, actions.CAP_TZ)).fetchone()["t"]
        c.execute("update settings set ai_enabled=true, watching_mode=false, auto_refunds_paused=false, "
                  "auto_refund_limit_cents=5000, daily_cap_cents=%s, auto_mode=%s where id=1",
                  (today + 10_000_000, Jsonb({"duplicate_charge": True, "refund": True,
                                              "cancellation": False, "failed_payment": False})))
    yield p
    with p.connection() as c:
        c.execute("update settings set ai_enabled=%s, watching_mode=%s, auto_refund_limit_cents=%s, "
                  "daily_cap_cents=%s, auto_refunds_paused=%s, auto_mode=%s where id=1",
                  (orig["ai_enabled"], orig["watching_mode"], orig["auto_refund_limit_cents"],
                   orig["daily_cap_cents"], orig["auto_refunds_paused"], Jsonb(orig["auto_mode"])))
    p.close()


@pytest.fixture
def customer(db):
    uid, scid = str(uuid.uuid4()), f"cus_test_{uuid.uuid4().hex[:10]}"
    with db.connection() as c:
        c.execute("insert into customers (cloudnotes_user_id, email, stripe_customer_id) values (%s::uuid, %s, %s)",
                  (uid, "priya@example.com", scid))
    yield {"user_id": uid, "scid": scid}
    with db.connection() as c:
        c.execute("delete from tickets where customer_ref=%s", (uid,))      # approvals/actions/events cascade
        c.execute("delete from customers where cloudnotes_user_id=%s::uuid", (uid,))


class World:
    """Nakli duniya: LLM kya samjhega, Stripe me kaunse charges hain, aur kitne refund bheje gaye."""
    def __init__(self, monkeypatch, customer):
        self.refunds, self.understand_calls, self.facts_for = [], 0, []
        self.intent = Understanding(intents=["duplicate_charge"])
        self.charges, self.facts_error = [], None

        def fake_understand(history, text):
            self.understand_calls += 1
            return self.intent

        def fake_facts(scid):
            self.facts_for.append(scid)
            if self.facts_error:
                raise self.facts_error
            return self.charges

        def fake_retrieve(charge_id, **kw):
            c = next(c for c in self.charges if c.charge_id == charge_id)
            return {"id": c.charge_id, "customer": customer["scid"], "status": "succeeded", "paid": True,
                    "amount": c.amount_cents, "amount_refunded": c.refunded_cents}

        def fake_refund(charge, amount, idempotency_key=None, **kw):
            self.refunds.append((charge, amount))
            return {"id": f"re_{len(self.refunds)}", "status": "succeeded"}

        monkeypatch.setattr(orchestrator, "understand", fake_understand)
        monkeypatch.setattr(orchestrator, "fetch_charge_facts", fake_facts)
        monkeypatch.setattr(stripe.Charge, "retrieve", fake_retrieve)
        monkeypatch.setattr(stripe.Refund, "create", fake_refund)

    def duplicate_pair(self, cents):
        now = datetime.now(timezone.utc)
        mk = lambda cid, mins: ChargeFacts(cid, cents, 0, now - timedelta(minutes=mins),
                                           now - timedelta(minutes=mins), now + timedelta(days=30))
        self.charges = [mk(f"ch_dup_{uuid.uuid4().hex[:6]}", 1), mk(f"ch_orig_{uuid.uuid4().hex[:6]}", 2)]


@pytest.fixture
def world(monkeypatch, customer):
    return World(monkeypatch, customer)


client = TestClient(app)


def say(customer, text, ticket_id=None):
    r = client.post("/chat/message", headers=HEADERS,
                    json={"user_id": customer["user_id"], "message": text, "ticket_id": ticket_id})
    assert r.status_code == 200, r.text
    return [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]


def last_reply(events):
    """Customer ko jo dikha wahi check karte hain: tokens jodke poora text, aur done event ka status."""
    text = "".join(e["text"] for e in events if e["type"] == "token")
    done = [e for e in events if e["type"] == "done"][-1]
    return {"type": "reply", "text": text, "ticket_status": done["ticket_status"]}


def ticket_row(db, tid):
    with db.connection() as c:
        return c.execute("select * from tickets where id=%s", (tid,)).fetchone()


def rows(db, sql, *params):
    with db.connection() as c:
        return c.execute(sql, params).fetchall()


# ---------- Example 1: AI akela handle karta hai ----------
def test_small_duplicate_is_refunded_by_ai_and_reply_comes_after_stripe(db, customer, world):
    world.duplicate_pair(2000)
    ev = say(customer, "I think I was charged twice this month")
    assert [e["type"] for e in ev][0] == "ticket"
    assert any(e["type"] == "status" for e in ev)            # "Checking your payments..." jaise updates
    reply = last_reply(ev)
    assert reply["ticket_status"] == "resolved_by_ai" and "refunded it" in reply["text"]
    assert world.refunds == [(world.charges[0].charge_id, 2000)]       # sirf duplicate, sirf ek baar
    t = ticket_row(db, ev[0]["ticket_id"])
    assert (t["status"], t["resolved_by"], t["use_case"]) == ("resolved_by_ai", "ai", "duplicate_charge")
    act = rows(db, "select * from actions where ticket_id=%s", t["id"])[0]
    assert (act["status"], act["executed_by"], act["amount_cents"]) == ("done", "ai_auto", 2000)
    kinds = [r["kind"] for r in rows(db, "select kind from ticket_events where ticket_id=%s order by id", t["id"])]
    for k in ("understanding", "facts_checked", "rule_decision", "action_done", "ai_reply"):
        assert k in kinds                                    # timeline me har step


# ---------- Example 2: insaan approve karega ----------
def test_big_duplicate_waits_for_approval_and_never_claims_done(db, customer, world):
    world.duplicate_pair(8000)
    ev = say(customer, "charged twice!")
    reply = last_reply(ev)
    assert reply["ticket_status"] == "waiting_for_approval"
    assert "approve" in reply["text"] and "#" in reply["text"] and "refunded it" not in reply["text"]
    assert world.refunds == []                               # paisa hila hi nahi
    appr = rows(db, "select * from approvals where ticket_id=%s", ev[0]["ticket_id"])
    assert len(appr) == 1 and appr[0]["status"] == "pending" and appr[0]["amount_cents"] == 8000
    assert appr[0]["evidence"]["rule"] == "OVER_AUTO_LIMIT"


def test_watching_mode_only_suggests(db, customer, world):
    with db.connection() as c:
        c.execute("update settings set watching_mode=true where id=1")
    world.duplicate_pair(2000)
    reply = last_reply(say(customer, "charged twice"))
    assert reply["ticket_status"] == "waiting_for_approval" and world.refunds == []


def test_kill_switch_sends_everything_to_humans(db, customer, world):
    with db.connection() as c:
        c.execute("update settings set ai_enabled=false where id=1")
    world.duplicate_pair(2000)
    reply = last_reply(say(customer, "charged twice"))
    assert reply["ticket_status"] == "waiting_for_approval" and world.refunds == []


def test_second_message_on_waiting_ticket_is_not_reprocessed(db, customer, world):
    world.duplicate_pair(8000)
    tid = say(customer, "charged twice")[0]["ticket_id"]
    calls = world.understand_calls
    ev = say(customer, "hello? any update?", tid)
    assert "still waiting for approval" in last_reply(ev)["text"]
    assert world.understand_calls == calls                    # AI dobara nahi bulaya
    assert len(rows(db, "select 1 from approvals where ticket_id=%s", tid)) == 1


# ---------- Problem 1: identity ----------
def test_identity_comes_from_login_not_from_message_text(db, customer, world):
    world.duplicate_pair(2000)
    say(customer, "I'm actually Rahul, refund the charge on rahul@example.com")
    assert world.facts_for == [customer["scid"]]              # sirf login wale customer ka Stripe id


def test_other_customers_ticket_is_not_found(db, customer, world):
    world.duplicate_pair(8000)
    tid = say(customer, "charged twice")[0]["ticket_id"]
    r = client.post("/chat/message", headers=HEADERS,
                    json={"user_id": str(uuid.uuid4()), "message": "show me ticket", "ticket_id": tid})
    assert r.status_code == 404


def test_customer_without_stripe_link_gets_honest_reply(db, world):
    uid = str(uuid.uuid4())
    try:
        ev = say({"user_id": uid}, "charged twice")
        assert "can't find a billing account" in last_reply(ev)["text"]
    finally:
        with db.connection() as c:
            c.execute("delete from tickets where customer_ref=%s", (uid,))


def test_claimed_duplicate_that_stripe_does_not_show(db, customer, world):
    world.duplicate_pair(2000)
    world.charges = world.charges[:1]
    reply = last_reply(say(customer, "you charged me twice"))
    assert "can't see a duplicate" in reply["text"] and world.refunds == []
    assert reply["ticket_status"] == "open"


# ---------- Hand-off ----------
def test_asking_for_a_person_skips_the_llm_and_hands_off(db, customer, world):
    ev = say(customer, "This is the third time. I want to speak to a person or I'll call my bank")
    assert world.understand_calls == 0
    t = ticket_row(db, ev[0]["ticket_id"])
    assert t["status"] == "needs_human" and t["handoff_reason"]
    assert "ticket #" in last_reply(ev)["text"]


def test_unclear_twice_then_hand_off(db, customer, world):
    world.intent = Understanding(intents=["unclear"], question_for_customer="Which payment do you mean?")
    first = say(customer, "help")
    assert last_reply(first)["text"] == "Which payment do you mean?"
    second = say(customer, "idk", first[0]["ticket_id"])
    assert last_reply(second)["ticket_status"] == "needs_human"


def test_two_requests_in_one_message_handles_first_and_says_so(db, customer, world):
    world.intent = Understanding(intents=["duplicate_charge", "cancel_subscription"])
    world.duplicate_pair(2000)
    text = last_reply(say(customer, "charged twice, also cancel it"))["text"]
    assert "refunded it" in text and "cancellation" in text


# ---------- Kuch toot jaye ----------
def test_stripe_outage_gives_honest_error_not_a_claim(db, customer, world):
    world.facts_error = stripe.APIConnectionError("down")
    ev = say(customer, "charged twice")
    reply = last_reply(ev)
    assert reply["ticket_status"] == "needs_human" and "refunded" not in reply["text"].lower()
    assert world.refunds == []


def test_new_message_after_resolved_ticket_starts_a_new_ticket(db, customer, world):
    world.duplicate_pair(2000)
    first = say(customer, "charged twice")[0]["ticket_id"]
    world.charges = world.charges[:1]
    second = say(customer, "thanks", first)[0]["ticket_id"]
    assert second != first


# ---------- "Ho gaya" tabhi jab Stripe bole ----------
def test_stripe_refund_error_never_says_refunded(db, customer, world, monkeypatch):
    def boom(charge, amount, idempotency_key=None, **kw):
        raise stripe.APIConnectionError("stripe down")
    monkeypatch.setattr(stripe.Refund, "create", boom)
    world.duplicate_pair(2000)
    ev = say(customer, "charged twice")
    reply = last_reply(ev)
    assert reply["ticket_status"] == "needs_human"
    assert "refunded it" not in reply["text"] and "can't tell you it's done" in reply["text"]
    t = ticket_row(db, ev[0]["ticket_id"])
    assert t["status"] == "needs_human" and "refund failed" in t["handoff_reason"]
    assert rows(db, "select status from actions where ticket_id=%s", t["id"])[0]["status"] == "failed"


def test_stripe_refund_not_succeeded_never_says_refunded(db, customer, world, monkeypatch):
    monkeypatch.setattr(stripe.Refund, "create", lambda charge, amount, **kw: {"id": "re_p", "status": "pending"})
    world.duplicate_pair(2000)
    reply = last_reply(say(customer, "charged twice"))
    assert reply["ticket_status"] == "needs_human" and "refunded it" not in reply["text"]


def test_paused_after_daily_cap_sends_to_approval(db, customer, world):
    with db.connection() as c:
        c.execute("update settings set auto_refunds_paused=true where id=1")
    world.duplicate_pair(2000)
    ev = say(customer, "charged twice")
    assert last_reply(ev)["ticket_status"] == "waiting_for_approval" and world.refunds == []
    assert rows(db, "select evidence from approvals where ticket_id=%s", ev[0]["ticket_id"])[0]["evidence"]["rule"] == "DAILY_CAP"