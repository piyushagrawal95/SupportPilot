from datetime import datetime, timedelta, timezone
import hmac
import jwt
from fastapi import Depends, Header, HTTPException, status
from app.core.config import settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    if not settings.internal_api_key:
        raise HTTPException(status_code=503, detail="Internal API not configured")
    if not x_internal_key or not hmac.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized")

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_staff(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.removeprefix("Bearer ")
    payload = decode_access_token(token)
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    return payload

def require_roles(allowed_roles: list[str]):
    def checker(staff: dict = Depends(get_current_staff)):
        role = staff.get("role")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}",
            )
        return staff
    return checker

def require_internal_or_staff(
    x_internal_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    if x_internal_key and settings.internal_api_key and hmac.compare_digest(x_internal_key, settings.internal_api_key):
        return {"type": "internal"}
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        payload = decode_access_token(token)
        return {"type": "staff", "user": payload}
    raise HTTPException(status_code=401, detail="Unauthorized: provide valid X-Internal-Key or Bearer token")

def require_internal_or_admin(
    x_internal_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    if x_internal_key and settings.internal_api_key and hmac.compare_digest(x_internal_key, settings.internal_api_key):
        return {"type": "internal"}
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        payload = decode_access_token(token)
        if payload.get("role") == "admin":
            return {"type": "staff", "user": payload}
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Admin role required.")
    raise HTTPException(status_code=401, detail="Unauthorized")
