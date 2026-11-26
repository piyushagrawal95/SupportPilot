from contextlib import asynccontextmanager
import stripe
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.db.pool import pool
from app.api import (
    activity,
    approvals,
    auth,
    chat,
    decision_log,
    live,
    overview,
    performance,
    settings as settings_api,
    test_suite,
    tickets,
    users,
    webhooks,
)
from app.core.config import settings
from app.services.scheduler import start_background_scheduler, stop_background_scheduler

stripe.api_key = settings.stripe_secret_key

@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    with pool.connection() as conn:
        conn.execute("alter table staff_users add column if not exists reset_token_hash text;")
        conn.execute("alter table staff_users add column if not exists reset_token_expires_at timestamptz;")
        conn.execute("""
            create table if not exists role_requests (
                id serial primary key,
                staff_user_id bigint not null references staff_users(id) on delete cascade,
                requested_role text not null,
                reason text,
                status text not null default 'pending',
                created_at timestamptz not null default now(),
                decided_at timestamptz,
                decided_by bigint references staff_users(id)
            );
        """)
    sched_task = start_background_scheduler(pool)
    yield
    stop_background_scheduler(sched_task)
    pool.close()

app = FastAPI(title="SupportPilot AI", lifespan=lifespan)

# CORS middleware with dynamic origins from config (Bug 38 fix)
origins = set(filter(None, [
    settings.frontend_url,
    settings.cloudnotes_frontend_url,
] + [o.strip() for o in settings.cors_origins.split(",") if o.strip()]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core direct endpoints (external webhooks and SSE chat stream)
app.include_router(chat.router)
app.include_router(webhooks.router)

# All REST API endpoints mounted once under /api (Bug 8 fix: eliminated double mounts)
app.include_router(auth.router, prefix="/api")
app.include_router(overview.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(live.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(performance.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(test_suite.router, prefix="/api")
app.include_router(decision_log.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "service": "SupportPilot AI"}

@app.get("/health/db")
def health_db():
    try:
        with pool.connection() as conn:
            row = conn.execute("select 1 as ok").fetchone()
        return {"db": "ok", "result": row["ok"]}
    except Exception:
        raise HTTPException(status_code=503, detail="Database not reachable")
