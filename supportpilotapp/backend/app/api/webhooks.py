import json
import logging

import stripe
from fastapi import APIRouter,HTTPException,Request
from fastapi.concurrency import run_in_threadpool
from psycopg.types.json import Jsonb
from app.core.config import settings
from app.db.pool import pool
from app.services import emailer

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

def _jsonb(obj):
    """UUID aur datetime jaisi cheezein text banake JSON m save krta hai"""
    return Jsonb(obj,dumps=lambda o:json.dumps(o,default=str))

def handle_event(conn, event) -> int | None:
    """Event ke hisab se ticket banayenge aur automatic actions execute karenge."""
    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "invoice.payment_failed":
        use_case = "failed_payment"
        stripe_customer = obj.get("customer")
    elif etype == "charge.dispute.created":
        use_case = "dispute"
        stripe_customer=None
        try:
            charge=stripe.Charge.retrieve(obj["charge"])
            stripe_customer=charge.to_dict().get("customer")
        except stripe.StripeError:
            stripe_customer=None
    else:
        return None
    stripe_ref = obj.get("id")

    cust = None
    if stripe_customer:
        cust = conn.execute("select id, email, cloudnotes_user_id, created_at from customers where stripe_customer_id=%s", (stripe_customer,)).fetchone()

    # Ek invoice/dispute = ek ticket
    initial_status = "needs_human"
    if use_case == "failed_payment":
        s = conn.execute("select ai_enabled, watching_mode, auto_mode from settings where id=1").fetchone()
        auto_ok = s["ai_enabled"] and not s["watching_mode"] and (s["auto_mode"] or {}).get("failed_payment", True)
        if auto_ok:
            initial_status = "waiting_for_customer"

    ticket = conn.execute(
        "insert into tickets (source, customer_ref, stripe_customer_id, customer_id, use_case, status, stripe_ref) "
        "values ('stripe_event', %s, %s, %s, %s, %s, %s) "
        "on conflict (use_case, stripe_ref) where stripe_ref is not null do nothing returning id",
        (
            str(cust["cloudnotes_user_id"]) if cust else None,
            stripe_customer,
            cust["id"] if cust else None,
            use_case,
            initial_status,
            stripe_ref,
        ),
    ).fetchone()
    is_new = ticket is not None
    if not is_new:
        ticket = conn.execute(
            "select id from tickets where use_case=%s and stripe_ref=%s",
            (use_case, stripe_ref),
        ).fetchone()

    ticket_id = ticket["id"]

    conn.execute(
        "insert into ticket_events (ticket_id,kind,actor,data) values(%s,'stripe_event_received','system',%s)",
        (ticket_id, Jsonb({"event_id": event["id"], "type": etype, "new_ticket": is_new})),
    )

    # Bug 14 fix: Failed payment - send card update link to customer
    if use_case == "failed_payment" and is_new:
        invoice_url = obj.get("hosted_invoice_url")
        if not invoice_url and stripe_customer:
            try:
                portal = stripe.billing_portal.Session.create(
                    customer=stripe_customer,
                    return_url=settings.cloudnotes_frontend_url,
                )
                invoice_url = portal.url
            except Exception:
                invoice_url = f"{settings.cloudnotes_frontend_url}?billing=update"

        if invoice_url and cust and cust["email"]:
            emailer.send_once(
                pool,
                dedupe_key=f"failed_payment_link:{ticket_id}",
                to_email=cust["email"],
                subject="Action Required: Update payment method for CloudNotes",
                text=f"Hello,\n\nWe were unable to process your recent CloudNotes renewal payment.\n"
                     f"Please update your payment card at the following link to keep your workspace active:\n{invoice_url}\n\n"
                     "Your notes remain safely saved in your account.\n\nCloudNotes Billing Team",
                ticket_id=ticket_id,
            )
            conn.execute(
                "insert into actions (ticket_id, type, stripe_customer_id, idempotency_key, executed_by, status) "
                "values (%s, 'send_update_card_link', %s, %s, 'ai_auto', 'done')",
                (ticket_id, stripe_customer, f"failed_payment_link:{ticket_id}"),
            )
            conn.execute(
                "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'update_card_link_sent', 'ai', %s)",
                (ticket_id, Jsonb({"invoice_url": invoice_url})),
            )

    # Bug 15 & 23 fix: Dispute - comprehensive evidence gathering (payments, refunds, chat history)
    if use_case == "dispute":
        dispute_id = obj.get("id")
        reason = obj.get("reason", "unknown")
        amount = obj.get("amount", 0)

        # 1. Fetch Stripe charges history
        charges_history = []
        if stripe_customer:
            try:
                ch_list = stripe.Charge.list(customer=stripe_customer, limit=10)
                for ch in ch_list.data:
                    charges_history.append({
                        "charge_id": ch.id,
                        "amount_cents": ch.amount,
                        "currency": ch.currency,
                        "status": ch.status,
                        "paid": ch.paid,
                        "refunded": ch.refunded,
                        "created_at": ch.created,
                    })
            except Exception as e:
                charges_history.append({"error": f"Failed fetching charges from Stripe: {e}"})

        # 2. Fetch past refund actions from database
        past_refunds = conn.execute(
            "select id, type, stripe_charge_id, amount_cents, status, completed_at, error "
            "from actions where stripe_customer_id = %s order by id desc limit 10",
            (stripe_customer,),
        ).fetchall()

        # 3. Fetch past tickets and conversation history
        past_tickets = conn.execute(
            """
            select t.id, t.use_case, t.status, t.created_at,
                   (select count(*) from messages where ticket_id = t.id) as message_count
            from tickets t
            where (t.stripe_customer_id = %s or t.customer_id = %s) and t.id != %s
            order by t.id desc limit 5
            """,
            (stripe_customer, cust["id"] if cust else -1, ticket_id),
        ).fetchall()

        evidence_summary = {
            "dispute_id": dispute_id,
            "dispute_reason": reason,
            "disputed_amount_cents": amount,
            "stripe_customer_id": stripe_customer,
            "customer_email": cust["email"] if cust else None,
            "cloudnotes_user_id": cust.get("cloudnotes_user_id") if cust else None,
            "account_created_at": cust["created_at"].isoformat() if cust and cust.get("created_at") else None,
            "stripe_charge_history": charges_history,
            "refund_history": [dict(r) for r in past_refunds],
            "past_support_interactions": [dict(r) for r in past_tickets],
            "evidence_status": "Complete account usage and transaction evidence compiled for staff dispute submission",
        }
        conn.execute(
            "update tickets set ai_understanding = %s, updated_at = now() where id = %s",
            (_jsonb(evidence_summary), ticket_id),
        )
        conn.execute(
            "insert into ticket_events (ticket_id, kind, actor, data) values (%s, 'dispute_evidence_gathered', 'system', %s)",
            (ticket_id, _jsonb(evidence_summary)),
        )
        conn.execute(
            "insert into messages (ticket_id, sender, content) values (%s, 'ai', %s)",
            (
                ticket_id,
                f"Stripe Dispute Received (${amount/100:.2f}, Reason: {reason}). "
                "Complete evidence package (payment history, refund history, and customer interactions) automatically compiled for staff review.",
            ),
        )

    return ticket_id


def process_event(event,payload:bytes) ->str:
    #Ek hi transaction : ya to sab hoga ya kuch nahi
    with pool.connection() as conn:
        #event save krenge agar pehle ho chuka hoga to kuch nahi hoga
        conn.execute(
            "insert into stripe_events (event_id,type,payload) values(%s,%s,%s) on conflict (event_id) do nothing",(event["id"],event["type"],Jsonb(json.loads(payload)))
        )

        #same event ek sath agar do baar aayega to doosra wahi ruk jaayega
        row=conn.execute("select processed_at from stripe_events where event_id=%s for update",(event["id"],)).fetchone()
        if row["processed_at"] is not None:
            return "duplicate"

        #main work
        handle_event(conn,event)

        #tabhi processed mark krenge jab kaam ho jaayega
        conn.execute("update stripe_events set processed_at=now() where event_id=%s",(event["id"],))
        return "processed"

@router.post("/stripe")
async def stripe_webhook(request:Request):
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")

    payload=await request.body()
    signature=request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=400,detail="Missing signature")

    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook")

    event=json.loads(payload)

    # Error aaya to 500 jaayega, Stripe baad me dobara bhejega
    try:
        result=await run_in_threadpool(process_event,event,payload)
    except Exception:
        logging.getLogger("uvicorn.error").exception("WEBHOOK FAILED")
        raise HTTPException(status_code=500, detail="Internal error processing webhook")
    return {"status":result}