import stripe
from fastapi import APIRouter,Depends,HTTPException
from app.auth import current_user
from app.config import settings
from app.db import pool

stripe.api_key=settings.stripe_secret_key

router=APIRouter(tags=["billing"])

def get_or_create_stripe_customer(user:dict)->str:
    with pool.connection() as conn:
        # row (agar first time h to bana denge)
        conn.execute("insert into customers(cloudnotes_user_id,email) values(%s::uuid,%s) on conflict (cloudnotes_user_id) do nothing",(user["id"],user["email"]),)

        # row lock karenge taaki do request ek sath aaye to dusri ruk jaaye
        row = conn.execute(
            "select id, stripe_customer_id from customers "
            "where cloudnotes_user_id = %s::uuid for update",
            (user["id"],),
        ).fetchone()

        if row["stripe_customer_id"]:
            return row["stripe_customer_id"]

        #Stripe customer banayenge
        cust=stripe.Customer.create(
            email=user["email"],
            metadata={"cloudnotes_user_id":user["id"]},
            idempotency_key=f"create-customer-{user['id']}"
        )

        conn.execute("update customers set stripe_customer_id=%s where id=%s",(cust.id,row["id"]))

        return cust.id

@router.post("/checkout")
def create_checkout(user=Depends(current_user)):
    try:
        customer_id=get_or_create_stripe_customer(user)

        active=stripe.Subscription.list(customer=customer_id,status="active",limit=1)
        if active.data:
            raise HTTPException(status_code=409,detail="You already have an active subscription")

        session=stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
            success_url=f"{settings.frontend_url}/?checkout=success",
            cancel_url=f"{settings.frontend_url}/?checkout=cancelled",
        )
    except stripe.StripeError:
        raise HTTPException(status_code=502,detail="Payment Provider error,please try again")
    

    return {"url":session.url}


@router.get("/status")
def get_billing_status(user=Depends(current_user)):
    """Returns real subscription status from Stripe (Bug 27 fix)."""
    with pool.connection() as conn:
        row = conn.execute(
            "select stripe_customer_id from customers where cloudnotes_user_id = %s::uuid",
            (user["id"],),
        ).fetchone()

    if not row or not row["stripe_customer_id"]:
        return {
            "subscribed": False,
            "plan": "Free Tier",
            "price": "$0 / month",
            "cancel_at_period_end": False,
        }

    cust_id = row["stripe_customer_id"]
    try:
        subs = stripe.Subscription.list(customer=cust_id, status="active", limit=1)
        if subs.data:
            sub = subs.data[0]
            return {
                "subscribed": True,
                "plan": "CloudNotes Pro",
                "price": "$20 / month",
                "cancel_at_period_end": sub.cancel_at_period_end,
                "current_period_end": getattr(sub, "current_period_end", None),
            }
    except stripe.StripeError:
        pass

    return {
        "subscribed": False,
        "plan": "Free Tier",
        "price": "$0 / month",
        "cancel_at_period_end": False,
    }
