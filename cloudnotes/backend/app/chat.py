import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth import current_user
from app.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    ticket_id: int | None = Field(default=None, gt=0)


def _sse(event: dict) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode()


@router.post("/message")
async def send_message(body: ChatIn, user=Depends(current_user)):
    # user_id sirf login token se aaya hai, body se kabhi nahi
    payload = {"user_id": user["id"], "message": body.message, "ticket_id": body.ticket_id}

    client = httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10))
    try:
        req = client.build_request(
            "POST", f"{settings.supportpilot_url}/chat/message",
            json=payload, headers={"X-Internal-Key": settings.supportpilot_key})
        r = await client.send(req, stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(status_code=503, detail="Support is unavailable right now. Please try again.")

    # Stream shuru hone se pehle ke errors normal HTTP error ban ke jaate hain
    if r.status_code != 200:
        await r.aclose()
        await client.aclose()
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Ticket not found")
        raise HTTPException(status_code=502, detail="Support could not process your message.")

    async def relay():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        except httpx.HTTPError:
            # Beech me connection toota: sach bolo, "ho gaya" mat bolo
            yield _sse({"type": "token", "text": "I lost the connection while answering. "
                        "Your message is saved, please check back or send it again."})
            yield _sse({"type": "done", "ticket_status": "open"})
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(relay(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})