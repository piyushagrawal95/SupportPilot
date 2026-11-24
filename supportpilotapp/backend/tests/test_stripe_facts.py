from datetime import datetime, timezone

import pytest

from app.services.stripe_facts import (
    CustomerNotLinked, charge_to_facts, find_period, get_stripe_customer_id,
)

T0 = 1_700_000_000
MONTH = 30 * 24 * 3600


def charge(**kw):
    base = {"id": "ch_1", "amount": 2000, "amount_refunded": 0, "created": T0,
            "payment_intent": "pi_1", "customer": "cus_1", "status": "succeeded", "paid": True}
    base.update(kw)
    return base


def invoice(**kw):
    base = {"id": "in_1", "lines": {"data": [{"period": {"start": T0, "end": T0 + MONTH}}]}}
    base.update(kw)
    return base


def test_period_via_old_style_charge_field():
    s, e = find_period(charge(), [invoice(charge="ch_1")])
    assert s == datetime.fromtimestamp(T0, tz=timezone.utc)
    assert (e - s).days == 30


def test_period_via_charge_invoice_id():
    s, _ = find_period(charge(invoice="in_1"), [invoice()])
    assert s is not None


def test_period_via_payment_intent():
    s, _ = find_period(charge(), [invoice(payment_intent="pi_1")])
    assert s is not None


def test_period_via_new_style_payments():
    inv = invoice(payments={"data": [{"payment": {"payment_intent": "pi_1"}}]})
    s, _ = find_period(charge(), [inv])
    assert s is not None


def test_other_customers_invoice_is_not_used():
    assert find_period(charge(), [invoice(charge="ch_OTHER", payment_intent="pi_OTHER")]) == (None, None)


def test_no_invoice_means_no_period_so_no_partial_refund():
    f = charge_to_facts(charge(), [])
    assert f.period_start is None and f.period_end is None


def test_facts_fields_and_refunded_amount():
    f = charge_to_facts(charge(amount_refunded=500), [invoice(charge="ch_1")])
    assert (f.charge_id, f.amount_cents, f.refunded_cents) == ("ch_1", 2000, 500)
    assert f.created_at.tzinfo is not None


class FakeConn:
    def __init__(self, row): self.row = row
    def execute(self, *a, **k): return self
    def fetchone(self): return self.row


def test_missing_customer_row_raises():
    with pytest.raises(CustomerNotLinked):
        get_stripe_customer_id(FakeConn(None), "uuid-1")


def test_row_without_stripe_id_raises():
    with pytest.raises(CustomerNotLinked):
        get_stripe_customer_id(FakeConn({"stripe_customer_id": None}), "uuid-1")


def test_linked_customer_returned():
    assert get_stripe_customer_id(FakeConn({"stripe_customer_id": "cus_9"}), "uuid-1") == "cus_9"