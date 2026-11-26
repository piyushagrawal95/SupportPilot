"""Customer ko dikhne wale saare messages"""

def money(cents: int) -> str:
    """2000 -> '$20.00'. Integer cents ko dollars me badalta hai (float math nahi)."""
    return f"${cents // 100}.{cents % 100:02d}"


# ---Kaam ho gya (sirf Stripe confirm ke baad use hoga)
def refund_done(amount_cents:int,is_duplicate:bool):
    if is_duplicate:
        return (f"We found a duplicate charge of {money(amount_cents)} and have refunded it. It will reach your card in a few days")
    return (f"Your refund of {money(amount_cents)} has been issued. It will reach your card in few days")

def refund_already_done(amount_cents:int) -> str:
    return (f"That payment was already refunded ({money(amount_cents)}), so there is nothing more to do. It will reach your card in few days")

def needs_approval(amount_cents: int, ticket_id: int, is_duplicate: bool) -> str:
    start = (f"I've confirmed the duplicate charge of {money(amount_cents)}."
             if is_duplicate else
             f"Your request qualifies for a refund of {money(amount_cents)}.")
    return (f"{start} Our team needs to approve it before I can send it. "
            f"Your ticket number is #{ticket_id}. You'll get an update here and by email, "
            "usually within a few hours.")

def cancellation_needs_approval(amount_cents: int, ticket_id: int) -> str:
    if amount_cents > 0:
        return (f"Your request to cancel immediately with a prorated refund of {money(amount_cents)} "
                f"requires approval from our team. Your ticket number is #{ticket_id}. "
                "You'll get an update here and by email, usually within a few hours.")
    return (f"Your subscription cancellation request has been scheduled and is awaiting review from our team. "
            f"Your ticket number is #{ticket_id}. You'll get an update here and by email, "
            "usually within a few hours.")

#Policy ne mana kia
_DECLINE_TEXT = {
    "ALREADY_REFUNDED": "That payment has already been fully refunded.",
    "REFUND_WINDOW_EXPIRED": "That payment is more than 30 days old, and refunds are only possible within 30 days.",
    "NO_UNUSED_PORTION": "There is no unused part of that billing period left to refund.",
    "DUPLICATE_WINDOW_EXPIRED": "Duplicate charges have to be reported within 60 days, and this one is older.",
}

def declined(rule: str, ticket_id: int) -> str:
    why = _DECLINE_TEXT.get(rule, "That request doesn't meet our refund policy.")
    return (f"I'm sorry, I can't refund this. {why} "
            f"Your ticket number is #{ticket_id} if you'd like a person to take another look.")

#Stripe m kuch mila hi nahi
def no_duplicate_found() -> str:
    return ("I checked your payments and I can't see a duplicate charge on your account. "
            "If you can tell me the date and amount you're looking at, I'll check again.")


def no_payments_found() -> str:
    return "I can't find any payments on your account yet, so there is nothing for me to refund."


def not_linked() -> str:
    return ("I can't find a billing account for you yet. "
            "Once you've subscribed, I'll be able to look at your payments.")

# ---------- Hand-off aur jo abhi automatic nahi ----------

def handoff(ticket_id: int) -> str:
    return ("I'm passing this to our team so a person can help you. "
            f"I've saved our conversation as ticket #{ticket_id}, and someone will email you within a few hours. "
            "You won't need to explain it again.")


def not_automatic_yet(ticket_id: int) -> str:
    return (f"I can't do this one on my own, so I've passed it to our team as ticket #{ticket_id}. "
            "Someone will email you within a few hours.")


def ask_question(question: str | None, customer_text: str = "") -> str:
    if question:
        return question
    t = customer_text.lower()
    if any(k in t for k in ("pro", "feature", "pricing", "plan", "cost", "include", "tier")):
        return (
            "CloudNotes Pro ($20/month) includes unlimited cloud notes, instant multi-device synchronization, "
            "AI-powered semantic search, complete revision history, and priority customer support. "
            "I can also assist you with billing, duplicate charges, cancellations, or refunds. What would you like help with?"
        )
    return "I can help with billing questions, duplicate charges, refunds and cancellations. What do you need?"


def held(ticket_status: str, ticket_id: int) -> str:
    """Ticket pehle se kisi insaan ke paas hai. Dobara process nahi karte, bas sach status batate hain."""
    text = {
        "waiting_for_approval": "Your request is still waiting for approval from our team.",
        "waiting_for_agent": "We're connecting you to a person from our team.",
        "needs_human": "A person from our team is looking at this.",
    }.get(ticket_status, "Our team is handling this.")
    return f"{text} Your ticket number is #{ticket_id}. I'll update you here and by email."


def system_error(ticket_id: int) -> str:
    return (f"Something went wrong on our side. I've saved your request as ticket #{ticket_id} "
            "and our team will check it and follow up by email.")


def action_failed(ticket_id: int) -> str:
    return ("I couldn't confirm that refund, so I can't tell you it's done. "
            f"I've passed it to our team as ticket #{ticket_id}. They will check it and email you.")


def also_mentioned(intent_label: str) -> str:
    """Customer ne ek message me do cheezein maangi. Ek ho gayi, doosri ke liye honest line."""
    return (f" Once this is done, send me another message about the {intent_label} "
            "and I'll look at it next.")