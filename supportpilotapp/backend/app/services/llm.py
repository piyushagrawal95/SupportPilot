import httpx
from app.core.config import settings

class LLMError(Exception):
    """LLM provider se kuch bhi galat hua (key, network, limit, ajeeb jawab)."""

def chat_completion(messages:list[dict], * ,json_mode:bool=False,temperature:float=0.0, max_tokens:int=500 ) ->str:
    "Kisi bhi OpenAI provider (Groq, OpenAI...) ko bulata hai"
    if not settings.llm_api_key:
        raise LLMError("LLM is not configured")

    body={
        "model":settings.llm_model,
        "messages":messages,
        "temperature":temperature,
        "max_tokens":max_tokens
    }
    if json_mode:
        body["response_format"]={"type":"json_object"}

    try:
        r = httpx.post(
            f"{settings.llm_base_url}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            timeout=30,
        )
    except httpx.HTTPError as e:
        raise LLMError("Could not reach the LLM provider") from e

    if r.status_code != 200:
        raise LLMError(f"LLM provider returned {r.status_code}: {r.text[:200]}")

    try:
        return r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as e:
        raise LLMError("Unexpected response from the LLM provider") from e