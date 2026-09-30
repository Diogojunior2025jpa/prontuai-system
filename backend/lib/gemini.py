"""Minimal Gemini GenerateContent client; API keys are read only from the environment."""

import logging
import os
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from lib.api_keys import get_provider_key

logger = logging.getLogger(__name__)
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"


def gemini_model() -> str:
    return os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL


async def generate_summary(system_instruction: str, prompt: str) -> tuple[str, str]:
    api_key = await get_provider_key("gemini")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY não configurada no backend/.env")

    model = gemini_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='-._')}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            response = await client.post(
                url,
                headers={"x-goog-api-key": api_key},
                json={
                    "systemInstruction": {"parts": [{"text": system_instruction}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 700},
                },
            )
    except httpx.HTTPError as exc:
        logger.warning("Gemini transport failure: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Falha ao contactar o Gemini") from exc

    if response.is_error:
        logger.warning("Gemini returned HTTP %s", response.status_code)
        raise HTTPException(status_code=502, detail=f"Gemini retornou erro ({response.status_code})")

    try:
        parts = response.json()["candidates"][0]["content"]["parts"]
        answer = "\n".join(part.get("text", "") for part in parts).strip()
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Gemini retornou uma resposta inválida") from exc
    if not answer:
        raise HTTPException(status_code=502, detail="Gemini não retornou um resumo")
    return answer, model