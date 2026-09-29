from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import (
    COOKIE_NAME,
    create_session,
    current_user,
    destroy_session,
    public_user,
    verify_password,
)
from lib.db import db
from models.schemas import LoginIn, MeOut

router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/logout")
async def logout(request: Request, response: Response):
    await destroy_session(request, response, COOKIE_NAME)
    return {"ok": True}
