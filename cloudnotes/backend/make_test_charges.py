"""Test helper: Stripe TEST mode m ek customer ke naam pe same amount ke N charges banata hai. Isse "charged twice" (duplicate ) wala 
scenario ban jaata hai"""

import os
import sys
import stripe

def load_key() -> str:
    key=os.environ.get("STRIPE_SECRET_KEY","")
    if not key and os.path.exists(".env"):
        with open(".env",encoding="utf-8") as f:
            for line in f:
                line=line.strip()
                if line.startswith("STRIPE_SECRET_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key

def main() -> None:
    if len(sys.argv) < 3:
        sys.exit("Usage: python make_test_charges.py <customer-email> <amount-in-dollars> [count]")

    email = sys.argv[1].strip().lower()
    amount_cents = int(round(float(sys.argv[2]) * 100))
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 2

    key = load_key()
    if not key.startswith(("sk_test_","rk_test_")):
        sys.exit("STOP: STRIPE_SECRET_KEY sk_test_ se shuru hona chahiye (sirf test mode).")
    stripe.api_key = key

    customers = stripe.Customer.list(email=email, limit=5).data
    if not customers:
        sys.exit(f"Is email ka koi Stripe customer nahi mila: {email}. Pehle CloudNotes pe Subscribe karo.")
    if len(customers) > 1:
        print("Warning: is email ke kai customers hain, pehla use ho raha hai:", [c.id for c in customers])
    cust = customers[0]

    pms = stripe.PaymentMethod.list(customer=cust.id, type="card", limit=1).data
    if pms:
        pm_id = pms[0].id
    else:
        # saved card nahi mila, to Stripe ka test card attach karte hain
        pm_id = stripe.PaymentMethod.attach("pm_card_visa", customer=cust.id).id

    print(f"Customer: {cust.id} ({email}) | card: {pm_id} | {count} x ${amount_cents / 100:.2f}")

    for i in range(count):
        pi = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            customer=cust.id,
            payment_method=pm_id,
            confirm=True,
            off_session=True,
            description="SupportPilot test charge",
            metadata={"purpose": "duplicate_charge_test"},
        )
        print(f"  charge {i + 1}: {pi.id} status={pi.status} latest_charge={pi.latest_charge}")

    print("Done. Ab 10 minute ke andar CloudNotes chat me bolo: 'I was charged twice'.")


if __name__ == "__main__":
    main()