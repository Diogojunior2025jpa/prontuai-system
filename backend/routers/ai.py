"""Groq: Whisper speech-to-text + LLM structuring of the clinical record."""

import json
import logging

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from lib.auth import groq_key, require_perm
from models.schemas import StructureIn, StructureOut

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

GROQ = "https://api.groq.com/openai/v1"
STT_MODEL = "whisper-large-v3"
LLM_MODEL = "openai/gpt-oss-120b"
MAX_BYTES = 25 * 1024 * 1024

TEMPLATES = {
    "geral": {
        "queixa_principal": "queixa principal relatada",
        "historia": "história da moléstia atual",
        "exame_fisico": "achados do exame físico",
        "diagnostico": "hipótese diagnóstica (com CID se citado)",
        "conduta": "conduta e prescrição",
    },
    "odonto": {
        "queixa_principal": "queixa principal relatada",
        "dentes_afetados": "lista de dentes citados na notação FDI, ex: 16, 26",
        "exame_clinico": "achados do exame clínico bucal",
        "diagnostico": "diagnóstico odontológico",
        "plano_tratamento": "plano de tratamento e procedimentos",
    },
    "oftalmo": {
        "queixa_principal": "queixa principal relatada",
        "acuidade_od": "acuidade visual olho direito, ex: 20/40",
        "acuidade_os": "acuidade visual olho esquerdo, ex: 20/20",
        "pressao_intraocular": "pressão intraocular em mmHg se citada",
        "diagnostico": "diagnóstico oftalmológico",
        "conduta": "conduta, prescrição de lentes ou colírios",
    },
}


async def _groq_post(path: str, **kwargs) -> dict:
    # Merge, never pass `headers` twice: callers may add their own Content-Type.
    headers = {"Authorization": f"Bearer {groq_key()}", **kwargs.pop("headers", {})}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as c:
            r = await c.post(f"{GROQ}{path}", headers=headers, **kwargs)
    except httpx.HTTPError as exc:
        logger.error("groq transport error: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao contactar o serviço de IA") from exc
    if r.is_error:
        logger.error("groq %s -> %s %s", path, r.status_code, r.text[:400])
        raise HTTPException(status_code=502, detail=f"Serviço de IA retornou erro ({r.status_code})")
    return r.json()


async def structure_transcript(transcript: str, template: str) -> dict:
    schema = TEMPLATES.get(template, TEMPLATES["geral"])
    prompt = (
        "Você é um assistente clínico. Estruture a transcrição do médico em JSON com exatamente "
        f"estas chaves: {json.dumps(schema, ensure_ascii=False)}. "
        "Responda apenas com o objeto JSON. Use string vazia quando a informação não for dita. "
        "Nunca invente dados clínicos."
    )
    data = await _groq_post(
        "/chat/completions",
        json={
            "model": LLM_MODEL,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": transcript},
            ],
        },
    )
    raw = data["choices"][0]["message"].get("content", "{}")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="IA retornou JSON inválido") from exc
    return {k: str(parsed.get(k, "") or "") for k in schema}


@router.post("/structure", response_model=StructureOut)
async def structure(payload: StructureIn, user: dict = Depends(require_perm("records.edit"))):
    text = payload.transcript.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Transcrição vazia")
    fields = await structure_transcript(text, payload.template)
    return StructureOut(transcript=text, fields=fields, model=LLM_MODEL)


@router.post("/transcribe", response_model=StructureOut)
async def transcribe(
    file: UploadFile = File(...),
    template: str = "geral",
    user: dict = Depends(require_perm("records.edit")),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Áudio vazio")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Áudio maior que 25 MB")

    result = await _groq_post(
        "/audio/transcriptions",
        files={"file": (file.filename or "audio.webm", data, file.content_type or "audio/webm")},
        data={"model": STT_MODEL, "response_format": "json", "temperature": "0", "language": "pt"},
    )
    text = (result.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Não foi possível transcrever o áudio")
    fields = await structure_transcript(text, template if template in TEMPLATES else "geral")
    return StructureOut(transcript=text, fields=fields, model=f"{STT_MODEL} + {LLM_MODEL}")
