import hmac
from fastapi import Header, HTTPException

from app.core.config import settings

def require_internal_key(x_internal_key:str|None=Header(default=None)) -> None:
    if not settings.internal_api_key:
        raise HTTPException(status_code=503, detail="Internal API not configured")
    if not x_internal_key or not hmac.compare_digest(x_internal_key,settings.internal_api_key):
        raise HTTPException(status_code=401,detail="Unauthorized")