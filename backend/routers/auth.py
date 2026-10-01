import hashlib
import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo.errors import DuplicateKeyError

from lib.auth import (
    COOKIE_NAME,
    ROLE_DEFAULTS,
    create_session,
    current_user,
    destroy_session,
    hash_password,
    hash_password_bcrypt,
    public_user,
    verify_password,
)
from lib.db import db
from lib.mailer import email_is_configured, send_password_reset_email
from models.schemas import (
    AccountUpdateIn,
    ForgotPasswordIn,
    LoginIn,
    MeOut,
    Plan,
    RegisterIn,
    ResetPasswordIn,
    new_id,
    utcnow,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)
RESET_TOKEN_TTL = timedelta(minutes=30)


def _reset_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.get("/plans", response_model=list[Plan])
async def public_plans():
    docs = await db.plans.find({"active": True}, {"_id": 0}).sort("price", 1).to_list(100)
    return [Plan(**doc) for doc in docs]


@router.post("/register", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterIn, response: Response):
    email = str(payload.email).lower().strip()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")

    plans = await db.plans.find({"active": True}, {"_id": 0}).sort("price", 1).to_list(1)
    if not plans:
        raise HTTPException(status_code=503, detail="Cadastro temporariamente indisponível")

    now = utcnow()
    tenant = {
        "id": new_id(),
        "name": payload.clinic_name.strip(),
        "specialty": payload.specialty,
        "plan_id": plans[0]["id"],
        "selected_plan_id": plans[0]["id"],
        "status": "active",
        "subscription_status": "trialing",
        "trial_ends_at": now + timedelta(days=7),
        "created_at": now,
    }
    user = {
        "id": new_id(),
        "tenant_id": tenant["id"],
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password_bcrypt(payload.password),
        "role": "clinic_admin",
        "permissions": ROLE_DEFAULTS["clinic_admin"],
        "active": True,
        "created_at": now,
    }

    await db.tenants.insert_one(dict(tenant))
    try:
        await db.users.insert_one(dict(user))
    except DuplicateKeyError as exc:
        await db.tenants.delete_one({"id": tenant["id"]})
        raise HTTPException(status_code=409, detail="E-mail já cadastrado") from exc
    except Exception:
        await db.tenants.delete_one({"id": tenant["id"]})
        raise

    await create_session(response, "staff", user["id"], COOKIE_NAME)
    return {"user": public_user(user), "tenant": tenant}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(payload: ForgotPasswordIn):
    if not email_is_configured():
        raise HTTPException(status_code=503, detail="Recuperação temporariamente indisponível")

    email = str(payload.email).lower().strip()
    user = await db.users.find_one({"email": email, "active": {"$ne": False}}, {"_id": 0, "id": 1})
    if user:
        now = utcnow()
        recent = await db.password_resets.find_one(
            {"user_id": user["id"], "created_at": {"$gt": now - timedelta(minutes=2)}},
            {"_id": 1},
        )
        if not recent:
            token = secrets.token_urlsafe(32)
            token_hash = _reset_token_hash(token)
            await db.password_resets.delete_many({"user_id": user["id"]})
            await db.password_resets.insert_one(
                {
                    "id": new_id(),
                    "user_id": user["id"],
                    "token_hash": token_hash,
                    "created_at": now,
                    "expires_at": now + RESET_TOKEN_TTL,
                }
            )
            try:
                await send_password_reset_email(email, token)
            except Exception as exc:
                logger.warning("Password reset delivery failed: %s: %s", type(exc).__name__, exc)
                await db.password_resets.delete_one({"token_hash": token_hash})

    return {"message": "Se o e-mail estiver cadastrado, enviaremos instruções para redefinir a senha."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordIn):
    now = utcnow()
    reset = await db.password_resets.find_one_and_delete(
        {"token_hash": _reset_token_hash(payload.token), "expires_at": {"$gt": now}},
        projection={"_id": 0},
    )
    if not reset:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado")

    user_id = reset["user_id"]
    result = await db.users.update_one(
        {"id": user_id, "active": {"$ne": False}},
        {"$set": {"password_hash": hash_password_bcrypt(payload.new_password), "password_updated_at": now}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado")
    await db.password_resets.delete_many({"user_id": user_id})
    await db.sessions.delete_many({"subject_id": user_id, "kind": "staff"})
    return {"ok": True}


@router.post("/login", response_model=MeOut)
async def login(payload: LoginIn, response: Response):
    user = await db.users.find_one({"email": payload.email.lower().strip()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Usuário desativado")

    tenant = None
    if user.get("tenant_id"):
        tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=403, detail="Clínica não encontrada")
        if tenant.get("status") == "blocked":
            raise HTTPException(status_code=403, detail="Clínica bloqueada por inadimplência. Contate o suporte.")

    await create_session(response, "staff", user["id"], COOKIE_NAME)
    return {"user": public_user(user), "tenant": tenant}


@router.get("/me", response_model=MeOut)
async def me(user: dict = Depends(current_user)):
    tenant = None
    if user.get("tenant_id"):
        tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    return {"user": public_user(user), "tenant": tenant}


@router.patch("/account", response_model=MeOut)
async def update_account(payload: AccountUpdateIn, user: dict = Depends(current_user)):
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Atualização inicial exclusiva do Super Admin")
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")

    email = str(payload.email).lower().strip()
    duplicate = await db.users.find_one({"email": email, "id": {"$ne": user["id"]}})
    if duplicate:
        raise HTTPException(status_code=409, detail="E-mail já está em uso")

    updated = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$set": {
            "email": email,
            "password_hash": hash_password(payload.new_password),
            "password_updated_at": utcnow(),
        }},
        return_document=True,
        projection={"_id": 0},
    )
    return {"user": public_user(updated), "tenant": None}


@router.post("/logout")
async def logout(request: Request, response: Response):
    await destroy_session(request, response, COOKIE_NAME)
    return {"ok": True}
