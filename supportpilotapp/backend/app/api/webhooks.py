import json

import stripe
from fastapi import APIRouter,HTTPException,Request
from fastapi.concurrency import run_in_threadpool
from psycopg.types.json import Jsonb
from app.core.config import settings
from app.db.pool import pool

router=APIRouter(prefix="/webhooks",tags=["webhooks"])

def handle_event(conn,event) ->int |None:
    """Event ke hisab se ticket banayenge."""
    etype=event["type"]
    obj=event["data"]["object"]

    if etype=="invoice.payment_failed":
        use_case="failed_payment"
        stripe_customer=obj.get("customer")
    elif etype=="charge.dispute.created":
        use_case="dispute"
        stripe_customer=None        
    else:
        return None

    cust=None
    if stripe_customer:
        cust=conn.execute("select id, cloudnotes_user_id from customers where stripe_customer_id=%s",(stripe_customer,)).fetchone()

    ticket = conn.execute(
        "insert into tickets (source, customer_ref, stripe_customer_id, customer_id, use_case, status) "
        "values ('stripe_event', %s, %s, %s, %s, 'needs_human') returning id",
        (
            str(cust["cloudnotes_user_id"]) if cust else None,
            stripe_customer,
            cust["id"] if cust else None,
            use_case,
        ),
    ).fetchone()

    conn.execute("insert into ticket_events (ticket_id,kind,actor,data) values(%s,'stripe_event_received','system',%s)",
                 (ticket["id"],Jsonb({"event_id":event["id"],"type":etype})),)

    return ticket["id"]

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
    result = await run_in_threadpool(process_event, event, payload)
    return {"status": result}