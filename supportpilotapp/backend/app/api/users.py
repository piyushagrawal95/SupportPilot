from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import require_roles
from app.db.pool import pool

router = APIRouter(prefix="/users", tags=["users"])

class RoleChangeIn(BaseModel):
    role: Literal["admin", "agent", "approver", "viewer"]

class RoleDecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]

@router.get("/overview")
def get_users_overview(
    search: str | None = None,
    current_user: dict = Depends(require_roles(["admin"])),
):
    with pool.connection() as conn:
        # 1. Staff users
        staff = conn.execute(
            """
            select id, auth_user_id, email, name, role, availability, last_seen_at, created_at
            from staff_users
            order by id asc
            """
        ).fetchall()

        # 2. Pending role requests
        role_requests = conn.execute(
            """
            select r.id, r.staff_user_id, r.requested_role, r.reason, r.status, r.created_at,
                   u.name as staff_name, u.email as staff_email, u.role as current_role
            from role_requests r
            join staff_users u on u.id = r.staff_user_id
            where r.status = 'pending'
            order by r.created_at desc
            """
        ).fetchall()

        # 3. CloudNotes customers
        cust_query = """
            select c.id, c.email, c.stripe_customer_id, c.created_at,
                   count(t.id) as ticket_count
            from customers c
            left join tickets t on t.customer_id = c.id
        """
        params = []
        if search and search.strip():
            cust_query += " where lower(c.email) like %s or lower(coalesce(c.stripe_customer_id, '')) like %s"
            term = f"%{search.strip().lower()}%"
            params.extend([term, term])

        cust_query += " group by c.id, c.email, c.stripe_customer_id, c.created_at order by c.created_at desc limit 100"
        customers = conn.execute(cust_query, tuple(params)).fetchall()

    return {
        "staff": [dict(s) for s in staff],
        "role_requests": [dict(r) for r in role_requests],
        "customers": [dict(c) for c in customers],
        "total_staff": len(staff),
        "total_customers": len(customers),
    }

@router.put("/staff/{user_id}/role")
def update_staff_role(
    user_id: int,
    body: RoleChangeIn,
    current_user: dict = Depends(require_roles(["admin"])),
):
    if user_id == current_user["id"] and body.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote your own admin account")

    with pool.connection() as conn:
        updated = conn.execute(
            "update staff_users set role = %s where id = %s returning id, email, name, role",
            (body.role, user_id),
        ).fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Staff user not found")

    return {"ok": True, "staff": dict(updated)}

@router.delete("/staff/{user_id}")
def delete_staff_user(
    user_id: int,
    current_user: dict = Depends(require_roles(["admin"])),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    with pool.connection() as conn:
        deleted = conn.execute(
            "delete from staff_users where id = %s returning id, email",
            (user_id,),
        ).fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="Staff user not found")

    return {"ok": True, "deleted": dict(deleted)}

@router.post("/role-requests/{request_id}/decide")
def decide_role_request(
    request_id: int,
    body: RoleDecisionIn,
    current_user: dict = Depends(require_roles(["admin"])),
):
    now = datetime.now(timezone.utc)
    with pool.connection() as conn:
        req = conn.execute(
            "select * from role_requests where id = %s for update",
            (request_id,),
        ).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Role request not found")
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

        # If approved, update staff user role
        if body.decision == "approved":
            conn.execute(
                "update staff_users set role = %s where id = %s",
                (req["requested_role"], req["staff_user_id"]),
            )

        conn.execute(
            "update role_requests set status = %s, decided_at = %s, decided_by = %s where id = %s",
            (body.decision, now, current_user["id"], request_id),
        )

    return {"ok": True, "decision": body.decision}
