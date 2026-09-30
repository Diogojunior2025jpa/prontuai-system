"""Clinic-scoped management of professional availability slots."""

import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from lib.auth import require_perm, tenant_filter
from lib.dates import today_iso
from lib.db import db
from models.schemas import AvailabilityCreateOut, AvailabilityIn, AvailabilityOut, new_id

router = APIRouter(prefix="/clinic/availability", tags=["availability"])


async def _decorate_slots(docs: list[dict], tenant_id: str) -> list[AvailabilityOut]:
    professional_ids = list({doc["professional_id"] for doc in docs})
    professionals = {
        user["id"]: user["name"]
        for user in await db.users.find(
            {"tenant_id": tenant_id, "id": {"$in": professional_ids}}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)
    }
    return [AvailabilityOut(**{**doc, "professional_name": professionals.get(doc["professional_id"], "Profissional")}) for doc in docs]


@router.get("", response_model=list[AvailabilityOut])
async def list_availability(date: str | None = None, user: dict = Depends(require_perm("agenda.view"))):
    if user.get("role") not in ("clinic_admin", "professional"):
        raise HTTPException(status_code=403, detail="Disponibilidade exclusiva para clínica e profissionais")
    extra = {"date": date} if date else {"date": {"$gte": today_iso()}}
    if user["role"] == "professional":
        extra["professional_id"] = user["id"]
    docs = await db.availability.find(tenant_filter(user, extra), {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(500)
    return await _decorate_slots(docs, user["tenant_id"])


@router.post("", response_model=AvailabilityCreateOut)
async def create_availability(payload: AvailabilityIn, user: dict = Depends(require_perm("agenda.edit"))):
    role = user.get("role")
    if role not in ("clinic_admin", "professional"):
        raise HTTPException(status_code=403, detail="Somente profissionais e admins podem publicar horários")
    try:
        requested_date = datetime.strptime(payload.date, "%Y-%m-%d").date().isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Data inválida") from exc
    if requested_date < today_iso():
        raise HTTPException(status_code=422, detail="A disponibilidade precisa ser futura")
    if len(set(payload.times)) != len(payload.times) or any(not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) for value in payload.times):
        raise HTTPException(status_code=422, detail="Informe horários únicos no formato HH:MM")

    professional_id = user["id"] if role == "professional" else payload.professional_id
    if not professional_id:
        raise HTTPException(status_code=422, detail="Selecione o profissional")
    professional = await db.users.find_one(
        {"id": professional_id, "tenant_id": user["tenant_id"], "role": "professional", "active": True},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not professional:
        raise HTTPException(status_code=404, detail="Profissional não encontrado nesta clínica")

    created = 0
    for time in payload.times:
        query = {
            "tenant_id": user["tenant_id"],
            "professional_id": professional_id,
            "date": requested_date,
            "time": time,
        }
        slot = {"id": new_id(), **query, "status": "available"}
        try:
            result = await db.availability.update_one(query, {"$setOnInsert": slot}, upsert=True)
        except DuplicateKeyError:
            continue
        if result.upserted_id:
            created += 1

    docs = await db.availability.find(
        tenant_filter(user, {"professional_id": professional_id, "date": requested_date}), {"_id": 0}
    ).sort("time", 1).to_list(100)
    return AvailabilityCreateOut(created=created, slots=await _decorate_slots(docs, user["tenant_id"]))


@router.delete("/{slot_id}")
async def delete_availability(slot_id: str, user: dict = Depends(require_perm("agenda.edit"))):
    if user.get("role") not in ("clinic_admin", "professional"):
        raise HTTPException(status_code=403, detail="Somente profissionais e admins podem remover horários")
    query = {"id": slot_id, "tenant_id": user["tenant_id"], "status": "available"}
    if user["role"] == "professional":
        query["professional_id"] = user["id"]
    removed = await db.availability.delete_one(query)
    if not removed.deleted_count:
        raise HTTPException(status_code=409, detail="Horário não encontrado ou já reservado")
    return {"ok": True}