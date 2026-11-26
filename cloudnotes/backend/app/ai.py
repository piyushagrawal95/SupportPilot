import json
import httpx
from fastapi import HTTPException
from app.config import settings

STYLE_INSTRUCTIONS = {
    "notes": "Create a clear, structured markdown note with headings, concise paragraphs, key takeaways, and bullet points.",
    "summary": "Create an executive summary note focusing on main points, core thesis, and high-impact takeaways.",
    "action_items": "Extract and structure actionable to-do items, tasks, responsibilities, and next steps in a clear checklist.",
    "study_guide": "Format as a comprehensive study guide with core concepts, definitions, examples, and key revision points.",
}

ACTION_INSTRUCTIONS = {
    "summarize": "Analyze the following note and generate a concise 3-5 bullet point Executive Summary with key highlights at the top.",
    "polish": "Polish the following note for clarity, readability, and clean Markdown structure without altering the original meaning.",
    "action_items": "Extract all action items, tasks, and follow-ups from the following note into a structured markdown checklist (- [ ] task).",
    "expand": "Expand the key concepts in this note with clear explanations, practical real-world examples, and helpful context.",
}

async def call_groq(messages: list[dict], max_tokens: int = 1500, json_mode: bool = False) -> str:
    if not settings.llm_api_key:
        raise HTTPException(status_code=503, detail="AI Note Copilot is not configured with an API key.")

    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=45) as client:
        try:
            res = await client.post(
                f"{settings.llm_base_url}/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Could not reach AI engine: {str(e)}")

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI engine returned error {res.status_code}: {res.text[:200]}")

    try:
        return res.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=500, detail="Unexpected response format from AI engine.")


async def generate_note_from_ai(prompt: str, style: str = "notes") -> dict:
    style_guide = STYLE_INSTRUCTIONS.get(style, STYLE_INSTRUCTIONS["notes"])
    system_prompt = (
        "You are an expert AI note-taking copilot for CloudNotes. "
        "Transform the user's input topic, rough text, or meeting transcript into a structured markdown note. "
        f"Style directive: {style_guide}\n\n"
        "You must respond with a valid JSON object containing exactly these fields:\n"
        "- \"title\": A concise, professional title (string, max 60 chars)\n"
        "- \"body\": Rich formatted markdown note content (string, using ##, bullet points, bold terms, code/tables if applicable)\n"
        "- \"tags\": Array of 2 to 5 relevant lowercase tag strings without '#'\n"
        "Ensure valid json output."
    )

    user_prompt = f"Please generate a complete note in json format based on this input:\n\n{prompt}"
    raw = await call_groq([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ], max_tokens=1500, json_mode=True)

    try:
        data = json.loads(raw.strip())
        return {
            "title": str(data.get("title", "AI Generated Note"))[:200],
            "body": str(data.get("body", "")),
            "tags": [str(t).strip().lower().replace("#", "") for t in data.get("tags", []) if str(t).strip()][:5],
        }
    except Exception:
        # Fallback if json parsing fails
        return {
            "title": prompt.strip()[:60] or "AI Generated Note",
            "body": raw.strip(),
            "tags": ["ai", "notes"],
        }


async def assist_existing_note(content: str, action: str = "polish") -> str:
    instruction = ACTION_INSTRUCTIONS.get(action, ACTION_INSTRUCTIONS["polish"])
    system_prompt = (
        "You are an expert note editor for CloudNotes. "
        "Your task is to refine, summarize, or enhance the user's note according to the requested instruction. "
        "Return the refined note directly in clean Markdown format without unnecessary preamble or chat greetings."
    )
    user_prompt = f"Instruction: {instruction}\n\nNote Content:\n{content}"
    return await call_groq([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ], max_tokens=1500, json_mode=False)
