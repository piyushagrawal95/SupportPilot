from app.services import replies


def test_money_formats_cents():
    assert replies.money(2000) == "$20.00"
    assert replies.money(5) == "$0.05"
    assert replies.money(8050) == "$80.50"


def test_approval_message_never_says_done():
    text = replies.needs_approval(8000, 1042, is_duplicate=True).lower()
    assert "#1042" in text and "$80.00" in text
    assert "has been refunded" not in text and "have refunded" not in text


def test_declined_uses_rule_reason_and_has_fallback():
    assert "30 days" in replies.declined("REFUND_WINDOW_EXPIRED", 7)
    assert "refund policy" in replies.declined("SOMETHING_NEW", 7)


def test_system_error_makes_no_claim_about_money():
    assert "refunded" not in replies.system_error(5).lower()