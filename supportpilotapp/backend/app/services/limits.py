"""DB se settings aur customer ka record padh ke policy ke liye limits/CustomerHistory banata hai"""

from app.domain.facts import CustomerHistory, Limits
from app.services.actions import CAP_TZ

def build_limits(s: dict, auto_refunded_today_cents: int, use_case: str) -> Limits:
    """settings ki row + aaj ka hisaab -> Limits.
    Agar daily cap lag chuka hai (auto_refunds_paused), to cap 0 maante hain: koi bhi
    paise wala auto refund DAILY_CAP me atak ke approval me jayega, jab tak admin wapas na chalaye."""
    cap = 0 if s["auto_refunds_paused"] else s["daily_cap_cents"]
    return Limits(
        auto_refund_limit_cents=s["auto_refund_limit_cents"],
        daily_cap_cents=cap,
        auto_refunded_today_cents=auto_refunded_today_cents,
        ai_enabled=s["ai_enabled"],
        watching_mode=s["watching_mode"],
        auto_mode_for_case=bool((s["auto_mode"] or {}).get(use_case, False)),
    )
def load_limits(conn, use_case: str) -> Limits:
    """use_case: 'duplicate_charge' | 'refund' | 'cancellation' | 'failed_payment' (settings.auto_mode ki keys)."""
    s = conn.execute(
        "select ai_enabled, watching_mode, auto_refund_limit_cents, daily_cap_cents, "
        "auto_refunds_paused, auto_mode from settings where id=1").fetchone()
    today = conn.execute(
        "select coalesce(sum(amount_cents),0) as total from actions "
        "where type='refund' and status='done' and executed_by='ai_auto' "
        "and (completed_at at time zone %s)::date = (now() at time zone %s)::date",
        (CAP_TZ, CAP_TZ)).fetchone()["total"]
    return build_limits(s, int(today), use_case)


def load_history(conn, stripe_customer_id: str) -> CustomerHistory:
    """Kya is customer ko pichle 30 din me AI ne khud refund diya hai? (ek auto refund per 30 din)"""
    recent = conn.execute(
        "select 1 from actions where type='refund' and status='done' and executed_by='ai_auto' "
        "and stripe_customer_id=%s and completed_at > now() - interval '30 days' limit 1",
        (stripe_customer_id,)).fetchone()
    return CustomerHistory(auto_refund_in_last_30_days=recent is not None)