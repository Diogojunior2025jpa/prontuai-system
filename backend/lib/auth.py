"""Auth + multi-tenant isolation primitives.

Every tenant-scoped query MUST go through `tenant_filter()` so a clinic can never
read or write another clinic's documents.
"""

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request, Response

from lib.db import db

COOKIE_NAME = "prontuai_session"
PORTAL_COOKIE = "prontuai_portal"

# Granular permissions assignable to clinic staff.
PERMISSIONS = [
    "patients.view",
    "patients.edit",
    "agenda.view",
    "agenda.edit",
    "records.view",
    "records.edit",
    "finance.view",
    "team.manage",
    "campaigns.send",
    "settings.manage",
]

ROLE_DEFAULTS = {
    "clinic_admin": PERMISSIONS,
    "professional": ["patients.view", "patients.edit", "agenda.view", "agenda.edit", "records.view", "records.edit"],
    "receptionist": ["patients.view", "patients.edit", "agenda.view", "agenda.edit", "campaigns.send"],
    "finance": ["finance.view", "patients.view", "agenda.view"],
}


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if stored.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(password.encode(), stored.encode())
        except (TypeError, ValueError):
            return False

    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return secrets.compare_digest(calc, digest)


async def create_session(response: Response, kind: str, subject_id: str, cookie: str = COOKIE_NAME) -> str:
    sid = str(uuid.uuid4())
    await db.sessions.insert_one(
        {"id": sid, "kind": kind, "subject_id": subject_id, "created_at": datetime.now(timezone.utc)}
    )
    response.set_cookie(
        cookie, sid, httponly=True, samesite="lax", path="/", max_age=60 * 60 * 24 * 14
    )
    return sid


async def destroy_session(request: Request, response: Response, cookie: str = COOKIE_NAME) -> None:
    sid = request.cookies.get(cookie)
    if sid:
        await db.sessions.delete_one({"id": sid})
    response.delete_cookie(cookie, path="/")


def public_user(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "name": doc["name"],
        "email": doc["email"],
        "role": doc["role"],
        "tenant_id": doc.get("tenant_id"),
        "permissions": effective_permissions(doc),
        "specialty": doc.get("specialty"),
        "active": doc.get("active", True),
        "must_change_password": doc["role"] == "super_admin" and not doc.get("password_updated_at"),
    }


def effective_permissions(doc: dict) -> list:
    if doc["role"] == "super_admin":
        return ["*"]
    if doc["role"] == "clinic_admin":
        return PERMISSIONS
    return doc.get("permissions", [])


async def current_user(request: Request) -> dict:
    sid = request.cookies.get(COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=401, detail="Não autenticado")
    session = await db.sessions.find_one({"id": sid, "kind": "staff"})
    if not session:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    user = await db.users.find_one({"id": session["subject_id"]})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Usuário inativo")
    if user["role"] != "super_admin":
        tenant = await db.tenants.find_one({"id": user.get("tenant_id")})
        if not tenant:
            raise HTTPException(status_code=403, detail="Clínica não encontrada")
        if tenant.get("status") == "blocked":
            raise HTTPException(status_code=403, detail="Clínica bloqueada por inadimplência. Contate o suporte.")
    return user


async def require_super_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao Super Admin")
    if not user.get("password_updated_at"):
        raise HTTPException(status_code=403, detail="Atualize seu e-mail e senha para continuar")
    return user


async def require_tenant_user(user: dict = Depends(current_user)) -> dict:
    """A staff member bound to exactly one clinic. Super Admin has no clinic data."""
    if user["role"] == "super_admin" or not user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Rota exclusiva de usuários de clínica")
    return user


def require_perm(permission: str):
    async def dep(user: dict = Depends(require_tenant_user)) -> dict:
        if permission not in effective_permissions(user):
            raise HTTPException(status_code=403, detail=f"Permissão negada: {permission}")
        return user

    return dep


def tenant_filter(user: dict, extra: dict | None = None) -> dict:
    """THE isolation boundary — every clinic query is built from this."""
    flt = {"tenant_id": user["tenant_id"]}
    if extra:
        flt.update({k: v for k, v in extra.items() if k != "tenant_id"})
    return flt


def groq_key() -> str:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY não configurada")
    return key
