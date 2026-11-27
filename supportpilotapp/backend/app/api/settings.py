import uuid
import hashlib
from typing import Literal
import stripe
from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from app.core.config import settings as app_settings
from app.core.security import get_current_staff, require_roles
from app.api.auth import hash_password, validate_password_strength
from app.db.pool import pool
from app.services.understand import SYSTEM_PROMPT

router = APIRouter(prefix="/settings", tags=["settings"])

class SettingsUpdateIn(BaseModel):
    ai_enabled: bool | None = None
    watching_mode: bool | None = None
    auto_refund_limit_cents: int | None = Field(default=None, ge=0)
    daily_cap_cents: int | None = Field(default=None, ge=0)
    auto_refunds_paused: bool | None = None
    approver_emails: list[str] | None = None
    auto_mode: dict[str, bool] | None = None

class TeamMemberCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=150)
    role: Literal["admin", "agent", "approver", "viewer"]
    password: str = Field(min_length=6, max_length=50)

class TeamMemberUpdateIn(BaseModel):
    name: str | None = None
    role: Literal["admin", "agent", "approver", "viewer"] | None = None
    availability: Literal["available", "away"] | None = None
    password: str | None = None

@router.get("")
def get_settings(_: dict = Depends(get_current_staff)):
    with pool.connection() as conn:
        s = conn.execute("select * from settings where id = 1").fetchone()
        team = conn.execute(
            "select id, auth_user_id, email, name, role, availability, last_seen_at, created_at "
            "from staff_users order by id asc"
        ).fetchall()

    # Check Stripe connectivity
    stripe_status = "connected"
    stripe_error = None
    try:
        stripe.Account.retrieve()
    except Exception as e:
        stripe_status = "error"
        stripe_error = str(e)

    return {
        "settings": dict(s),
        "team": [dict(m) for m in team],
        "stripe": {
            "status": stripe_status,
            "mode": "test",
            "key_prefix": "sk_test_••••••••••••",
            "error": stripe_error,
        },
    }

@router.put("")
def update_settings(
    body: SettingsUpdateIn,
    current_user: dict = Depends(require_roles(["admin"])),
):
    updates = []
    params = []

    if body.ai_enabled is not None:
        updates.append("ai_enabled = %s")
        params.append(body.ai_enabled)
    if body.watching_mode is not None:
        updates.append("watching_mode = %s")
        params.append(body.watching_mode)
    if body.auto_refund_limit_cents is not None:
        updates.append("auto_refund_limit_cents = %s")
        params.append(body.auto_refund_limit_cents)
    if body.daily_cap_cents is not None:
        updates.append("daily_cap_cents = %s")
        params.append(body.daily_cap_cents)
    if body.auto_refunds_paused is not None:
        updates.append("auto_refunds_paused = %s")
        params.append(body.auto_refunds_paused)
    if body.approver_emails is not None:
        updates.append("approver_emails = %s")
        params.append(body.approver_emails)
    if body.auto_mode is not None:
        # Bug 6 & Bug 5 fix: Gating auto_mode on test runs, prompt hash, and model stability
        current_prompt_hash = hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest()[:16]
        current_model = app_settings.llm_model or "groq/llama-3.3-70b-versatile"

        with pool.connection() as conn:
            curr_s = conn.execute(
                "select last_tested_prompt_hash, last_tested_model, test_results from settings where id = 1"
            ).fetchone()

        last_hash = curr_s.get("last_tested_prompt_hash") if curr_s else None
        last_model = curr_s.get("last_tested_model") if curr_s else None
        test_results = (curr_s.get("test_results") or {}) if curr_s else {}

        # Any attempt to turn a case_type to True must be gated
        for case_type, is_enabled in body.auto_mode.items():
            if is_enabled:
                # Bug 6: Prompt ya model badalne par retest ka gate
                if not last_hash or last_hash != current_prompt_hash or not last_model or last_model != current_model:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot enable auto mode: System prompt or LLM model has changed since last test run. Retest suite before enabling."
                    )
                # Bug 5: Us case type ka last test run pass ho tabhi on ho
                if not test_results.get(case_type, False):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot enable auto mode for '{case_type}': Test suite for this use case must pass first."
                    )

        updates.append("auto_mode = %s")
        params.append(Jsonb(body.auto_mode))

    if not updates:
        raise HTTPException(status_code=400, detail="No settings fields to update")

    updates.append("updated_at = now()")
    sql = f"update settings set {', '.join(updates)} where id = 1 returning *"

    with pool.connection() as conn:
        updated = conn.execute(sql, tuple(params)).fetchone()

    return {"ok": True, "settings": dict(updated)}

@router.post("/team")
def add_team_member(
    body: TeamMemberCreateIn,
    _: dict = Depends(require_roles(["admin"])),
):
    validate_password_strength(body.password)
    with pool.connection() as conn:
        existing = conn.execute("select id from staff_users where lower(email) = lower(%s)", (body.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="A user with that email already exists")

        auth_id = uuid.uuid4()
        pw_hash = hash_password(body.password)
        row = conn.execute(
            """
            insert into staff_users (auth_user_id, email, name, role, availability, password_hash)
            values (%s, %s, %s, %s, 'away', %s)
            returning id, auth_user_id, email, name, role, availability, created_at
            """,
            (auth_id, body.email.strip().lower(), body.name.strip(), body.role, pw_hash),
        ).fetchone()

        return {"ok": True, "member": dict(row)}

@router.put("/team/{user_id}")
def update_team_member(
    user_id: int,
    body: TeamMemberUpdateIn,
    _: dict = Depends(require_roles(["admin"])),
):
    updates = []
    params = []
    if body.name is not None:
        updates.append("name = %s")
        params.append(body.name.strip())
    if body.role is not None:
        updates.append("role = %s")
        params.append(body.role)
    if body.availability is not None:
        updates.append("availability = %s")
        params.append(body.availability)
    if body.password is not None and body.password.strip():
        pw = body.password.strip()
        validate_password_strength(pw)
        updates.append("password_hash = %s")
        params.append(hash_password(pw))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    params.append(user_id)
    sql = f"update staff_users set {', '.join(updates)} where id = %s returning id, email, name, role, availability"

    with pool.connection() as conn:
        updated = conn.execute(sql, tuple(params)).fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Team member not found")

    return {"ok": True, "member": dict(updated)}

@router.delete("/team/{user_id}")
def delete_team_member(
    user_id: int,
    current_user: dict = Depends(require_roles(["admin"])),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    with pool.connection() as conn:
        deleted = conn.execute("delete from staff_users where id = %s returning id, email", (user_id,)).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Team member not found")

    return {"ok": True, "deleted": dict(deleted)}
