from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import ROLE_DEFAULTS, hash_password, require_super_admin
from lib.db import db
from lib.api_keys import provider_key_status, save_provider_key
from lib.monitoring import system_snapshot
from models.schemas import ApiKeyIn, NoticeIn, NoticeOut, NoticePatch, Plan, PlanIn, TenantIn, TenantOut, TenantPatch, new_id, utcnow

router = APIRouter(prefix="/admin", tags=["super-admin"], dependencies=[Depends(require_super_admin)])


# ---------- plans ----------
@router.get("/plans", response_model=list[Plan])
async def list_plans():
    docs = await db.plans.find({}, {"_id": 0}).sort("price", 1).to_list(200)
    return [Plan(**d) for d in docs]


@router.post("/plans", response_model=Plan, status_code=201)
async def create_plan(payload: PlanIn):
    plan = Plan(**payload.model_dump())
    await db.plans.insert_one(plan.model_dump())
    return plan


@router.put("/plans/{plan_id}", response_model=Plan)
async def update_plan(plan_id: str, payload: PlanIn):
    res = await db.plans.find_one_and_update(
        {"id": plan_id}, {"$set": payload.model_dump()}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return Plan(**res)


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str):
    in_use = await db.tenants.count_documents({"plan_id": plan_id})
    if in_use:
        raise HTTPException(status_code=409, detail=f"{in_use} clínica(s) usam este plano")
    res = await db.plans.delete_one({"id": plan_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return {"ok": True}


# ---------- tenants ----------
async def _tenant_out(t: dict, plans: dict) -> TenantOut:
    plan = plans.get(t.get("plan_id"))
    admins = await db.users.find(
        {"tenant_id": t["id"], "role": "clinic_admin"},
        {"_id": 0, "name": 1},
    ).sort("created_at", 1).to_list(1)
    return TenantOut(
        id=t["id"],
        name=t["name"],
        admin_name=admins[0].get("name") if admins else None,
        specialty=t.get("specialty", "geral"),
        plan_id=t.get("plan_id"),
        plan_name=plan["name"] if plan else None,
        plan_price=plan["price"] if plan else 0,
        status=t.get("status", "active"),
        users_count=await db.users.count_documents({"tenant_id": t["id"]}),
        patients_count=await db.patients.count_documents({"tenant_id": t["id"]}),
        created_at=t.get("created_at"),
        subscription_status=t.get("subscription_status", "active"),
        trial_ends_at=t.get("trial_ends_at"),
    )


@router.get("/tenants", response_model=list[TenantOut])
async def list_tenants():
    plans = {p["id"]: p for p in await db.plans.find({}, {"_id": 0}).to_list(200)}
    tenants = await db.tenants.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return [await _tenant_out(t, plans) for t in tenants]


@router.post("/tenants", response_model=TenantOut, status_code=201)
async def create_tenant(payload: TenantIn):
    plan = await db.plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    email = payload.admin_email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")

    import uuid

    tenant = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "specialty": payload.specialty,
        "plan_id": payload.plan_id,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    await db.tenants.insert_one(dict(tenant))
    await db.users.insert_one(
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant["id"],
            "name": payload.admin_name,
            "email": email,
            "password_hash": hash_password(payload.admin_password),
            "role": "clinic_admin",
            "permissions": ROLE_DEFAULTS["clinic_admin"],
            "active": True,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return await _tenant_out(tenant, {plan["id"]: plan})


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def patch_tenant(tenant_id: str, payload: TenantPatch):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=422, detail="Nada para atualizar")
    if update.get("subscription_status") == "active":
        update["subscription_started_at"] = utcnow()
    t = await db.tenants.find_one_and_update(
        {"id": tenant_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not t:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")
    plans = {p["id"]: p for p in await db.plans.find({}, {"_id": 0}).to_list(200)}
    return await _tenant_out(t, plans)


# ---------- global overview ----------
@router.get("/overview")
async def overview():
    plans = {p["id"]: p for p in await db.plans.find({}, {"_id": 0}).to_list(200)}
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(500)
    active = [t for t in tenants if t.get("status") == "active"]
    paying = [t for t in active if t.get("subscription_status", "active") == "active"]
    mrr = sum(plans.get(t.get("plan_id"), {}).get("price", 0) for t in paying)
    blocked = len(tenants) - len(active)
    by_plan = []
    for p in plans.values():
        by_plan.append(
            {
                "plan": p["name"],
                "tenants": sum(1 for t in tenants if t.get("plan_id") == p["id"]),
                "revenue": p["price"] * sum(1 for t in paying if t.get("plan_id") == p["id"]),
            }
        )
    return {
        "mrr": round(mrr, 2),
        "tenants_total": len(tenants),
        "tenants_active": len(active),
        "tenants_blocked": blocked,
        "patients_total": await db.patients.count_documents({}),
        "users_total": await db.users.count_documents({"role": {"$ne": "super_admin"}}),
        "by_plan": by_plan,
    }


@router.get("/system-monitor")
async def system_monitor():
    return await system_snapshot()


@router.get("/api-keys/status")
async def api_keys_status():
    return await provider_key_status()


@router.put("/api-keys/{provider}")
async def update_api_key(provider: Literal["groq", "gemini"], payload: ApiKeyIn):
    return await save_provider_key(provider, payload.api_key)


# ---------- global notices ----------
@router.get("/notices", response_model=list[NoticeOut])
async def list_notices():
    docs = await db.notices.find({"tenant_id": None}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [NoticeOut(**doc) for doc in docs]


@router.post("/notices", response_model=NoticeOut, status_code=201)
async def create_notice(payload: NoticeIn, user: dict = Depends(require_super_admin)):
    notice = NoticeOut(
        id=new_id(),
        tenant_id=None,
        **payload.model_dump(),
        active=True,
        created_by=user["name"],
        created_at=utcnow(),
    )
    await db.notices.insert_one(notice.model_dump())
    return notice


@router.patch("/notices/{notice_id}", response_model=NoticeOut)
async def patch_notice(notice_id: str, payload: NoticePatch):
    notice = await db.notices.find_one_and_update(
        {"id": notice_id, "tenant_id": None},
        {"$set": payload.model_dump()},
        return_document=True,
        projection={"_id": 0},
    )
    if not notice:
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    return NoticeOut(**notice)
