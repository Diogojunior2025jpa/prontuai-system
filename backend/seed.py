"""Idempotent seed for ProntuAI. Run: cd /app/backend && python seed.py"""

import asyncio
from datetime import datetime, timedelta, timezone

from lib.auth import ROLE_DEFAULTS, hash_password
from lib.db import db, ensure_indexes


def iso(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


PLANS = [
    {"id": "plan-basico", "name": "Básico", "price": 149.0, "max_users": 5, "max_patients": 500,
     "features": ["Agenda", "Prontuário", "Pacientes"], "active": True},
    {"id": "plan-pro", "name": "Pro", "price": 349.0, "max_users": 15, "max_patients": 5000,
     "features": ["Agenda", "Prontuário", "Pacientes", "Prontuário por Voz + IA", "Marketing"], "active": True},
    {"id": "plan-enterprise", "name": "Enterprise", "price": 899.0, "max_users": 100, "max_patients": 100000,
     "features": ["Tudo do Pro", "Multi-unidades", "Relatórios avançados", "Suporte dedicado"], "active": True},
]

TENANTS = [
    {"id": "clinic-odonto", "name": "OdontoAlphaville", "specialty": "odonto", "plan_id": "plan-pro", "status": "active"},
    {"id": "clinic-oftalmo", "name": "Oftalmo Centro", "specialty": "oftalmo", "plan_id": "plan-basico", "status": "active"},
    {"id": "clinic-vida", "name": "Clínica Med Vida", "specialty": "geral", "plan_id": "plan-enterprise", "status": "blocked"},
]

USERS = [
    ("super-1", None, "Super Admin ProntuAI", "super@prontuai.com", "super123", "super_admin", None, None),
    ("u-odo-admin", "clinic-odonto", "Dra. Helena Marques", "admin@odonto.com", "clinica123", "clinic_admin", "Odontologia", None),
    ("u-odo-dent", "clinic-odonto", "Dr. Rafael Nunes", "dentista@odonto.com", "equipe123", "professional", "Odontologia", None),
    ("u-odo-recep", "clinic-odonto", "Bianca Souza", "recepcao@odonto.com", "equipe123", "receptionist", None, None),
    ("u-oft-admin", "clinic-oftalmo", "Dr. Carlos Vieira", "admin@oftalmo.com", "clinica123", "clinic_admin", "Oftalmologia", None),
    ("u-vida-admin", "clinic-vida", "Dra. Paula Reis", "admin@medvida.com", "clinica123", "clinic_admin", "Clínica Geral", None),
]

PATIENTS = [
    ("p-odo-1", "clinic-odonto", "Marcos Almeida", "12345678900", "1988-04-12", "(11) 99888-1010", "marcos@email.com"),
    ("p-odo-2", "clinic-odonto", "Juliana Prado", "98765432100", "1995-09-30", "(11) 99777-2020", "juliana@email.com"),
    ("p-odo-3", "clinic-odonto", "Renato Lima", "45678912300", "1972-01-22", "(11) 99666-3030", "renato@email.com"),
    ("p-oft-1", "clinic-oftalmo", "Sandra Cordeiro", "32165498700", "1960-07-05", "(11) 99555-4040", "sandra@email.com"),
    ("p-oft-2", "clinic-oftalmo", "Eduardo Bastos", "65498732100", "1983-11-17", "(11) 99444-5050", "eduardo@email.com"),
    ("p-vida-1", "clinic-vida", "Aline Ferraz", "11122233300", "1990-03-08", "(11) 99333-6060", "aline@email.com"),
]

APPTS = [
    ("a-1", "clinic-odonto", "p-odo-1", "u-odo-dent", iso(0), "09:00", "Dor ao mastigar", "scheduled", 0),
    ("a-2", "clinic-odonto", "p-odo-2", "u-odo-dent", iso(0), "10:30", "Limpeza semestral", "scheduled", 0),
    ("a-3", "clinic-odonto", "p-odo-3", "u-odo-dent", iso(-20), "14:00", "Restauração", "done", 420.0),
    ("a-4", "clinic-odonto", "p-odo-1", "u-odo-dent", iso(-5), "11:00", "Avaliação", "done", 180.0),
    ("a-5", "clinic-odonto", "p-odo-2", "u-odo-dent", iso(7), "15:00", "Retorno", "scheduled", 0),
    ("a-6", "clinic-oftalmo", "p-oft-1", "u-oft-admin", iso(0), "08:30", "Exame de vista", "scheduled", 0),
    ("a-7", "clinic-oftalmo", "p-oft-2", "u-oft-admin", iso(-10), "16:00", "Glaucoma - controle", "done", 350.0),
]


async def main() -> None:
    for name in ("plans", "tenants", "users", "patients", "appointments", "records", "campaigns", "sessions"):
        await db[name].delete_many({})
    await ensure_indexes()

    await db.plans.insert_many([{**p, "created_at": datetime.now(timezone.utc)} for p in PLANS])
    await db.tenants.insert_many([{**t, "created_at": datetime.now(timezone.utc)} for t in TENANTS])

    await db.users.insert_many([
        {
            "id": uid, "tenant_id": tid, "name": name, "email": email,
            "password_hash": hash_password(pwd), "role": role, "specialty": spec,
            "permissions": perms or ROLE_DEFAULTS.get(role, []),
            "active": True, "created_at": datetime.now(timezone.utc),
        }
        for uid, tid, name, email, pwd, role, spec, perms in USERS
    ])

    await db.patients.insert_many([
        {"id": pid, "tenant_id": tid, "name": name, "cpf": cpf, "birth_date": bd,
         "phone": phone, "email": email, "notes": "", "created_at": datetime.now(timezone.utc)}
        for pid, tid, name, cpf, bd, phone, email in PATIENTS
    ])

    await db.appointments.insert_many([
        {"id": aid, "tenant_id": tid, "patient_id": pid, "professional_id": prof, "date": date,
         "time": time, "reason": reason, "status": status, "price": price,
         "created_at": datetime.now(timezone.utc)}
        for aid, tid, pid, prof, date, time, reason, status, price in APPTS
    ])

    await db.records.insert_many([
        {
            "id": "r-1", "tenant_id": "clinic-odonto", "patient_id": "p-odo-3", "template": "odonto",
            "fields": {
                "queixa_principal": "Sensibilidade ao frio no dente 16",
                "dentes_afetados": "16",
                "exame_clinico": "Cárie oclusal em 16, sem comprometimento pulpar",
                "diagnostico": "Cárie dentária de esmalte e dentina",
                "plano_tratamento": "Restauração em resina composta em sessão única",
            },
            "transcript": "Paciente relata sensibilidade ao frio no dente dezesseis...",
            "author_id": "u-odo-dent", "created_at": datetime.now(timezone.utc) - timedelta(days=20),
        },
        {
            "id": "r-2", "tenant_id": "clinic-oftalmo", "patient_id": "p-oft-2", "template": "oftalmo",
            "fields": {
                "queixa_principal": "Cefaleia frontal e visão embaçada ao fim do dia",
                "acuidade_od": "20/40", "acuidade_os": "20/25",
                "pressao_intraocular": "22 mmHg",
                "diagnostico": "Hipertensão ocular em investigação",
                "conduta": "Colírio hipotensor e retorno em 30 dias",
            },
            "transcript": "Paciente com cefaleia frontal, acuidade olho direito vinte quarenta...",
            "author_id": "u-oft-admin", "created_at": datetime.now(timezone.utc) - timedelta(days=10),
        },
    ])

    await db.campaigns.insert_one({
        "id": "c-1", "tenant_id": "clinic-odonto", "name": "Retorno semestral",
        "channel": "whatsapp", "audience": "all",
        "message": "Olá! Já faz 6 meses desde sua última limpeza. Agende seu retorno na OdontoAlphaville.",
        "recipients": 3, "status": "sent", "created_at": datetime.now(timezone.utc) - timedelta(days=3),
    })

    print("Seed concluído.")
    print("super@prontuai.com / super123 | admin@odonto.com / clinica123 | dentista@odonto.com / equipe123")


if __name__ == "__main__":
    asyncio.run(main())
