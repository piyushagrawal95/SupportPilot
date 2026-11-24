"""Planner: customer ke message ka kya karna hai, ye decide karta hai.

Isme DB, Stripe, LLM kuch nahi hai. Input do, output lo. Isliye tests aasaan hain.
- route(): message ko 4 raston me se ek par bhejta hai: handoff / ask / unsupported / handle
- plan_refund(): refund wale case me kaunsa charge, aur policy ka faisla kya
Paise ka asli faisla policy.py karta hai. Yahan sirf "kaunsa rule kis charge pe lagana hai" chunte hain.
"""
from dataclasses import dataclass
from datetime import datetime

from app.domain.decisions import Decision
from app.domain.duplicates import find_duplicates
from app.domain.facts import ChargeFacts, CustomerHistory, Limits
from app.domain.policy import decide_duplicate_refund, decide_refund_request
from app.services.understand import Understanding

# Ek message me do cheezein hon to is order me pehli wali pehle hoti hai
PRIORITY = ["duplicate_charge", "refund_request", "cancel_subscription", "failed_payment_help"]

# tickets.use_case column ke allowed values
USE_CASE = {
    "duplicate_charge": "duplicate_charge",
    "refund_request": "refund",
    "cancel_subscription": "cancellation",
    "failed_payment_help": "failed_payment",
}

# Customer ko bolne ke liye naam ("send me another message about the ...")
LABEL = {
    "duplicate_charge": "duplicate charge",
    "refund_request": "refund",
    "cancel_subscription": "cancellation",
    "failed_payment_help": "failed payment",
}

SUPPORTED = ("duplicate_charge", "refund_request")   # abhi sirf ye do automatic hain


@dataclass(frozen=True)
class Route:
    kind: str                      # handoff | ask | unsupported | handle
    intent: str | None = None
    use_case: str | None = None
    reason: str = ""               # handoff ki wajah (staff ko ticket pe dikhegi)
    question: str | None = None    # ask me customer se kya poochna hai
    also: str | None = None        # doosri request ka naam, agar customer ne do maangi


def route(u: Understanding, prior_unclear: int) -> Route:
    """AI ki samajh (flags) dekh ke raasta chunta hai. Hand-off ke rules policy ke hisaab se:
    insaan maanga, bahut gussa, legal/bank ka zikr, ya 2 koshish ke baad bhi samajh nahi aaya."""
    if u.asks_for_human:
        return Route("handoff", reason="customer asked for a person")
    if u.very_upset:
        return Route("handoff", reason="customer is very upset")
    if u.mentions_legal_or_bank:
        return Route("handoff", reason="customer mentioned legal action, their bank or a chargeback")

    known = [i for i in PRIORITY if i in u.intents]
    if not known:
        # Pehli baar samajh nahi aaya -> sawal poocho. Doosri baar bhi nahi -> insaan ko do.
        if prior_unclear >= 1:
            return Route("handoff", reason="AI could not work out the request after two tries")
        return Route("ask", question=u.question_for_customer)

    main = known[0]
    also = LABEL[known[1]] if len(known) > 1 else None
    kind = "handle" if main in SUPPORTED else "unsupported"
    return Route(kind, intent=main, use_case=USE_CASE[main], also=also)


@dataclass(frozen=True)
class Plan:
    kind: str                          # decide | no_payments | no_duplicate
    charge: ChargeFacts | None = None
    decision: Decision | None = None


def plan_refund(intent: str, charges: list[ChargeFacts], history: CustomerHistory,
                limits: Limits, now: datetime) -> Plan:
    """Stripe ke facts se kaunsa charge chunna hai, phir policy.py se faisla.
    charges naye-se-purane order me aate hain (stripe_facts.fetch_charge_facts)."""
    if not charges:
        return Plan("no_payments")

    if intent == "duplicate_charge":
        dups = find_duplicates(charges)
        if not dups:
            return Plan("no_duplicate")
        charge = dups[0]                      # sabse purana duplicate pehle
        return Plan("decide", charge, decide_duplicate_refund(charge, history, limits, now))

    if intent == "refund_request":
        charge = charges[0]                   # sabse naya payment
        return Plan("decide", charge, decide_refund_request(charge, history, limits, now))

    raise ValueError(f"planner does not handle intent: {intent}")