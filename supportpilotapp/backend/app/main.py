from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from app.db.pool import pool
from app.api import tickets, webhooks

@asynccontextmanager
async def lifespan(app:FastAPI):
    pool.open()
    yield
    pool.close()

app=FastAPI(title="SupportPilot AI", lifespan=lifespan)
app.include_router(tickets.router)
app.include_router(webhooks.router)

@app.get("/health")
def home():
    return "Hii Kashish"

@app.get("/health/db")
def health_db():
    try:
        with pool.connection() as conn:
            row=conn.execute("select 1 as ok").fetchone()
        return {"db":"ok","result":row["ok"]}
    except Exception:
        raise HTTPException(status_code=503,detail="Database not reachable")