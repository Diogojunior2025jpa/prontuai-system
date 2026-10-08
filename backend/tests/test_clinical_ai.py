from types import SimpleNamespace

import pytest

import routers.ai as ai
from models.schemas import ClinicalDraftIn


@pytest.mark.asyncio
async def test_clinical_draft_uses_gemini_and_keeps_review_required(monkeypatch):
    async def fake_generate_json(system_instruction, prompt, *, max_output_tokens=1600):
        assert "rascunhos para revisão" in system_instruction
        assert "dor torácica" in prompt
        assert '"queixa_principal": ""' in prompt
        assert '"cid10": ""' in prompt
        assert "deixe vazio se houver ambiguidade" in system_instruction
        return (
            {
                "fields": {
                    "queixa_principal": "Dor torácica",
                    "historia": "Dor opressiva há 40 minutos",
                    "exame_fisico": "Paciente sudoreico",
                    "diagnostico": "Suspeita de síndrome coronariana aguda",
                    "conduta": "Avaliação imediata e monitorização",
                },
                "professional_record": {
                    "title": "Evolução clínica NEXO",
                    "format": "SOAP",
                    "content": (
                        "Subjetivo\nDor torácica opressiva há 40 minutos.\n\n"
                        "Objetivo\nPaciente sudoreico.\n\n"
                        "Avaliação\nSuspeita de síndrome coronariana aguda.\n\n"
                        "Plano\nECG imediato, troponina e avaliação de contraindicações ao AAS."
                    ),
                    "sections": [
                        {"title": "Subjetivo", "content": "Dor torácica opressiva há 40 minutos."},
                        {"title": "Objetivo", "content": "Paciente sudoreico."},
                        {"title": "Avaliação", "content": "Suspeita de síndrome coronariana aguda."},
                        {"title": "Plano", "content": "ECG imediato e troponina."},
                    ],
                },
                "actions": [
                    {
                        "type": "exam",
                        "title": "ECG de 12 derivações",
                        "content": "Solicitar ECG imediato para revisão médica.",
                        "rationale": "Dor torácica com suspeita de SCA.",
                        "requires_confirmation": False,
                    },
                    {
                        "type": "prescription",
                        "title": "AAS preparado",
                        "content": "Rascunho: AAS após excluir contraindicações.",
                        "rationale": "Possível SCA.",
                    },
                ],
                "safety_checks": ["Checar alergia a AAS", "Checar sangramento ativo"],
            },
            "gemini-test",
        )

    monkeypatch.setattr(ai, "generate_json", fake_generate_json)

    result = await ai.clinical_draft(
        ClinicalDraftIn(
            transcript="Paciente com dor torácica opressiva há 40 minutos.",
            template="geral",
        ),
        SimpleNamespace(),
    )

    assert result.model == "gemini-test"
    assert result.review_required is True
    assert result.fields["diagnostico"] == "Suspeita de síndrome coronariana aguda"
    assert result.fields["cid10"] == ""
    assert result.professional_record is not None
    assert result.professional_record.format == "SOAP"
    assert "Subjetivo" in result.professional_record.content
    assert result.professional_record.sections[0].title == "Subjetivo"
    assert result.actions[0].title == "ECG de 12 derivações"
    assert result.actions[0].requires_confirmation is True
    assert "Checar alergia a AAS" in result.safety_checks


@pytest.mark.asyncio
async def test_clinical_draft_uses_specialty_fields_and_builds_record_fallback(monkeypatch):
    async def fake_generate_json(_system_instruction, prompt, *, max_output_tokens=1600):
        assert '"dentes_afetados": ""' in prompt
        return (
            {
                "fields": {
                    "queixa_principal": "Dor ao mastigar",
                    "dentes_afetados": "16",
                    "exame_clinico": "Cárie oclusal",
                    "diagnostico": "Cárie em dentina",
                    "cid10": "K02.1",
                    "plano_tratamento": "Restauração",
                },
                "actions": None,
                "safety_checks": None,
            },
            "gemini-test",
        )

    monkeypatch.setattr(ai, "generate_json", fake_generate_json)

    result = await ai.clinical_draft(
        ClinicalDraftIn(transcript="Dor ao mastigar no dente 16.", template="odonto"),
        SimpleNamespace(),
    )

    assert result.fields["dentes_afetados"] == "16"
    assert result.fields["cid10"] == "K02.1"
    assert [section.title for section in result.professional_record.sections] == [
        "Subjetivo",
        "Exame clínico",
        "Avaliação",
        "Plano odontológico",
        "CID-10 sugerido (revisar)",
    ]
    assert result.actions == []
    assert result.safety_checks
    assert result.professional_record.sections[-1].title == "CID-10 sugerido (revisar)"
    assert "K02.1" in result.professional_record.content


@pytest.mark.asyncio
async def test_groq_request_sends_configured_bearer_key(monkeypatch):
    from httpx import Request, Response

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, _url, *, headers, **_kwargs):
            assert headers["Authorization"] == "Bearer groq-test-key"
            return Response(
                200,
                request=Request("POST", "https://groq.test"),
                json={"text": "ditado"},
            )

    async def fake_get_provider_key(provider):
        assert provider == "groq"
        return "groq-test-key"

    monkeypatch.setattr(ai, "get_provider_key", fake_get_provider_key)
    monkeypatch.setattr(ai.httpx, "AsyncClient", lambda **_kwargs: MockClient())

    result = await ai._groq_post("/audio/transcriptions", data={"model": ai.STT_MODEL})

    assert result == {"text": "ditado"}


@pytest.mark.asyncio
async def test_transcription_does_not_run_a_second_structuring_model(monkeypatch):
    from io import BytesIO
    from starlette.datastructures import UploadFile

    async def fake_groq_post(path, **_kwargs):
        assert path == "/audio/transcriptions"
        return {"text": "Consulta transcrita"}

    async def unexpected_structure(*_args, **_kwargs):
        raise AssertionError("A transcrição não deve estruturar antes do NEXO")

    monkeypatch.setattr(ai, "_groq_post", fake_groq_post)
    monkeypatch.setattr(ai, "structure_transcript", unexpected_structure)

    result = await ai.transcribe(
        UploadFile(filename="ditado.webm", file=BytesIO(b"audio data")),
        "geral",
        SimpleNamespace(),
    )

    assert result.transcript == "Consulta transcrita"
    assert result.model == ai.STT_MODEL
