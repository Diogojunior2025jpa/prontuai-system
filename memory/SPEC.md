# ProntuAI — Spec

SaaS multi-tenant (pt-BR) para gestão de clínicas: agenda, pacientes, prontuário
inteligente com transcrição de voz (Groq `whisper-large-v3` + `openai/gpt-oss-120b`
para estruturação — modelos confirmados como disponíveis nesta chave; `llama-3.3-70b-versatile`
retorna 404 nela), RBAC granular,
campanhas de marketing (envio SIMULADO) e portal do paciente.

Stack: FastAPI + MongoDB (motor) / Vite + React 19 + Tailwind v4 + shadcn (dark por padrão).

## Isolamento multi-tenant (a regra central)

- Todo documento transacional carrega `tenant_id`: `patients`, `appointments`,
  `records`, `campaigns`, `users`.
- `backend/lib/auth.py::tenant_filter(user, extra)` é a ÚNICA forma de montar o
  filtro de uma consulta de clínica. Ele injeta `tenant_id` do usuário logado e
  descarta qualquer `tenant_id` que venha do cliente.
- `require_tenant_user` bloqueia o Super Admin em rotas de clínica; `require_super_admin`
  bloqueia usuários de clínica em `/api/admin/*`.
- `current_user` recusa (403) qualquer usuário cuja clínica esteja `blocked`.

## Modelo de dados (coleções Mongo)

| Coleção | Campos-chave |
|---|---|
| `plans` | id, name, price, max_users, max_patients, features[], active |
| `tenants` | id, name, specialty(geral/odonto/oftalmo), plan_id, status(active/blocked) |
| `users` | id, **tenant_id** (null p/ super admin), name, email(unique), password_hash, role, permissions[], specialty, active |
| `sessions` | id, kind(staff/patient), subject_id, created_at (TTL 14d) |
| `patients` | id, **tenant_id**, name, cpf, birth_date, phone, email, notes |
| `appointments` | id, **tenant_id**, patient_id, professional_id, date, time, reason, status, price |
| `records` | id, **tenant_id**, patient_id, template, fields{}, transcript, author_id |
| `campaigns` | id, **tenant_id**, name, channel, audience, message, recipients, status |

Ids são `uuid4` string. Índices declarados em `backend/lib/db.py::INDEXES`.

## RBAC

Papéis: `super_admin`, `clinic_admin` (todas as permissões do próprio tenant),
`professional`, `receptionist`, `finance`.

Permissões: `patients.view/edit`, `agenda.view/edit`, `records.view/edit`,
`finance.view`, `team.manage`, `campaigns.send`, `settings.manage`.
Aplicadas no backend via `require_perm("x")` e refletidas na navegação do frontend
por `hasPerm()`.

## Endpoints (todos sob /api)

- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` (cookie httpOnly `prontuai_session`)
- Super Admin: `GET/POST /admin/plans`, `PUT/DELETE /admin/plans/{id}`,
  `GET/POST /admin/tenants`, `PATCH /admin/tenants/{id}` (status/plan_id), `GET /admin/overview`
- Clínica: `GET /clinic/overview`, `/clinic/patients` (CRUD), `/clinic/appointments` (GET/POST/PATCH),
  `/clinic/records` (GET/POST), `/clinic/team` (GET/POST/PATCH/DELETE), `/clinic/campaigns` (GET/POST),
  `GET /clinic/permissions`
- IA: `POST /ai/transcribe` (multipart audio → transcrição + campos), `POST /ai/structure` (texto → campos)
- Portal do paciente: `POST /portal/login` (CPF + nascimento, cookie `prontuai_portal`),
  `GET /portal/me`, `GET/POST /portal/appointments`, `POST /portal/logout`

## Fluxos principais

1. Login → `/app` (clínica) ou `/superadmin` (plataforma).
2. Prontuário `/app/prontuario`: escolhe paciente + especialidade → grava voz (ou usa
   relato de exemplo) → `POST /ai/transcribe` ou `/ai/structure` → campos preenchidos →
   salva. Odontologia mostra odontograma FDI de 32 dentes; oftalmologia mostra acuidade Snellen.
3. Super Admin: cria/edita/ativa/exclui planos, cria clínicas com admin, troca plano e
   bloqueia/libera inadimplentes; vê MRR global.
4. Equipe: checkbox por permissão, persistido em `users.permissions`.
5. Campanhas: filtra público (todos/aniversariantes/inativos), registra disparo — **MOCK**,
   nenhuma mensagem real é enviada.

## Desvios conscientes do pedido original

- Banco é **MongoDB** com `tenant_id` estrito (escolha do usuário), não SQL relacional.
- App móvel React Native **não** foi construído; o portal do paciente é web responsivo (`/portal`).
- Disparos de marketing são **simulados** (nenhum provedor WhatsApp/e-mail real).
- Notificações push não são enviadas.

## Seed

`cd /app/backend && python seed.py` (idempotente, recria as coleções).
3 clínicas: OdontoAlphaville (odonto, Pro), Oftalmo Centro (oftalmo, Básico),
Clínica Med Vida (geral, Enterprise, **bloqueada** de propósito para demonstrar o bloqueio).
