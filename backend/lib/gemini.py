"""Minimal Gemini GenerateContent client; API keys are read only from the environment."""

import logging
import os
import re
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from lib.api_keys import get_provider_key

logger = logging.getLogger(__name__)
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"


def gemini_model() -> str:
    model = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip()
    return model.removeprefix("models/") or DEFAULT_GEMINI_MODEL


def _generate_url(model: str) -> str:
    return f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='-._')}:generateContent"


def _supported_model(payload: dict) -> str | None:
    if not isinstance(payload, dict):
        return None
    models = []
    for item in payload.get("models", []):
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            continue
        name = item["name"].removeprefix("models/")
        methods = item.get("supportedGenerationMethods", [])
        if isinstance(methods, list) and name.startswith("gemini-") and "generateContent" in methods:
            models.append(name)
    if not models:
        return None

    def rank(name: str) -> tuple[bool, bool, tuple[int, ...]]:
        stable = "preview" not in name and "experimental" not in name
        flash = "flash" in name
        release = tuple(int(part) for part in re.findall(r"\d+", name))
        return stable, flash, release

    return max(models, key=rank)


async def _discover_model(client: httpx.AsyncClient, api_key: str) -> str | None:
    try:
        response = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": api_key},
        )
    except httpx.HTTPError as exc:
        logger.warning("Gemini model discovery failed: %s", type(exc).__name__)
        return None
    if response.is_error:
        logger.warning("Gemini model discovery returned HTTP %s", response.status_code)
        return None
    try:
        return _supported_model(response.json())
    except (TypeError, ValueError):
        return None


async def generate_summary(system_instruction: str, prompt: str) -> tuple[str, str]:
    api_key = await get_provider_key("gemini")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY não configurada no backend/.env")

    model = gemini_model()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            request_body = {
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 700},
            }
            response = await client.post(
                _generate_url(model),
                headers={"x-goog-api-key": api_key},
                json=request_body,
            )
            if response.status_code == 404:
                discovered = await _discover_model(client, api_key)
                fallback = discovered or DEFAULT_GEMINI_MODEL
                if fallback != model:
                    logger.info("Retrying Gemini request with discovered model %s", fallback)
                    model = fallback
                    response = await client.post(
                        _generate_url(model),
                        headers={"x-goog-api-key": api_key},
                        json=request_body,
                    )
    except httpx.HTTPError as exc:
        logger.warning("Gemini transport failure: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Falha ao contactar o Gemini") from exc

    if response.is_error:
        logger.warning("Gemini model %s returned HTTP %s", model, response.status_code)
        if response.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail="Nenhum modelo Gemini compatível foi encontrado para esta chave de API",
            )
        raise HTTPException(status_code=502, detail=f"Gemini retornou erro ({response.status_code})")

    try:
        parts = response.json()["candidates"][0]["content"]["parts"]
        answer = "\n".join(part.get("text", "") for part in parts).strip()
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Gemini retornou uma resposta inválida") from exc
    if not answer:
        raise HTTPException(status_code=502, detail="Gemini não retornou um resumo")
    return answer, model