"""Patient self-service portal — its own session kind, scoped to one patient."""

from fastapi import APIRouter, HTTPException, Request, Response

from lib.auth import PORTAL_COOKIE, create_session, destroy_session
from lib.db import db
from models.schemas import AppointmentOut, PortalBookIn, PortalLoginIn, new_id, utcnow

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


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
async def portal_book(payload: PortalBookIn, request: Request):
    patient = await _current_patient(request)
    tenant = await db.tenants.find_one({"id": patient["tenant_id"]}, {"_id": 0})
    if not tenant or tenant.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="Agendamento indisponível nesta clínica")
    clash = await db.appointments.find_one(
        {"tenant_id": patient["tenant_id"], "date": payload.date, "time": payload.time, "status": "scheduled"}
    )
    if clash:
        raise HTTPException(status_code=409, detail="Horário já ocupado. Escolha outro.")
    doc = {
        "id": new_id(),
        "tenant_id": patient["tenant_id"],
        "patient_id": patient["id"],
        "professional_id": None,
        "date": payload.date,
        "time": payload.time,
        "reason": payload.reason,
        "status": "scheduled",
        "price": 0,
        "created_at": utcnow(),
    }
    await db.appointments.insert_one(dict(doc))
    return AppointmentOut(**{**doc, "patient_name": patient["name"], "professional_name": None})
