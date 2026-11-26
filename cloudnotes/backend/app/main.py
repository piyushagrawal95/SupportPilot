from contextlib import asynccontextmanager
from fastapi import FastAPI,Depends
from fastapi.middleware.cors import CORSMiddleware
from app.auth import current_user
from app.config import settings
from app.db import pool
from app import billing,chat,notes

@asynccontextmanager
async def lifespan(app:FastAPI):
    pool.open()
    yield
    pool.close()

app=FastAPI(title="CloudNotes API",lifespan=lifespan)

origins = set(filter(None, [settings.frontend_url] + [o.strip() for o in settings.cors_origins.split(",") if o.strip()]))
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(billing.router)
app.include_router(chat.router)
app.include_router(notes.router)



@app.get("/health")
def health():
    return {"ok":True}

@app.get("/me")
def me(user=Depends(current_user)):
    return user