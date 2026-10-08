"""Assistente ProntuAI — responde dúvidas do sistema (e clínicas) e fala via ElevenLabs.

Texto: Groq (mesmo provedor já usado no prontuário).
Voz:   ElevenLabs REST (httpx) — voz masculina grave "Adam" por padrão.
"""

import base64
import json
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, effective_permissions, require_super_admin
from lib.db import db
from lib.gemini import generate_summary, gemini_model
from lib.monitoring import system_snapshot
from models.schemas import AskIn, AskOut, SpeakIn, SpeakOut
from routers.ai import LLM_MODEL, _groq_post

router = APIRouter(prefix="/assistant", tags=["assistant"])
logger = logging.getLogger(__name__)

ELEVEN_BASE = "https://api.elevenlabs.io/v1"
# "Adam" — voz masculina grave do catálogo padrão da ElevenLabs.
DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"
TTS_MODEL = "eleven_multilingual_v2"  # suporta pt-BR
MAX_TTS_CHARS = 1200

ROLE_SCOPE = {
    "super_admin": (
        "Super Admin da plataforma ProntuAI. Só ele acessa /superadmin: criar/editar/ativar/excluir "
        "planos, cadastrar clínicas, trocar o plano de uma clínica, bloquear/liberar inadimplentes e "
        "ver o MRR global. Ele NÃO acessa dados clínicos de nenhuma clínica (pacientes, agenda, "
        "prontuários) — isso é bloqueado por projeto, para garantir o sigilo dos pacientes."
    ),
    "clinic_admin": (
        "Admin da Clínica (dono). Acessa tudo da PRÓPRIA clínica: Dashboard, Agenda, Pacientes, "
        "Prontuário NEXO, Equipe & Permissões e Marketing, incluindo o faturamento. Ele cadastra a "
        "equipe e define as permissões de cada funcionário por checkbox."
    ),
    "professional": (
        "Profissional de saúde (médico/dentista). Foco em Agenda, Pacientes e Prontuário NEXO. "
        "Normalmente NÃO tem acesso a financeiro, equipe ou configurações."
    ),
    "receptionist": (
        "Recepcionista. Foco em Agenda, Pacientes e Marketing. Normalmente NÃO acessa prontuários "
        "nem financeiro."
    ),
    "finance": (
        "Financeiro. Foco no faturamento e visão de agenda/pacientes. Não edita prontuários."
    ),
}

SYSTEM_KNOWLEDGE = """
Você é o Assistente ProntuAI, integrado ao sistema. Responda SEMPRE em português do Brasil,
de forma curta, direta e prática (no máximo ~130 palavras), como um colega que já conhece a tela.
Quando a pergunta for "como faço X", responda em passos numerados curtos citando o nome exato do
menu e do botão.

# O que é o ProntuAI
SaaS multi-tenant de gestão de clínicas (odontologia, oftalmologia e clínica geral) com prontuário
eletrônico, agenda, pacientes, campanhas de marketing e portal do paciente.

# Isolamento de dados (regra central)
Cada clínica é um ambiente blindado. Todo registro tem um `tenant_id` e toda consulta ao banco é
filtrada pelo tenant do usuário logado. A Clínica X nunca vê dados da Clínica Y — mesmo que alguém
tente adivinhar o ID de um paciente, a resposta é "não encontrado".

# Menus e o que fazer em cada um
- Dashboard: métricas do dia (pacientes na base, consultas hoje, faturamento do mês, prontuários)
  e a Agenda de hoje, além de Ações rápidas.
- Agenda: botão "Agendar" abre o formulário (paciente, data, hora, motivo). Em cada linha de uma
  consulta agendada há o ✓ para marcar como Atendido e o ✗ para Cancelar.
- Pacientes: botão "Novo paciente" (nome, CPF, nascimento, telefone, e-mail, observações). O CPF
  não pode repetir na mesma clínica. O ícone de lixeira remove o paciente e o histórico dele.
- Prontuário NEXO: escolha o paciente, escolha a especialidade, dite ou escreva e clique
  "Gerar rascunho clínico"; depois revise e clique "Salvar prontuário". Detalhes abaixo.
- Equipe & Permissões: "Novo membro" cadastra a equipe. As permissões são checkboxes por pessoa:
  Ver/Editar pacientes, Ver/Editar agenda, Ver/Editar prontuários, Acessar financeiro,
  Gerenciar equipe, Disparar campanhas e Configurações. O Admin da Clínica sempre tem tudo.
- Marketing: monte a campanha (nome, canal WhatsApp/E-mail/Push, público) e clique
  "Disparar campanha". IMPORTANTE: o envio é SIMULADO — o sistema registra o disparo e conta os
  destinatários, mas nenhuma mensagem real sai. Públicos: Todos, Aniversariantes do mês e
  Inativos (sem consulta há 6+ meses). Use {nome} para personalizar a mensagem.
- Super Admin (só o dono da plataforma): aba Clínicas (bloquear/liberar, trocar plano) e aba
  Planos (criar/editar/ativar/excluir com preço, limite de usuários e de pacientes).

# Prontuário com ditado por voz
Clique no botão redondo de microfone para gravar; ao parar, o áudio é transcrito e o NEXO distribui o
conteúdo nos campos e prepara rascunhos para revisão. Sem microfone, use "Usar relato de exemplo" ou digite e clique
"Gerar rascunho clínico". Modelos por especialidade:
- Clínica Geral: queixa principal, história, exame físico, diagnóstico, conduta.
- Odontologia: queixa, dentes afetados, exame clínico, diagnóstico, plano de tratamento, e um
  odontograma FDI de 32 dentes — clique num dente para alternar Hígido/Cárie/Restauração/Canal/
  Prótese/Extraído.
- Oftalmologia: acuidade OD e OS (padrão Snellen, ex. 20/40), pressão intraocular, diagnóstico e
  conduta, com tabela de Snellen de referência.
Revise sempre o que o NEXO preencheu antes de salvar.

# Planos e bloqueio
O Super Admin define os planos. Se a clínica é bloqueada por inadimplência, ninguém dela consegue
entrar: o login responde "Clínica bloqueada por inadimplência". Ao liberar, o acesso volta na hora.

# Portal do Paciente
Endereço /portal/login. O paciente entra com CPF + data de nascimento (sem senha), vê as próximas
consultas e o histórico, e marca uma nova consulta. Horário já ocupado é recusado.

# Precisão ao ensinar (importante)
Use exatamente os nomes dos botões desta lista e NÃO invente etapas que não existem — o sistema
não tem janela de confirmação em nenhuma ação, e nenhuma tela pede "confirmar exclusão".
Nomes reais dos botões: "Novo paciente" e "Salvar paciente"; "Agendar" e "Confirmar agendamento";
"Novo membro" e "Cadastrar membro"; "Gerar rascunho clínico", "Usar relato de exemplo" e
"Salvar prontuário"; "Disparar campanha"; "Novo plano", "Criar plano"/"Salvar alterações",
"Editar", "Desativar" e "Excluir"; "Nova clínica" e "Criar clínica"; "Bloquear" e "Liberar";
"Marcar consulta" e "Confirmar consulta" no portal. Ao bloquear/liberar uma clínica o efeito é
imediato, com um único clique no botão da linha da clínica.

# Limites conhecidos (seja honesto sobre eles)
- O envio de WhatsApp/e-mail/push é simulado, não real.
- Não existe aplicativo React Native; o paciente usa o portal web responsivo.
- Não há emissão fiscal, integração com convênios nem receita digital assinada.
Se te perguntarem algo que o sistema não faz, diga com clareza que ainda não existe.

# Dúvidas clínicas
Você também pode responder dúvidas clínicas e médicas para apoiar o raciocínio do profissional
(definições, exames, condutas usuais, CID, notação dentária, interpretação de acuidade visual).
Nesses casos: seja técnico e objetivo, e termine com uma linha curta lembrando que a decisão final
é do profissional responsável, que avalia o paciente. Nunca prescreva dose para o paciente final
nem substitua a consulta; se quem pergunta não é profissional de saúde, oriente a procurar o
profissional da clínica.
"""


def _eleven_key() -> str:
    return os.environ.get("ELEVENLABS_API_KEY", "").strip()


def _voice_id() -> str:
    return os.environ.get("ELEVENLABS_VOICE_ID", "").strip() or DEFAULT_VOICE_ID


@router.get("/voice-status")
async def voice_status(user: dict = Depends(current_user)):
    """A UI usa isto para decidir se mostra o botão de ouvir."""
    key = _eleven_key()
    return {
        "configured": bool(key) and key.startswith("sk_"),
        "voice_name": "Adam (masculina grave)",
        "voice_id": _voice_id(),
        "reason": "" if key.startswith("sk_") else (
            "Chave da ElevenLabs ausente ou inválida. A chave real começa com 'sk_' e aparece "
            "apenas quando é criada ou rotacionada em elevenlabs.io → API Keys."
        ),
    }


@router.post("/ask", response_model=AskOut)
async def ask(payload: AskIn, user: dict = Depends(current_user)):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Pergunta vazia")

    perms = effective_permissions(user)
    tenant = None
    if user.get("tenant_id"):
        tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})

    if tenant:
        clinic_line = f"{tenant['name']} (especialidade: {tenant.get('specialty', 'geral')})"
    else:
        clinic_line = "nenhuma (usuário da plataforma)"

    context = (
        "\n# Quem está perguntando agora\n"
        f"Nome: {user['name']}. Papel: {user['role']} — {ROLE_SCOPE.get(user['role'], '')}\n"
        f"Clínica: {clinic_line}.\n"
        f"Permissões efetivas: {', '.join(perms)}.\n"
        "Adapte a resposta a este papel: não ensine a usar módulos que ele não pode acessar — nesse "
        "caso explique que o acesso depende de uma permissão que o Admin da Clínica precisa liberar "
        "em Equipe & Permissões."
    )

    messages = [{"role": "system", "content": SYSTEM_KNOWLEDGE + context}]
    for turn in (payload.history or [])[-6:]:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        content = str(turn.get("content", ""))[:1500]
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})

    data = await _groq_post(
        "/chat/completions",
        json={"model": LLM_MODEL, "temperature": 0.3, "max_tokens": 700, "messages": messages},
    )
    answer = (data["choices"][0]["message"].get("content") or "").strip()
    if not answer:
        raise HTTPException(status_code=502, detail="A IA não retornou resposta")
    return AskOut(answer=answer, model=LLM_MODEL)


@router.post("/global-ask", response_model=AskOut)
async def ask_global(payload: AskIn, user: dict = Depends(require_super_admin)):
    question = payload.question.strip()[:1000]
    if not question:
        raise HTTPException(status_code=422, detail="Pergunta vazia")

    snapshot = await system_snapshot()
    instruction = (
        "Você é o assistente de monitoramento da plataforma ProntuAI. Responda em português do Brasil. "
        "Analise somente o snapshot agregado fornecido, destaque indisponibilidades e provedores sem "
        "chave configurada e recomende verificações seguras. Não acesse nem solicite prontuários, nomes, "
        "CPFs, e-mails, IDs, transcrições ou dados clínicos; não invente telemetria nem alegue corrigir "
        "automaticamente o sistema. Métricas e saúde: "
        f"{json.dumps(snapshot, ensure_ascii=False, default=str)}"
    )
    answer, model = await generate_summary(instruction, question)
    return AskOut(answer=answer, model=model)


@router.post("/speak", response_model=SpeakOut)
async def speak(payload: SpeakIn, user: dict = Depends(current_user)):
    key = _eleven_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Voz não configurada: falta ELEVENLABS_API_KEY no backend/.env.",
        )
    if not key.startswith("sk_"):
        raise HTTPException(
            status_code=503,
            detail=(
                "A chave da ElevenLabs está inválida (parece ser o ID da chave). A chave real "
                "começa com 'sk_' e é exibida somente ao criar/rotacionar em elevenlabs.io → API Keys."
            ),
        )

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Texto vazio")
    text = text[:MAX_TTS_CHARS]

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as c:
            r = await c.post(
                f"{ELEVEN_BASE}/text-to-speech/{_voice_id()}",
                headers={"xi-api-key": key, "Content-Type": "application/json"},
                json={
                    "text": text,
                    "model_id": TTS_MODEL,
                    "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.0},
                },
            )
    except httpx.HTTPError as exc:
        logger.error("elevenlabs transport error: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao contactar a ElevenLabs") from exc

    if r.is_error:
        logger.error("elevenlabs -> %s %s", r.status_code, r.text[:300])
        if r.status_code in (400, 401):
            raise HTTPException(status_code=503, detail="Chave da ElevenLabs recusada. Verifique a chave 'sk_...'.")
        if r.status_code == 429:
            raise HTTPException(status_code=503, detail="Cota da ElevenLabs esgotada.")
        raise HTTPException(status_code=502, detail=f"ElevenLabs retornou erro ({r.status_code})")

    audio_b64 = base64.b64encode(r.content).decode()
    return SpeakOut(audio_url=f"data:audio/mpeg;base64,{audio_b64}", voice_id=_voice_id())
