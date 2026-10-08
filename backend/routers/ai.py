"""Groq: Whisper speech-to-text + LLM structuring of the clinical record."""

import json
import logging

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from lib.api_keys import get_provider_key
from lib.auth import require_perm
from lib.gemini import generate_json
from models.schemas import (
    ClinicalActionDraft,
    ClinicalDraftIn,
    ClinicalDraftOut,
    ClinicalProfessionalRecord,
    ClinicalRecordSection,
    ClinicalTranscriptionOut,
    StructureIn,
    StructureOut,
)

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
        "diagnostico": "hipótese diagnóstica (sem afirmar certeza quando houver dúvida)",
        "cid10": "código CID-10 sugerido apenas se sustentado pelos dados e revisado pelo profissional",
        "conduta": "conduta e prescrição",
    },
    "odonto": {
        "queixa_principal": "queixa principal relatada",
        "dentes_afetados": "lista de dentes citados na notação FDI, ex: 16, 26",
        "exame_clinico": "achados do exame clínico bucal",
        "diagnostico": "diagnóstico odontológico",
        "cid10": "código CID-10 sugerido apenas se sustentado pelos dados e revisado pelo profissional",
        "plano_tratamento": "plano de tratamento e procedimentos",
    },
    "oftalmo": {
        "queixa_principal": "queixa principal relatada",
        "acuidade_od": "acuidade visual olho direito, ex: 20/40",
        "acuidade_os": "acuidade visual olho esquerdo, ex: 20/20",
        "pressao_intraocular": "pressão intraocular em mmHg se citada",
        "diagnostico": "diagnóstico oftalmológico",
        "cid10": "código CID-10 sugerido apenas se sustentado pelos dados e revisado pelo profissional",
        "conduta": "conduta, prescrição de lentes ou colírios",
    },
}


async def _groq_post(path: str, **kwargs) -> dict:
    # Merge, never pass `headers` twice: callers may add their own Content-Type.
    api_key = await get_provider_key("groq")
    if not api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY não configurada")
    headers = {"Authorization": f"Bearer {api_key}", **kwargs.pop("headers", {})}
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


CLINICAL_DRAFT_SCHEMA = {
    "fields": {
        "queixa_principal": "",
        "historia": "",
        "exame_fisico": "",
        "diagnostico": "",
        "conduta": "",
    },
    "professional_record": {
        "title": "Evolução clínica NEXO",
        "format": "SOAP",
        "content": "Texto completo do prontuário em linguagem médica, pronto para revisão.",
        "sections": [
            {"title": "Subjetivo", "content": ""},
            {"title": "Objetivo", "content": ""},
            {"title": "Avaliação", "content": ""},
            {"title": "Plano", "content": ""},
        ],
    },
    "actions": [
        {
            "type": "exam",
            "title": "",
            "content": "",
            "rationale": "",
            "requires_confirmation": True,
        }
    ],
    "safety_checks": [],
}


def _text(value, limit: int = 4000) -> str:
    return str(value or "").strip()[:limit]


def _professional_record(
    item: dict, clean_fields: dict, template: str
) -> ClinicalProfessionalRecord:
    if not isinstance(item, dict):
        item = {}
    sections = []
    for raw_section in item.get("sections", []):
        if not isinstance(raw_section, dict):
            continue
        title = _text(raw_section.get("title"), 80)
        content = _text(raw_section.get("content"), 2000)
        if title and content:
            sections.append(ClinicalRecordSection(title=title, content=content))
    if not sections:
        fallback_fields = {
            "geral": [
                ("Subjetivo", clean_fields.get("historia") or clean_fields.get("queixa_principal")),
                ("Objetivo", clean_fields.get("exame_fisico")),
                ("Avaliação", clean_fields.get("diagnostico")),
                ("Plano", clean_fields.get("conduta")),
            ],
            "odonto": [
                ("Subjetivo", clean_fields.get("queixa_principal")),
                ("Exame clínico", clean_fields.get("exame_clinico")),
                ("Avaliação", clean_fields.get("diagnostico")),
                ("Plano odontológico", clean_fields.get("plano_tratamento")),
            ],
            "oftalmo": [
                ("Subjetivo", clean_fields.get("queixa_principal")),
                (
                    "Exame oftalmológico",
                    "; ".join(
                        value
                        for value in (
                            clean_fields.get("acuidade_od"),
                            clean_fields.get("acuidade_os"),
                            clean_fields.get("pressao_intraocular"),
                        )
                        if value
                    ),
                ),
                ("Avaliação", clean_fields.get("diagnostico")),
                ("Plano", clean_fields.get("conduta")),
            ],
        }
        fallback_sections = fallback_fields.get(template, fallback_fields["geral"])
        sections = [
            ClinicalRecordSection(title=title, content=content)
            for title, content in fallback_sections
            if content
        ]
    content = _text(item.get("content"), 8000)
    if not content:
        content = "\n\n".join(f"{section.title}\n{section.content}" for section in sections)
    cid10 = clean_fields.get("cid10")
    if cid10:
        if not any(section.title.casefold().startswith("cid-10") for section in sections):
            sections.append(
                ClinicalRecordSection(
                    title="CID-10 sugerido (revisar)",
                    content=cid10,
                )
            )
        if cid10.casefold() not in content.casefold():
            content = "\n\n".join(
                part
                for part in (
                    content,
                    f"CID-10 sugerido (revisar)\n{cid10}",
                )
                if part
            )
    return ClinicalProfessionalRecord(
        title=_text(item.get("title"), 120) or "Evolução clínica NEXO",
        format=_text(item.get("format"), 40) or "SOAP",
        content=content,
        sections=sections,
    )


def _clinical_draft_schema(template: str) -> dict:
    section_titles = {
        "geral": ["Subjetivo", "Objetivo", "Avaliação", "Plano"],
        "odonto": ["Subjetivo", "Exame clínico", "Avaliação", "Plano odontológico"],
        "oftalmo": ["Subjetivo", "Exame oftalmológico", "Avaliação", "Plano"],
    }[template]
    return {
        **CLINICAL_DRAFT_SCHEMA,
        "fields": {key: "" for key in TEMPLATES[template]},
        "professional_record": {
            **CLINICAL_DRAFT_SCHEMA["professional_record"],
            "sections": [{"title": title, "content": ""} for title in section_titles],
        },
    }


def _clinical_action(item: dict) -> ClinicalActionDraft | None:
    if not isinstance(item, dict):
        return None
    action_type = item.get("type")
    if action_type not in {"exam", "prescription", "orientation", "warning"}:
        return None
    title = str(item.get("title") or "").strip()
    content = str(item.get("content") or "").strip()
    if not title or not content:
        return None
    return ClinicalActionDraft(
        type=action_type,
        title=title[:160],
        content=content[:2000],
        rationale=str(item.get("rationale") or "").strip()[:1000],
        requires_confirmation=True,
    )


@router.post("/clinical-draft", response_model=ClinicalDraftOut)
async def clinical_draft(payload: ClinicalDraftIn, user: dict = Depends(require_perm("records.edit"))):
    text = payload.transcript.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Transcrição vazia")
    draft_schema = _clinical_draft_schema(payload.template)
    system_instruction = (
        "Você é um assistente clínico para médicos no Brasil. Gere apenas rascunhos para revisão "
        "do profissional habilitado. Nunca afirme diagnóstico definitivo, nunca oculte incertezas, "
        "nunca execute pedidos, prescrições ou mensagens ao paciente. Não invente achados não ditos. "
        "Seu objetivo é transformar a consulta em um prontuário profissional, organizado e pronto "
        "para revisão, no formato SOAP quando aplicável. Use linguagem médica clara, objetiva e "
        "sem floreios. Separe subjetivo, objetivo, avaliação e plano; quando não houver uma "
        "informação, registre que não foi informado em vez de inventar. "
        f"Use exclusivamente os campos da especialidade {payload.template} solicitados no esquema. "
        "No campo cid10, sugira um código CID-10 somente quando a hipótese diagnóstica e os dados "
        "informados sustentarem a classificação com clareza; deixe vazio se houver ambiguidade ou "
        "dados insuficientes. Identifique-o sempre como sugestão para validação do profissional. "
        "Se houver dor torácica, suspeita de síndrome coronariana aguda ou sinais compatíveis, pode "
        "preparar solicitações de ECG e troponina/enzimas cardíacas e uma prescrição de AAS apenas "
        "como rascunho, sempre incluindo checagem de alergia a AAS, sangramento ativo, anticoagulação, "
        "úlcera ativa, asma/sensibilidade a AINEs, idade/gestação quando relevante e necessidade de "
        "encaminhamento de urgência. Responda somente JSON válido no formato solicitado."
    )
    prompt = (
        "Transcrição da consulta:\n"
        f"{text}\n\n"
        "Contexto do paciente informado pelo sistema, se houver:\n"
        f"{json.dumps(payload.patient_context, ensure_ascii=False)}\n\n"
        "Formato obrigatório:\n"
        f"{json.dumps(draft_schema, ensure_ascii=False)}"
    )
    parsed, model = await generate_json(system_instruction, prompt)
    fields = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else {}
    clean_fields = {
        key: _text(fields.get(key), 4000)
        for key in draft_schema["fields"]
    }
    professional_record = _professional_record(
        parsed.get("professional_record"), clean_fields, payload.template
    )
    raw_actions = parsed.get("actions")
    actions = [
        action
        for action in (
            _clinical_action(item)
            for item in (raw_actions if isinstance(raw_actions, list) else [])
        )
        if action is not None
    ][:8]
    raw_safety_checks = parsed.get("safety_checks")
    safety_checks = [
        _text(item, 500)
        for item in (raw_safety_checks if isinstance(raw_safety_checks, list) else [])
        if _text(item, 500)
    ][:12]
    if not safety_checks:
        safety_checks = [
            "Revisar alergias, comorbidades, medicações em uso e contraindicações antes de assinar.",
            "Confirmar que pedidos, prescrições e orientações estão compatíveis com o exame clínico.",
        ]
    return ClinicalDraftOut(
        transcript=text,
        fields=clean_fields,
        professional_record=professional_record,
        actions=actions,
        safety_checks=safety_checks,
        model=model,
        review_required=True,
    )


@router.post("/transcribe", response_model=ClinicalTranscriptionOut)
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
    return ClinicalTranscriptionOut(transcript=text, model=STT_MODEL)
