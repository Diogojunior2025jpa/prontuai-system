"""Patient self-service portal — its own session kind, scoped to one patient."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from lib.auth import PORTAL_COOKIE, create_session, destroy_session
from lib.db import db
from models.schemas import AppointmentOut, PortalAvailabilityList, PortalAvailabilityOut, PortalBookIn, PortalLoginIn, new_id, utcnow

router = APIRouter(prefix="/portal", tags=["portal"])


async def _current_patient(request: Request) -> dict:
    sid = request.cookies.get(PORTAL_COOKIE)
    if not sid:
        raise HTTPException(status_code=401, detail="Não autenticado")
    session = await db.sessions.find_one({"id": sid, "kind": "patient"})
    if not session:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    patient = await db.patients.find_one({"id": session["subject_id"]}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=401, detail="Paciente não encontrado")
    return patient


def _clean_cpf(cpf: str) -> str:
    return "".join(ch for ch in cpf if ch.isdigit())


async def _me_payload(patient: dict) -> dict:
    tenant = await db.tenants.find_one({"id": patient["tenant_id"]}, {"_id": 0})
    return {
        "patient": {k: patient[k] for k in ("id", "name", "cpf", "birth_date", "phone", "email")},
        "clinic": {"id": tenant["id"], "name": tenant["name"], "specialty": tenant.get("specialty")} if tenant else None,
    }


@router.post("/login")
async def portal_login(payload: PortalLoginIn, response: Response):
    cpf = _clean_cpf(payload.cpf)
    candidates = await db.patients.find({"birth_date": payload.birth_date}, {"_id": 0}).to_list(500)
    patient = next((p for p in candidates if _clean_cpf(p.get("cpf", "")) == cpf), None)
    if not patient:
        raise HTTPException(status_code=401, detail="CPF ou data de nascimento inválidos")
    await create_session(response, "patient", patient["id"], PORTAL_COOKIE)
    return await _me_payload(patient)


@router.get("/me")
async def portal_me(request: Request):
    return await _me_payload(await _current_patient(request))


@router.post("/logout")
async def portal_logout(request: Request, response: Response):
    await destroy_session(request, response, PORTAL_COOKIE)
    return {"ok": True}


@router.get("/appointments", response_model=list[AppointmentOut])
async def portal_appointments(request: Request):
    patient = await _current_patient(request)
    docs = await db.appointments.find(
        {"tenant_id": patient["tenant_id"], "patient_id": patient["id"]}, {"_id": 0}
    ).sort([("date", -1), ("time", -1)]).to_list(300)
    pros = {
        u["id"]: u["name"]
        for u in await db.users.find({"tenant_id": patient["tenant_id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(300)
    }
    return [
        AppointmentOut(**{**d, "patient_name": patient["name"], "professional_name": pros.get(d.get("professional_id"))})
        for d in docs
    ]


@router.get("/availability", response_model=PortalAvailabilityList)
async def portal_availability(request: Request, date: str | None = None):
    patient = await _current_patient(request)
    managed = await db.availability.count_documents({"tenant_id": patient["tenant_id"]}) > 0
    extra = {"status": "available", "date": date} if date else {
        "status": "available", "date": {"$gte": datetime.now(timezone.utc).date().isoformat()}
    }
    slots = await db.availability.find(
        {"tenant_id": patient["tenant_id"], **extra}, {"_id": 0}
    ).sort([("date", 1), ("time", 1)]).to_list(500)
    professionals = {
        user["id"]: user["name"]
        for user in await db.users.find(
            {"tenant_id": patient["tenant_id"], "id": {"$in": list({slot["professional_id"] for slot in slots})}},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(500)
    }
    formatted_slots = [
        PortalAvailabilityOut(
            id=slot["id"],
            professional_name=professionals.get(slot["professional_id"], "Profissional"),
            date=slot["date"],
            time=slot["time"],
        )
        for slot in slots
    ]
    return PortalAvailabilityList(managed=managed, slots=formatted_slots)


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
async def portal_book(payload: PortalBookIn, request: Request):
    patient = await _current_patient(request)
    tenant = await db.tenants.find_one({"id": patient["tenant_id"]}, {"_id": 0})
    if not tenant or tenant.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="Agendamento indisponível nesta clínica")
    schedules_exist = await db.availability.count_documents({"tenant_id": patient["tenant_id"]})
    if schedules_exist and not payload.availability_id:
        raise HTTPException(status_code=422, detail="Selecione um horário disponibilizado pela clínica")
    slot = None
    if payload.availability_id:
        slot = await db.availability.find_one(
            {
                "id": payload.availability_id,
                "tenant_id": patient["tenant_id"],
                "date": payload.date,
                "time": payload.time,
                "status": "available",
            },
            {"_id": 0, "professional_id": 1},
        )
        if not slot:
            raise HTTPException(status_code=409, detail="Este horário acabou de ser reservado. Escolha outro.")
    clash_query = {"tenant_id": patient["tenant_id"], "date": payload.date, "time": payload.time, "status": "scheduled"}
    if slot:
        clash_query["$or"] = [
            {"professional_id": slot["professional_id"]},
            {"patient_id": patient["id"]},
        ]
    clash = await db.appointments.find_one(
        clash_query
    )
    if clash:
        raise HTTPException(status_code=409, detail="Horário já ocupado. Escolha outro.")
    appointment_id = new_id()
    if payload.availability_id:
        slot = await db.availability.find_one_and_update(
            {
                "id": payload.availability_id,
                "tenant_id": patient["tenant_id"],
                "date": payload.date,
                "time": payload.time,
                "status": "available",
            },
            {"$set": {"status": "booked", "appointment_id": appointment_id}},
            return_document=True,
            projection={"_id": 0},
        )
        if not slot:
            raise HTTPException(status_code=409, detail="Este horário acabou de ser reservado. Escolha outro.")
    doc = {
        "id": appointment_id,
        "tenant_id": patient["tenant_id"],
        "patient_id": patient["id"],
        "professional_id": slot.get("professional_id") if slot else None,
        "availability_id": slot.get("id") if slot else None,
        "date": payload.date,
        "time": payload.time,
        "reason": payload.reason,
        "status": "scheduled",
        "price": 0,
        "created_at": utcnow(),
    }
    try:
        await db.appointments.insert_one(dict(doc))
    except Exception:
        if slot:
            await db.availability.update_one(
                {"id": slot["id"], "appointment_id": appointment_id},
                {"$set": {"status": "available"}, "$unset": {"appointment_id": ""}},
            )
        raise
    professional = await db.users.find_one(
        {"id": doc["professional_id"], "tenant_id": patient["tenant_id"]}, {"_id": 0, "name": 1}
    ) if doc["professional_id"] else None
    return AppointmentOut(**{
        **doc,
        "patient_name": patient["name"],
        "professional_name": professional["name"] if professional else None,
    })
