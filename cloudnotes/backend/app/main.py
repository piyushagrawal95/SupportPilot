from contextlib import asynccontextmanager
from fastapi import FastAPI,Depends
from fastapi.middleware.cors import CORSMiddleware
from app.auth import current_user
from app.config import settings
from app.db import pool
from app import billing,chat

@asynccontextmanager
async def lifespan(app:FastAPI):
    pool.open()
    yield
    pool.close()

app=FastAPI(title="CloudNotes API",lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(billing.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"ok":True}

@app.get("/me")
def me(user=Depends(current_user)):
    return user