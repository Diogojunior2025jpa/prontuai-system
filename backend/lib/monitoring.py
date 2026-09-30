"""Read-only, aggregate-only platform health snapshot for the Super Admin."""

import os
from datetime import datetime, timezone

from lib.api_keys import encryption_key_ready, provider_key_status
from lib.db import db


async def system_snapshot() -> dict:
    try:
        await db.command("ping")
        database_status = "online"
        metrics = {
            "clinics_total": await db.tenants.count_documents({}),
            "clinics_active": await db.tenants.count_documents({"status": "active"}),
            "clinics_blocked": await db.tenants.count_documents({"status": "blocked"}),
            "patients_total": await db.patients.count_documents({}),
            "users_total": await db.users.count_documents({"role": {"$ne": "super_admin"}}),
            "records_total": await db.records.count_documents({}),
            "appointments_total": await db.appointments.count_documents({}),
        }
        key_status = await provider_key_status()
    except Exception:
        database_status = "offline"
        metrics = None
        key_status = {
            "providers": {
                "groq": {"configured": bool(os.environ.get("GROQ_API_KEY", "").strip()), "source": "environment"},
                "gemini": {"configured": bool(os.environ.get("GEMINI_API_KEY", "").strip()), "source": "environment"},
            }
        }
    providers = {name: status["configured"] for name, status in key_status["providers"].items()}
    vault_in_use = any(status["source"] == "vault" for status in key_status["providers"].values())
    vault_ready = encryption_key_ready()
    return {
        "generated_at": datetime.now(timezone.utc),
        "api": "online",
        "database": database_status,
        "providers": providers,
        "key_vault_ready": vault_ready,
        "metrics": metrics,
        "status": "online" if database_status == "online" and all(providers.values()) and (vault_ready or not vault_in_use) else "degraded",
    }