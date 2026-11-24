from datetime import datetime,timezone
import stripe
from app.domain.facts import ChargeFacts

class CustomerNotLinked(Exception):
    """Is cloudnotes user ka Stripe customer abhi bana nahi h"""

def get_stripe_customer_id(conn,cloudnotes_user_id:str)->str:
    """Login (JWT) se aayi user id se Stripe customer nikalta hai"""
    row=conn.execute("select stripe_customer_id from customers where cloudnotes_user_id=%s::uuid",(cloudnotes_user_id,)).fetchone()
    if not row or not row["stripe_customer_id"]:
        raise CustomerNotLinked(cloudnotes_user_id)
    return row["stripe_customer_id"]

def _plain(obj) -> dict:
    """Stripe object ko plain dict banata hai (naye stripe versions m object dict nahi hota)"""
    return obj.to_dict() if hasattr(obj,"to_dict") else dict(obj)

def _ts(unix:int) -> datetime:
    return datetime.fromtimestamp(unix,tz=timezone.utc)

def find_period(charge:dict, invoices:list[dict]) -> tuple[datetime| None,datetime | None]:
    """Charge kis billing period ki thi?Invoice ki line se period milta hai"""
    pi=charge.get("payment_intent")
    inv_id=charge.get("invoice")
    for inv in invoices:
        matched = (
            (inv_id is not None and inv.get("id") == inv_id)
            or inv.get("charge") == charge["id"]
            or (pi is not None and inv.get("payment_intent") == pi)
        )
        if not matched:
            for p in (inv.get("payments") or {}).get("data", []):
                if pi is not None and (p.get("payment") or {}).get("payment_intent") == pi:
                    matched = True
                    break
        if not matched:
            continue
        lines = (inv.get("lines") or {}).get("data", [])
        if lines and lines[0].get("period"):
            per = lines[0]["period"]
            return _ts(per["start"]), _ts(per["end"])
    return None, None

def charge_to_facts(charge:dict,invoices:list[dict]) -> ChargeFacts:
    start,end=find_period(charge,invoices)
    return ChargeFacts(
        charge_id=charge["id"],
        amount_cents=charge["amount"],
        refunded_cents=charge.get("amount_refunded",0),
        created_at=_ts(charge["created"]),
        period_start=start,
        period_end=end
    )


def fetch_charge_facts(stripe_customer_id: str) -> list[ChargeFacts]:
    """Stripe se is customer ke SUCCEEDED charges (naye pehle) laata hai.
    Customer ke shabdon pe kuch nahi, sirf Stripe ka data."""
    charges = [_plain(c) for c in stripe.Charge.list(customer=stripe_customer_id, limit=100).data]
    invoices = [_plain(i) for i in stripe.Invoice.list(customer=stripe_customer_id, limit=100).data]

    facts = []
    for c in charges:
        if c.get("status") != "succeeded" or not c.get("paid", False):
            continue
        # double check: charge sach me isi customer ka hai
        if c.get("customer") != stripe_customer_id:
            continue
        facts.append(charge_to_facts(c, invoices))
    return sorted(facts, key=lambda f: f.created_at, reverse=True)