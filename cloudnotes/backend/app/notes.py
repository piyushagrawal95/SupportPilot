import time

import stripe
from fastapi import APIRouter,Depends,HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.auth import current_user
from app.db import pool
from app.ai import generate_note_from_ai, assist_existing_note

router=APIRouter(prefix="/notes",tags=["notes"])

FREE_NOTE_LIMIT=10

# Pro hai ya nahi: Stripe se puchenge
_PRO_CACHE:dict[str,tuple[float,bool]]={}

def is_pro(user_id:str) -> bool:
    hit = _PRO_CACHE.get(user_id)
    if hit and hit[0] > time.time():
        return hit[1]
    with pool.connection() as conn:
        row = conn.execute("select stripe_customer_id from customers where cloudnotes_user_id=%s::uuid", (user_id,)).fetchone()
    pro = hit[1] if hit else False
    if row and row["stripe_customer_id"]:
        try:
            pro = bool(stripe.Subscription.list(customer=row["stripe_customer_id"], status="active", limit=1).data)
        except (stripe.StripeError, Exception):
            # Stripe API error / network failure hone par pichhli known value retain karo
            pro = hit[1] if hit else False
    _PRO_CACHE[user_id] = (time.time() + 30, pro)
    return pro

def need_pro(feature:str):
    raise HTTPException(403,{"code":"pro_required","message":f"{feature} is a Pro feature. Upgrade to CloudNotes Pro to use it."})

class NoteIn(BaseModel):
    title: str = Field(default="Untitled", max_length=200)
    body: str = Field(default="", max_length=100_000)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=100_000)
    pinned: bool | None = None
    tags: list[str] | None = None

def _clean_tags(tags: list[str]) -> list[str]:
    return sorted({t.strip().lower()[:30] for t in tags if t.strip()})[:10]


COLS = "id, title, body, tags, pinned, created_at, updated_at"

@router.get("")
def list_notes(q: str | None = None, user=Depends(current_user)):
    pro = is_pro(user["id"])
    where, params = "user_id=%s::uuid", [user["id"]]
    if q and q.strip():
        where += " and (title ilike %s or body ilike %s)"
        params += [f"%{q.strip()}%", f"%{q.strip()}%"]
    with pool.connection() as conn:
        rows = conn.execute(f"select {COLS} from notes where {where} order by pinned desc, updated_at desc", params).fetchall()
        total = conn.execute("select count(*) as n from notes where user_id=%s::uuid", (user["id"],)).fetchone()["n"]
    return {"notes": rows, "plan": {"pro": pro, "limit": None if pro else FREE_NOTE_LIMIT, "count": total}}
@router.post("")
def create_note(body: NoteIn, user=Depends(current_user)):
    pro = is_pro(user["id"])
    with pool.connection() as conn:
        # Ek hi user ke do request ek saath aaye to bhi limit paar na ho
        conn.execute("select pg_advisory_xact_lock(hashtext(%s))", (user["id"],))
        n = conn.execute("select count(*) as n from notes where user_id=%s::uuid", (user["id"],)).fetchone()["n"]
        if not pro and n >= FREE_NOTE_LIMIT:
            raise HTTPException(403, {"code": "limit_reached",
                                      "message": f"Free plan allows {FREE_NOTE_LIMIT} notes. Upgrade to Pro for unlimited notes."})
        row = conn.execute(f"insert into notes (user_id, title, body) values (%s::uuid, %s, %s) returning {COLS}",
                           (user["id"], body.title.strip() or "Untitled", body.body)).fetchone()
    return row


@router.put("/{note_id}")
def update_note(note_id: int, body: NotePatch, user=Depends(current_user)):
    if (body.pinned is not None or body.tags is not None) and not is_pro(user["id"]):
        need_pro("Pinning and tags are")
    sets, params = [], []
    if body.title is not None:
        sets.append("title=%s")
        params.append(body.title.strip() or "Untitled")
    if body.body is not None:
        sets.append("body=%s")
        params.append(body.body)
    if body.pinned is not None:
        sets.append("pinned=%s")
        params.append(body.pinned)
    if body.tags is not None:
        sets.append("tags=%s")
        params.append(_clean_tags(body.tags))
    if not sets:
        raise HTTPException(422, "Nothing to update")
    with pool.connection() as conn:
        row = conn.execute(f"update notes set {', '.join(sets)}, updated_at=now() where id=%s and user_id=%s::uuid returning {COLS}",
                           (*params, note_id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, "Note not found")
    return row


@router.delete("/{note_id}")
def delete_note(note_id: int, user=Depends(current_user)):
    with pool.connection() as conn:
        n = conn.execute("delete from notes where id=%s and user_id=%s::uuid", (note_id, user["id"])).rowcount
    if not n:
        raise HTTPException(404, "Note not found")
    return {"ok": True}


@router.get("/{note_id}/export", response_class=PlainTextResponse)
def export_note(note_id: int, user=Depends(current_user)):
    if not is_pro(user["id"]):
        need_pro("Export is a")
    with pool.connection() as conn:
        row = conn.execute("select title, body, tags from notes where id=%s and user_id=%s::uuid", (note_id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, "Note not found")
    tags = f"\ntags: {', '.join(row['tags'])}" if row["tags"] else ""
    return f"# {row['title']}{tags}\n\n{row['body']}\n"


class AIGenerateIn(BaseModel):
    prompt: str = Field(min_length=2, max_length=10_000)
    style: str = Field(default="notes")
    auto_save: bool = True


class AIAssistIn(BaseModel):
    content: str = Field(min_length=3, max_length=50_000)
    action: str = Field(default="polish")


@router.post("/ai-generate")
async def ai_generate_note(body: AIGenerateIn, user=Depends(current_user)):
    pro = is_pro(user["id"])
    if body.auto_save:
        with pool.connection() as conn:
            conn.execute("select pg_advisory_xact_lock(hashtext(%s))", (user["id"],))
            n = conn.execute("select count(*) as n from notes where user_id=%s::uuid", (user["id"],)).fetchone()["n"]
            if not pro and n >= FREE_NOTE_LIMIT:
                raise HTTPException(
                    403,
                    {
                        "code": "limit_reached",
                        "message": f"Free plan allows up to {FREE_NOTE_LIMIT} notes. Upgrade to CloudNotes Pro for unlimited notes.",
                    },
                )

    # Generate title, markdown body, and tags via AI
    generated = await generate_note_from_ai(body.prompt, body.style)

    if not body.auto_save:
        return generated

    # Auto-save directly into database
    with pool.connection() as conn:
        row = conn.execute(
            f"insert into notes (user_id, title, body, tags) values (%s::uuid, %s, %s, %s) returning {COLS}",
            (user["id"], generated["title"], generated["body"], _clean_tags(generated["tags"])),
        ).fetchone()
    return row


@router.post("/ai-assist")
async def ai_assist_note(body: AIAssistIn, user=Depends(current_user)):
    res = await assist_existing_note(body.content, body.action)
    return {"result": res, "action": body.action}
