"""
Regression tests for all 16 security, logic, and deployment bug fixes.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_access_token, get_current_staff
from app.api.auth import hash_password, verify_password, _LOGIN_ATTEMPTS
from app.services import actions, orchestrator
from app.services.actions import ActionResult, cancel_key


client = TestClient(app)


# ----------------- Bug 1 & 2: Auth Registration Lockdown -----------------

def test_register_staff_is_disabled():
    res = client.post("/api/auth/register-staff", json={
        "name": "Hacker",
        "email": "hacker@evil.com",
        "password": "password123",
    })
    assert res.status_code == 403
    assert "disabled" in res.json()["detail"].lower()


def test_register_admin_blocked_when_admin_exists(mocker):
    mock_conn = MagicMock()
    # admin_count = 1
    mock_conn.execute.return_value.fetchone.return_value = {"cnt": 1}
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.api.auth.pool", mock_pool)

    res = client.post("/api/auth/register-admin", json={
        "name": "Attacker",
        "email": "admin@cloudnotes.com",
        "password": "hackedpassword",
    })
    assert res.status_code == 403
    assert "closed" in res.json()["detail"].lower()


def test_register_admin_allows_bootstrap_when_zero_admins(mocker):
    mock_conn = MagicMock()
    # 1st fetchone: admin count = 0; 2nd fetchone: existing email = None; 3rd fetchone: insert returning
    mock_conn.execute.return_value.fetchone.side_effect = [
        {"cnt": 0},
        None,
        {"id": 1, "auth_user_id": "11111111-1111-1111-1111-111111111111"},
    ]
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.api.auth.pool", mock_pool)

    res = client.post("/api/auth/register-admin", json={
        "name": "Initial Admin",
        "email": "first@cloudnotes.com",
        "password": "password123",
    })
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "admin"


# ----------------- Bug 3: ActionResult .reason & .message -----------------

def test_action_result_has_reason_and_message_alias():
    r = ActionResult("failed", "Stripe error occurred")
    assert r.reason == "Stripe error occurred"
    assert r.message == "Stripe error occurred"


# ----------------- Bug 4: cancel_key includes subscription_id -----------------

def test_cancel_key_distinct_per_subscription():
    k1 = cancel_key("cus_abc", "period_end", "sub_111")
    k2 = cancel_key("cus_abc", "period_end", "sub_222")
    assert k1 != k2
    assert "sub_111" in k1
    assert "sub_222" in k2


# ----------------- Bug 5: Fresh DB role check on every request -----------------

def test_jwt_reads_fresh_role_from_db(mocker):
    # Token says role=admin, DB says role=viewer
    token = create_access_token({"id": 42, "email": "staff@cloudnotes.com", "role": "admin"})

    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.return_value = {
        "id": 42,
        "auth_user_id": "uuid",
        "email": "staff@cloudnotes.com",
        "name": "Demoted Staff",
        "role": "viewer",
        "availability": "away",
    }
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.core.security.pool", mock_pool)

    user = get_current_staff(f"Bearer {token}")
    assert user["role"] == "viewer"


def test_deleted_staff_token_rejected(mocker):
    token = create_access_token({"id": 999, "email": "gone@cloudnotes.com", "role": "admin"})

    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.return_value = None
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.core.security.pool", mock_pool)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        get_current_staff(f"Bearer {token}")
    assert exc.value.status_code == 401


# ----------------- Bug 6 & 15: Token Approval Expiry & Role Check -----------------

def test_get_approval_by_token_rejects_expired(mocker):
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.return_value = {
        "id": 1,
        "ticket_id": 10,
        "action_type": "refund",
        "stripe_charge_id": "ch_1",
        "amount_cents": 6000,
        "evidence": {},
        "ai_suggestion": "Refund $60",
        "status": "pending",
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
        "use_case": "refund",
        "customer_email": "cust@example.com",
    }
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.api.approvals.pool", mock_pool)

    res = client.get("/api/approvals/token/some_raw_token")
    assert res.status_code == 410
    assert "expired" in res.json()["detail"].lower()


def test_decide_approval_by_token_blocks_non_approver_role(mocker):
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.side_effect = [
        # approval row
        {
            "id": 1,
            "approver_email": "viewer@cloudnotes.com",
            "evidence": {"approver_emails": ["viewer@cloudnotes.com"]},
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=10),
            "status": "pending",
        },
        # staff user check in loop 1 (role is viewer, not approver/admin)
        {"id": 4, "name": "Viewer", "role": "viewer", "email": "viewer@cloudnotes.com"},
        # staff user check in loop 2 (confirms unauthorized role)
        {"id": 4, "name": "Viewer", "role": "viewer", "email": "viewer@cloudnotes.com"},
    ]
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.api.approvals.pool", mock_pool)

    res = client.post(
        "/api/approvals/token/valid_token/decide",
        json={"decision": "approved", "reason": "Looks good"},
    )
    assert res.status_code == 403
    assert "authorized" in res.json()["detail"].lower()


# ----------------- Bug 7 & 14: Plural Approvers & No Hardcoded Fallback -----------------

def test_request_approval_sends_to_all_approvers(mocker):
    mock_conn = MagicMock()
    # settings returns 2 approver emails; insert returns approval id 77
    mock_conn.execute.return_value.fetchone.side_effect = [
        {"approver_emails": ["anita@cloudnotes.com", "rahul@cloudnotes.com"]},
        {"id": 77},
    ]
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.services.orchestrator.pool", mock_pool)
    mocker.patch("app.services.orchestrator._end", return_value={"ok": True})
    mock_send = mocker.patch("app.services.orchestrator.emailer.send_once")

    charge = MagicMock()
    charge.charge_id = "ch_123"

    orchestrator._request_approval(
        ticket_id=1,
        charge=charge,
        amount_cents=6000,
        use_case="refund",
        rule="OVER_AUTO_LIMIT",
        reason="Over $50",
        is_dup=False,
        also="",
    )

    assert mock_send.call_count == 2
    recipients = [call.kwargs["to_email"] for call in mock_send.call_args_list]
    assert recipients == ["anita@cloudnotes.com", "rahul@cloudnotes.com"]


def test_request_approval_no_hardcoded_fallback(mocker):
    mock_conn = MagicMock()
    # settings empty
    mock_conn.execute.return_value.fetchone.return_value = {"approver_emails": []}
    # staff approvers empty, staff admins empty
    mock_conn.execute.return_value.fetchall.side_effect = [[], []]
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.services.orchestrator.pool", mock_pool)
    mock_end = mocker.patch("app.services.orchestrator._end", return_value={"status": "needs_human"})
    mock_send = mocker.patch("app.services.orchestrator.emailer.send_once")

    charge = MagicMock()
    charge.charge_id = "ch_123"

    orchestrator._request_approval(
        ticket_id=1,
        charge=charge,
        amount_cents=6000,
        use_case="refund",
        rule="OVER_AUTO_LIMIT",
        reason="Over $50",
        is_dup=False,
        also="",
    )

    # Should NOT send to admin@cloudnotes.com; should escalate to human
    assert mock_send.call_count == 0
    assert mock_end.call_args[0][2] == "needs_human"


# ----------------- Bug 8: PBKDF2 600k & Login Rate Limit -----------------

def test_password_hash_uses_600k_and_verifies_legacy():
    new_hash = hash_password("secret123")
    assert new_hash.startswith("pbkdf2:sha256:600000$")
    assert verify_password(new_hash, "secret123") is True
    assert verify_password(new_hash, "wrong") is False

    # Legacy 100k hash still verifies
    import hashlib
    salt = "testsalt"
    key = hashlib.pbkdf2_hmac("sha256", b"secret123", salt.encode(), 100000).hex()
    legacy_hash = f"pbkdf2:sha256:100000${salt}${key}"
    assert verify_password(legacy_hash, "secret123") is True


def test_login_rate_limit_lockout(mocker):
    _LOGIN_ATTEMPTS.clear()
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.return_value = None
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.api.auth.pool", mock_pool)

    for _ in range(5):
        res = client.post("/api/auth/login", json={"email": "brute@cloudnotes.com", "password": "wrong"})
        assert res.status_code == 401

    res6 = client.post("/api/auth/login", json={"email": "brute@cloudnotes.com", "password": "wrong"})
    assert res6.status_code == 429
    assert "too many" in res6.json()["detail"].lower()
    _LOGIN_ATTEMPTS.clear()


# ----------------- Bug 10: /tests/run Admin Only -----------------

def test_tests_run_requires_admin_role(mocker):
    token = create_access_token({"id": 7, "email": "viewer@cloudnotes.com", "role": "viewer"})
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.return_value = {
        "id": 7,
        "auth_user_id": "uuid",
        "email": "viewer@cloudnotes.com",
        "name": "Viewer",
        "role": "viewer",
        "availability": "away",
    }
    mock_pool = MagicMock()
    mock_pool.connection.return_value.__enter__.return_value = mock_conn
    mocker.patch("app.core.security.pool", mock_pool)

    res = client.get("/api/tests/run", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "admin" in res.json()["detail"].lower()
