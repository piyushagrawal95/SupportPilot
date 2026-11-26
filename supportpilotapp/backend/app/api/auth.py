import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from app.core.config import settings
from app.core.security import create_access_token, get_current_staff
from app.db.pool import pool
from app.services import emailer

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterAdminRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)

class RegisterStaffRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)

class RoleUpgradeRequestIn(BaseModel):
    requested_role: Literal["approver", "admin", "viewer"]
    reason: str | None = Field(default=None, max_length=500)

class AvailabilityRequest(BaseModel):
    availability: Literal["available", "away"]

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"pbkdf2:sha256:100000${salt}${key}"

def verify_password(stored: str | None, provided: str) -> bool:
    if not stored:
        return False
    try:
        parts = stored.split("$")
        if len(parts) == 3 and parts[0].startswith("pbkdf2:sha256:"):
            iters = int(parts[0].split(":")[2])
            salt = parts[1]
            expected_hex = parts[2]
            computed_hex = hashlib.pbkdf2_hmac("sha256", provided.encode("utf-8"), salt.encode("utf-8"), iters).hex()
            return hmac.compare_digest(computed_hex, expected_hex)
        elif len(parts) == 4 and parts[0] == "pbkdf2:sha256":
            iters = int(parts[1])
            salt = parts[2]
            expected_hex = parts[3]
            computed_hex = hashlib.pbkdf2_hmac("sha256", provided.encode("utf-8"), salt.encode("utf-8"), iters).hex()
            return hmac.compare_digest(computed_hex, expected_hex)
        return False
    except Exception:
        return False

@router.post("/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    with pool.connection() as conn:
        user = conn.execute(
            "select id, auth_user_id, email, name, role, availability, password_hash "
            "from staff_users where lower(email) = %s",
            (email,),
        ).fetchone()

        if not user or not verify_password(user["password_hash"], req.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        now = datetime.now(timezone.utc)
        conn.execute(
            "update staff_users set last_seen_at = %s where id = %s",
            (now, user["id"]),
        )

        token = create_access_token({
            "id": user["id"],
            "auth_user_id": str(user["auth_user_id"]),
            "email": user["email"],
            "name": user["name"] or user["email"],
            "role": user["role"],
            "availability": user["availability"],
        })

        return {
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"] or user["email"],
                "role": user["role"],
                "availability": user["availability"],
            },
        }

@router.post("/register-admin")
def register_admin(req: RegisterAdminRequest):
    email = req.email.strip().lower()
    name = req.name.strip()
    pw_hash = hash_password(req.password)
    now = datetime.now(timezone.utc)

    with pool.connection() as conn:
        existing = conn.execute(
            "select id, auth_user_id, email, name, role, availability from staff_users where lower(email) = %s",
            (email,),
        ).fetchone()

        if existing:
            # Promote existing user to admin with new password
            conn.execute(
                "update staff_users set name = %s, role = 'admin', password_hash = %s, availability = 'available', last_seen_at = %s where id = %s",
                (name, pw_hash, now, existing["id"]),
            )
            user_id = existing["id"]
            auth_user_id = str(existing["auth_user_id"])
        else:
            auth_id = uuid.uuid4()
            row = conn.execute(
                """
                insert into staff_users (auth_user_id, email, name, role, availability, password_hash, last_seen_at)
                values (%s, %s, %s, 'admin', 'available', %s, %s)
                returning id, auth_user_id
                """,
                (auth_id, email, name, pw_hash, now),
            ).fetchone()
            user_id = row["id"]
            auth_user_id = str(row["auth_user_id"])

        token = create_access_token({
            "id": user_id,
            "auth_user_id": auth_user_id,
            "email": email,
            "name": name,
            "role": "admin",
            "availability": "available",
        })

        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": email,
                "name": name,
                "role": "admin",
                "availability": "available",
            },
        }

@router.post("/register-staff")
def register_staff(req: RegisterStaffRequest):
    email = req.email.strip().lower()
    name = req.name.strip()
    pw_hash = hash_password(req.password)
    now = datetime.now(timezone.utc)

    with pool.connection() as conn:
        existing = conn.execute(
            "select id from staff_users where lower(email) = %s",
            (email,),
        ).fetchone()

        if existing:
            raise HTTPException(status_code=400, detail="An account with this email already exists")

        auth_id = uuid.uuid4()
        row = conn.execute(
            """
            insert into staff_users (auth_user_id, email, name, role, availability, password_hash, last_seen_at)
            values (%s, %s, %s, 'agent', 'available', %s, %s)
            returning id, auth_user_id
            """,
            (auth_id, email, name, pw_hash, now),
        ).fetchone()
        user_id = row["id"]
        auth_user_id = str(row["auth_user_id"])

        token = create_access_token({
            "id": user_id,
            "auth_user_id": auth_user_id,
            "email": email,
            "name": name,
            "role": "agent",
            "availability": "available",
        })

        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": email,
                "name": name,
                "role": "agent",
                "availability": "available",
            },
        }

@router.post("/role-request")
def request_role_upgrade(
    req: RoleUpgradeRequestIn,
    current_user: dict = Depends(get_current_staff),
):
    if current_user["role"] == "admin":
        raise HTTPException(status_code=400, detail="You are already an Administrator")

    if current_user["role"] == req.requested_role:
        raise HTTPException(status_code=400, detail=f"You already have the {req.requested_role} role")

    with pool.connection() as conn:
        # Check if already has a pending request
        pending = conn.execute(
            "select id from role_requests where staff_user_id = %s and status = 'pending'",
            (current_user["id"],),
        ).fetchone()
        if pending:
            raise HTTPException(status_code=400, detail="You already have a pending role upgrade request under review")

        row = conn.execute(
            """
            insert into role_requests (staff_user_id, requested_role, reason)
            values (%s, %s, %s)
            returning id, requested_role, reason, status, created_at
            """,
            (current_user["id"], req.requested_role, req.reason),
        ).fetchone()

    return {"ok": True, "request": dict(row)}

@router.get("/my-role-requests")
def get_my_role_requests(current_user: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        rows = conn.execute(
            """
            select id, requested_role, reason, status, created_at, decided_at
            from role_requests
            where staff_user_id = %s
            order by created_at desc
            """,
            (current_user["id"],),
        ).fetchall()

    return {"requests": [dict(r) for r in rows]}

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        conn.execute("update staff_users set last_seen_at = now() where id = %s", (current_user["id"],))
        user = conn.execute(
            "select id, auth_user_id, email, name, role, availability, last_seen_at "
            "from staff_users where id = %s",
            (current_user["id"],),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user)

@router.post("/availability")
def set_availability(req: AvailabilityRequest, current_user: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        conn.execute(
            "update staff_users set availability = %s, last_seen_at = now() where id = %s",
            (req.availability, current_user["id"]),
        )
    return {"ok": True, "availability": req.availability}

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email = req.email.strip().lower()
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    with pool.connection() as conn:
        user = conn.execute("select id, email, name from staff_users where lower(email) = %s", (email,)).fetchone()
        if user:
            conn.execute(
                "update staff_users set reset_token_hash = %s, "
                "reset_token_expires_at = now() + interval '1 hour' where id = %s",
                (token_hash, user["id"]),
            )
            reset_link = f"{settings.frontend_url}/reset-password?token={raw_token}"
            emailer.send_once(
                pool,
                dedupe_key=f"staff_reset:{user['id']}:{int(datetime.now(timezone.utc).timestamp())}",
                to_email=user["email"],
                subject="SupportPilot Staff Password Reset Request",
                text=f"Hello {user['name'] or 'Staff'},\n\nA password reset was requested for your SupportPilot account.\n"
                     f"Click the link below to set a new password:\n{reset_link}\n\n"
                     "This link will expire in 1 hour. If you did not request this, please ignore this email.",
            )

    return {"ok": True, "message": "If this email is registered, a password reset link has been dispatched."}

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    raw_token = req.token.strip()
    if not raw_token:
        raise HTTPException(status_code=400, detail="Missing reset token")

    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)

    with pool.connection() as conn:
        user = conn.execute(
            "select id from staff_users where reset_token_hash = %s and reset_token_expires_at > %s",
            (token_hash, now),
        ).fetchone()

        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        new_hash = hash_password(req.new_password)
        conn.execute(
            "update staff_users set password_hash = %s, reset_token_hash = null, reset_token_expires_at = null where id = %s",
            (new_hash, user["id"]),
        )

    return {"ok": True, "message": "Password reset successfully. Please log in with your new password."}
