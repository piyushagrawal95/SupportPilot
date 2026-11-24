import httpx
from fastapi import Header,HTTPException
from app.config import settings

async def current_user(authorization:str|None=Header(default=None)):
    if not authorization or not authorization.startswith("Bearer"):
        raise HTTPException(status_code=401,detail="Missing token")
    token=authorization.removeprefix("Bearer ")

    async with httpx.AsyncClient(timeout=10) as client:
        r=await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"Authorization":f"Bearer {token}","apikey":settings.supabase_anon_key},
        )
    if r.status_code!=200:
        raise HTTPException(status_code=401,detail="Invalid or expired token")

    user=r.json()
    return {"id":user["id"],"email":user["email"]}
