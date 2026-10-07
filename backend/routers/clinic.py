"""All clinic-scoped resources. Every query is built from tenant_filter(user)."""

from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import PERMISSIONS, ROLE_DEFAULTS, current_user, effective_permissions, hash_password, public_user, require_perm, require_tenant_user, tenant_filter
from lib.asaas import AsaasApiError, AsaasNotConfigured, get_asaas_invoice_url
from lib.dates import today_iso
from lib.db import db
from models.schemas import (
    AppointmentIn,
    AppointmentOut,
    AppointmentPatch,
    CampaignIn,
    CampaignOut,
    MemberIn,
    MemberPatch,
    NoticeOut,
    Patient,
    PatientIn,
    RecordIn,
    RecordPatch,
    RecordOut,
    SelectPlanIn,
    UserOut,
    new_id,
    utcnow,
)

router = APIRouter(prefix="/clinic", tags=["clinic"])


@router.get("/subscription")
async def get_subscription(user: dict = Depends(current_user)):
    if user.get("role") != "clinic_admin" or not user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Somente o administrador da clínica pode gerenciar o plano")
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")
    plan = await db.plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0}) if tenant.get("plan_id") else None
    trial_ends_at = tenant.get("trial_ends_at")
    subscription_status = tenant.get("subscription_status", "active")
    if trial_ends_at and subscription_status != "active":
        deadline = trial_ends_at if trial_ends_at.tzinfo else trial_ends_at.replace(tzinfo=timezone.utc)
        if deadline <= datetime.now(timezone.utc):
            subscription_status = "expired" if subscription_status == "trialing" else "pending_payment"
    return {
        "plan": plan,
        "plan_id": tenant.get("plan_id"),
        "subscription_status": subscription_status,
        "trial_ends_at": trial_ends_at,
        "subscription_payment_status": tenant.get("subscription_payment_status"),
        "subscription_grace_until": tenant.get("subscription_grace_until"),
        "pending_plan_change_locked": bool(
            tenant.get("asaas_subscription_id")
            or tenant.get("pagbank_recurring_link_started")
        ),
        "pagbank_recurring_link_started": bool(tenant.get("pagbank_recurring_link_started")),
    }


@router.put("/subscription/plan")
async def select_subscription_plan(payload: SelectPlanIn, user: dict = Depends(current_user)):
    if user.get("role") != "clinic_admin" or not user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Somente o administrador da clínica pode gerenciar o plano")
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")
    if tenant.get("subscription_status", "active") == "active":
        raise HTTPException(status_code=409, detail="A alteração de planos pagos ainda não está disponível")
    plan = await db.plans.find_one({"id": payload.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    if (
        tenant.get("asaas_subscription_id")
        and tenant.get("asaas_plan_id") != plan["id"]
    ):
        raise HTTPException(
            status_code=409,
            detail="Já existe uma assinatura pendente para outro plano. Contate o suporte para alterá-la.",
        )
    if (
        tenant.get("pagbank_recurring_link_started")
        and tenant.get("pagbank_plan_id") != plan["id"]
    ):
        raise HTTPException(
            status_code=409,
            detail="Já existe uma tentativa de assinatura PagBank para outro plano. Contate o suporte.",
        )

    trial_ends_at = tenant.get("trial_ends_at")
    deadline = trial_ends_at
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    trial_active = bool(deadline and deadline > datetime.now(timezone.utc))
    subscription_status = "trialing" if trial_active else "pending_payment"
    result = await db.tenants.update_one(
        {
            "id": tenant["id"],
            "subscription_status": {"$ne": "active"},
            "pagbank_recurring_link_started": {"$ne": True},
        },
        {"$set": {
            "plan_id": plan["id"],
            "selected_plan_id": plan["id"],
            "subscription_status": subscription_status,
        }},
    )
    if not result.matched_count:
        raise HTTPException(
            status_code=409,
            detail="A assinatura foi iniciada ou alterada. Atualize a página antes de continuar.",
        )
    return {"plan": plan, "subscription_status": subscription_status, "trial_ends_at": trial_ends_at}


@router.post("/subscription/checkout")
async def subscription_checkout(payload: SelectPlanIn, user: dict = Depends(current_user)):
    if user.get("role") != "clinic_admin" or not user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Somente o administrador da clínica pode iniciar o pagamento")
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")
    if tenant.get("subscription_status", "active") == "active":
        raise HTTPException(status_code=409, detail="A assinatura já está ativa")
    if tenant.get("selected_plan_id") != payload.plan_id:
        raise HTTPException(status_code=409, detail="Selecione o plano antes de iniciar o pagamento")

    plan = await db.plans.find_one({"id": payload.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    if plan["price"] <= 0:
        raise HTTPException(status_code=422, detail="O plano selecionado não possui cobrança")

    existing_subscription = tenant.get("asaas_subscription_id")
    if existing_subscription:
        if tenant.get("asaas_plan_id") != plan["id"]:
            raise HTTPException(
                status_code=409,
                detail="Já existe uma assinatura pendente para outro plano. Contate o suporte para alterá-la.",
            )
        invoice_url = tenant.get("asaas_checkout_url")
        if not invoice_url:
            try:
                invoice_url = await get_asaas_invoice_url(existing_subscription)
            except AsaasNotConfigured as exc:
                raise HTTPException(status_code=503, detail="A integração Asaas não está configurada") from exc
            except AsaasApiError as exc:
                raise HTTPException(status_code=502, detail="Não foi possível consultar a cobrança no Asaas") from exc
            if invoice_url:
                await db.tenants.update_one(
                    {"id": tenant["id"], "asaas_subscription_id": existing_subscription},
                    {"$set": {"asaas_checkout_url": invoice_url}},
                )
        return {
            "subscription_status": tenant.get("subscription_status"),
            "payment_url": invoice_url,
            "message": None if invoice_url else "A cobrança está sendo gerada. Tente novamente em instantes.",
        }

    if tenant.get("pagbank_recurring_link_started"):
        raise HTTPException(
            status_code=409,
            detail="Já existe uma tentativa de assinatura em andamento. Aguarde a conferência do PagBank antes de tentar novamente.",
        )
    payment_url = plan.get("pagbank_recurring_url")
    try:
        parsed_url = urlsplit(payment_url or "")
    except ValueError:
        parsed_url = None
    if (
        not parsed_url
        or parsed_url.scheme != "https"
        or not parsed_url.netloc
        or parsed_url.username
        or parsed_url.password
    ):
        raise HTTPException(
            status_code=503,
            detail="O link recorrente PagBank deste plano ainda não foi configurado no Super Admin.",
        )

    result = await db.tenants.update_one(
        {
            "id": tenant["id"],
            "subscription_status": {"$ne": "active"},
            "selected_plan_id": plan["id"],
            "pagbank_recurring_link_started": {"$ne": True},
        },
        {
            "$set": {
                "plan_id": plan["id"],
                "selected_plan_id": plan["id"],
                "subscription_status": "pending_payment",
                "subscription_payment_status": "awaiting_manual_confirmation",
                "pagbank_plan_id": plan["id"],
                "pagbank_payment_link": payment_url,
                "pagbank_recurring_link_started": True,
            }
        },
    )
    if not result.matched_count:
        raise HTTPException(
            status_code=409,
            detail="A assinatura mudou ou uma tentativa PagBank já foi iniciada. Atualize a página.",
        )
    return {
        "subscription_status": "pending_payment",
        "payment_url": payment_url,
        "message": "Após a confirmação do pagamento no painel PagBank, um administrador liberará o acesso.",
    }


@router.get("/notices", response_model=list[NoticeOut])
async def list_global_notices(user: dict = Depends(require_tenant_user)):
    if user.get("role") != "clinic_admin":
        raise HTTPException(status_code=403, detail="Avisos globais são exclusivos para administradores da clínica")
    docs = await db.notices.find(
        {"active": True, "$or": [{"tenant_id": None}, {"tenant_id": user["tenant_id"]}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    return [NoticeOut(**doc) for doc in docs]


@router.get("/permissions")
async def permission_catalog(user: dict = Depends(require_tenant_user)):
    return {"permissions": PERMISSIONS, "role_defaults": ROLE_DEFAULTS}


# ---------- dashboard ----------
@router.get("/overview")
async def overview(user: dict = Depends(require_tenant_user)):
    today = today_iso()
    month = today[:7]
    appts_today = await db.appointments.find(
        tenant_filter(user, {"date": today}), {"_id": 0}
    ).sort("time", 1).to_list(200)
    month_appts = await db.appointments.find(
        tenant_filter(user, {"date": {"$regex": f"^{month}"}}), {"_id": 0}
    ).to_list(1000)
    revenue = sum(a.get("price", 0) for a in month_appts if a.get("status") == "done")
    patient_names = {
        p["id"]: p["name"]
        for p in await db.patients.find(tenant_filter(user), {"_id": 0, "id": 1, "name": 1}).to_list(2000)
    }
    for a in appts_today:
        a["patient_name"] = patient_names.get(a["patient_id"], "—")
    return {
        "date": today,
        "patients_total": await db.patients.count_documents(tenant_filter(user)),
        "appointments_today": len(appts_today),
        "appointments_month": len(month_appts),
        "revenue_month": round(revenue, 2),
        "records_total": await db.records.count_documents(tenant_filter(user)),
        "agenda_today": appts_today,
    }


@router.get("/finance/overview")
async def finance_overview(user: dict = Depends(require_perm("finance.view"))):
    current_month = date.fromisoformat(today_iso()).replace(day=1)
    first_month_index = current_month.year * 12 + current_month.month - 1 - 5
    first_month = date(first_month_index // 12, first_month_index % 12 + 1, 1)
    next_month = (current_month + timedelta(days=32)).replace(day=1)
    last_day = next_month - timedelta(days=1)

    pipeline = [
        {
            "$match": tenant_filter(
                user,
                {"date": {"$gte": first_month.isoformat(), "$lte": last_day.isoformat()}},
            )
        },
        {
            "$group": {
                "_id": {
                    "month": {"$substrBytes": ["$date", 0, 7]},
                    "status": "$status",
                },
                "value": {"$sum": {"$ifNull": ["$price", 0]}},
                "count": {"$sum": 1},
            }
        },
    ]
    grouped = await db.appointments.aggregate(pipeline).to_list(length=None)

    month_values = {}
    month_labels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    for offset in range(6):
        month_index = first_month.year * 12 + first_month.month - 1 + offset
        month = date(month_index // 12, month_index % 12 + 1, 1)
        month_key = month.strftime("%Y-%m")
        month_values[month_key] = {
            "month": month_key,
            "label": month_labels[month.month - 1],
            "completed_value": 0.0,
            "scheduled_value": 0.0,
            "completed_count": 0,
            "scheduled_count": 0,
            "cancelled_count": 0,
        }

    for row in grouped:
        month_key = row["_id"]["month"]
        month = month_values.get(month_key)
        if not month:
            continue
        status = row["_id"]["status"]
        if status == "done":
            month["completed_value"] = round(float(row["value"]), 2)
            month["completed_count"] = row["count"]
        elif status == "scheduled":
            month["scheduled_value"] = round(float(row["value"]), 2)
            month["scheduled_count"] = row["count"]
        elif status == "cancelled":
            month["cancelled_count"] = row["count"]

    months = list(month_values.values())
    current = months[-1]
    previous = months[-2]
    previous_value = previous["completed_value"]
    change_percent = (
        round((current["completed_value"] - previous_value) / previous_value * 100, 1)
        if previous_value
        else None
    )
    return {
        "months": months,
        "current_month": current,
        "completed_change_percent": change_percent,
        "currency": "BRL",
        "data_note": (
            "Valores calculados pelos preços cadastrados em consultas concluídas "
            "ou agendadas; não representam pagamentos confirmados, despesas ou inadimplência."
        ),
    }


# ---------- patients ----------
@router.get("/patients", response_model=list[Patient])
async def list_patients(user: dict = Depends(require_perm("patients.view"))):
    docs = await db.patients.find(tenant_filter(user), {"_id": 0}).sort("name", 1).to_list(1000)
    return [Patient(**d) for d in docs]


@router.post("/patients", response_model=Patient, status_code=201)
async def create_patient(payload: PatientIn, user: dict = Depends(require_perm("patients.edit"))):
    if await db.patients.find_one(tenant_filter(user, {"cpf": payload.cpf})):
        raise HTTPException(status_code=409, detail="CPF já cadastrado nesta clínica")
    p = Patient(tenant_id=user["tenant_id"], **payload.model_dump())
    await db.patients.insert_one(p.model_dump())
    return p


@router.get("/patients/{patient_id}", response_model=Patient)
async def get_patient(patient_id: str, user: dict = Depends(require_perm("patients.view"))):
    doc = await db.patients.find_one(tenant_filter(user, {"id": patient_id}), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return Patient(**doc)


@router.put("/patients/{patient_id}", response_model=Patient)
async def update_patient(patient_id: str, payload: PatientIn, user: dict = Depends(require_perm("patients.edit"))):
    duplicate = await db.patients.find_one(
        tenant_filter(user, {"cpf": payload.cpf, "id": {"$ne": patient_id}}), {"_id": 0, "id": 1}
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="CPF já cadastrado nesta clínica")
    doc = await db.patients.find_one_and_update(
        tenant_filter(user, {"id": patient_id}),
        {"$set": payload.model_dump()},
        return_document=True,
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return Patient(**doc)


@router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, user: dict = Depends(require_perm("patients.edit"))):
    appointments = await db.appointments.find(
        tenant_filter(user, {"patient_id": patient_id}), {"_id": 0, "id": 1, "availability_id": 1}
    ).to_list(1000)
    availability_ids = [appointment["availability_id"] for appointment in appointments if appointment.get("availability_id")]
    if availability_ids:
        await db.availability.update_many(
            tenant_filter(user, {"id": {"$in": availability_ids}, "status": "booked"}),
            {"$set": {"status": "available"}, "$unset": {"appointment_id": ""}},
        )
    res = await db.patients.delete_one(tenant_filter(user, {"id": patient_id}))
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    await db.appointments.delete_many(tenant_filter(user, {"patient_id": patient_id}))
    await db.records.delete_many(tenant_filter(user, {"patient_id": patient_id}))
    return {"ok": True}


# ---------- appointments ----------
async def _decorate(appts: list, user: dict) -> list:
    patients = {
        p["id"]: p["name"]
        for p in await db.patients.find(tenant_filter(user), {"_id": 0, "id": 1, "name": 1}).to_list(2000)
    }
    pros = {
        u["id"]: u["name"]
        for u in await db.users.find({"tenant_id": user["tenant_id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    }
    out = []
    for a in appts:
        a["patient_name"] = patients.get(a["patient_id"], "—")
        a["professional_name"] = pros.get(a.get("professional_id"), None)
        out.append(AppointmentOut(**a))
    return out


@router.get("/appointments", response_model=list[AppointmentOut])
async def list_appointments(date: str | None = None, user: dict = Depends(require_perm("agenda.view"))):
    flt = tenant_filter(user, {"date": date} if date else None)
    docs = await db.appointments.find(flt, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return await _decorate(docs, user)


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
async def create_appointment(payload: AppointmentIn, user: dict = Depends(require_perm("agenda.edit"))):
    if not await db.patients.find_one(tenant_filter(user, {"id": payload.patient_id})):
        raise HTTPException(status_code=404, detail="Paciente não encontrado nesta clínica")
    professional_id = user["id"] if user.get("role") == "professional" else payload.professional_id
    if professional_id:
        professional = await db.users.find_one(
            {"id": professional_id, "tenant_id": user["tenant_id"], "role": "professional", "active": True},
            {"_id": 0, "id": 1},
        )
        if not professional:
            raise HTTPException(status_code=404, detail="Profissional não encontrado nesta clínica")

    appointment_id = new_id()
    slot = None
    slot_query = tenant_filter(user, {"date": payload.date, "time": payload.time, "status": "available"})
    if professional_id:
        slot_query["professional_id"] = professional_id
    else:
        available_slots = await db.availability.find(slot_query, {"_id": 0}).to_list(2)
        if len(available_slots) > 1:
            raise HTTPException(status_code=422, detail="Selecione o profissional para este horário")
        if available_slots:
            slot_query["professional_id"] = available_slots[0]["professional_id"]
            professional_id = available_slots[0]["professional_id"]

    conflict_filter = {"date": payload.date, "time": payload.time, "status": "scheduled"}
    if professional_id:
        conflict_filter["$or"] = [
            {"professional_id": professional_id},
            {"patient_id": payload.patient_id},
        ]
    conflict = await db.appointments.find_one(tenant_filter(user, conflict_filter), {"_id": 0, "id": 1})
    if conflict:
        raise HTTPException(status_code=409, detail="Horário já ocupado para este profissional")

    if professional_id:
        available_slot = await db.availability.find_one(slot_query, {"_id": 0, "id": 1})
        if available_slot:
            slot = await db.availability.find_one_and_update(
                slot_query,
                {"$set": {"status": "booked", "appointment_id": appointment_id}},
                return_document=True,
                projection={"_id": 0},
            )
            if not slot:
                raise HTTPException(status_code=409, detail="Este horário acabou de ser reservado")

    doc = {
        "id": appointment_id,
        "tenant_id": user["tenant_id"],
        **payload.model_dump(),
        "professional_id": professional_id,
        "availability_id": slot.get("id") if slot else None,
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
    return (await _decorate([doc], user))[0]


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
async def patch_appointment(appointment_id: str, payload: AppointmentPatch, user: dict = Depends(require_perm("agenda.edit"))):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=422, detail="Nada para atualizar")
    previous = await db.appointments.find_one(tenant_filter(user, {"id": appointment_id}), {"_id": 0})
    if not previous:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    doc = await db.appointments.find_one_and_update(
        tenant_filter(user, {"id": appointment_id}), {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if update.get("status") == "cancelled" and previous.get("availability_id"):
        await db.availability.update_one(
            {"id": previous["availability_id"], "tenant_id": user["tenant_id"], "appointment_id": appointment_id},
            {"$set": {"status": "available"}, "$unset": {"appointment_id": ""}},
        )
    return (await _decorate([doc], user))[0]


# ---------- medical records ----------
@router.get("/records", response_model=list[RecordOut])
async def list_records(patient_id: str | None = None, user: dict = Depends(require_perm("records.view"))):
    record_filter = {"archived_at": None}
    if patient_id:
        record_filter["patient_id"] = patient_id
    flt = tenant_filter(user, record_filter)
    docs = await db.records.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    patient_names = {
        p["id"]: p["name"]
        for p in await db.patients.find(
            tenant_filter(user, {"id": {"$in": [d["patient_id"] for d in docs]}}),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(500)
    }
    authors = {
        u["id"]: u["name"]
        for u in await db.users.find({"tenant_id": user["tenant_id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    }
    for d in docs:
        d["author_name"] = authors.get(d.get("author_id"))
        d["patient_name"] = patient_names.get(d["patient_id"])
    return [RecordOut(**d) for d in docs]


@router.post("/records", response_model=RecordOut, status_code=201)
async def create_record(payload: RecordIn, user: dict = Depends(require_perm("records.edit"))):
    patient = await db.patients.find_one(
        tenant_filter(user, {"id": payload.patient_id}), {"_id": 0, "name": 1}
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado nesta clínica")
    doc = {
        "id": new_id(),
        "tenant_id": user["tenant_id"],
        **payload.model_dump(),
        "author_id": user["id"],
        "created_at": utcnow(),
    }
    await db.records.insert_one(dict(doc))
    doc["author_name"] = user["name"]
    doc["patient_name"] = patient["name"]
    return RecordOut(**doc)


@router.patch("/records/{record_id}", response_model=RecordOut)
async def update_record(record_id: str, payload: RecordPatch, user: dict = Depends(require_perm("records.edit"))):
    if user.get("role") not in {"professional", "clinic_admin"}:
        raise HTTPException(status_code=403, detail="Somente profissionais e administradores podem editar laudos")
    update = payload.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=422, detail="Nenhuma alteração informada")
    update["updated_at"] = utcnow()
    update["updated_by"] = user["id"]
    record = await db.records.find_one_and_update(
        tenant_filter(user, {"id": record_id, "archived_at": None}),
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    patient = await db.patients.find_one(
        tenant_filter(user, {"id": record["patient_id"]}), {"_id": 0, "name": 1}
    )
    record["patient_name"] = patient["name"] if patient else None
    author = await db.users.find_one(
        {"id": record.get("author_id"), "tenant_id": user["tenant_id"]}, {"_id": 0, "name": 1}
    )
    record["author_name"] = author["name"] if author else None
    return RecordOut(**record)


@router.delete("/records/{record_id}", status_code=204)
async def archive_record(record_id: str, user: dict = Depends(require_perm("records.edit"))):
    if user.get("role") not in {"professional", "clinic_admin"}:
        raise HTTPException(status_code=403, detail="Somente profissionais e administradores podem excluir laudos")
    result = await db.records.update_one(
        tenant_filter(user, {"id": record_id, "archived_at": None}),
        {"$set": {"archived_at": utcnow(), "archived_by": user["id"]}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")


# ---------- team / RBAC ----------
@router.get("/team", response_model=list[UserOut])
async def list_team(user: dict = Depends(require_perm("team.manage"))):
    docs = await db.users.find({"tenant_id": user["tenant_id"]}, {"_id": 0}).sort("name", 1).to_list(500)
    return [UserOut(**public_user(d)) for d in docs]


@router.post("/team", response_model=UserOut, status_code=201)
async def create_member(payload: MemberIn, user: dict = Depends(require_perm("team.manage"))):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    plan = await db.plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0}) if tenant else None
    if plan:
        count = await db.users.count_documents({"tenant_id": user["tenant_id"]})
        if count >= plan["max_users"]:
            raise HTTPException(status_code=409, detail=f"Limite do plano atingido ({plan['max_users']} usuários)")
    perms = payload.permissions or ROLE_DEFAULTS.get(payload.role, [])
    doc = {
        "id": new_id(),
        "tenant_id": user["tenant_id"],
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password or "prontuai123"),
        "role": payload.role,
        "specialty": payload.specialty,
        "permissions": [p for p in perms if p in PERMISSIONS],
        "active": payload.active,
        "created_at": utcnow(),
    }
    await db.users.insert_one(dict(doc))
    return UserOut(**public_user(doc))


@router.patch("/team/{member_id}", response_model=UserOut)
async def patch_member(member_id: str, payload: MemberPatch, user: dict = Depends(require_perm("team.manage"))):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "permissions" in update:
        update["permissions"] = [p for p in update["permissions"] if p in PERMISSIONS]
    if not update:
        raise HTTPException(status_code=422, detail="Nada para atualizar")
    if member_id == user["id"] and update.get("active") is False:
        raise HTTPException(status_code=409, detail="Você não pode desativar a si mesmo")
    doc = await db.users.find_one_and_update(
        {"id": member_id, "tenant_id": user["tenant_id"]},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return UserOut(**public_user(doc))


@router.delete("/team/{member_id}")
async def delete_member(member_id: str, user: dict = Depends(require_perm("team.manage"))):
    if member_id == user["id"]:
        raise HTTPException(status_code=409, detail="Você não pode remover a si mesmo")
    res = await db.users.delete_one({"id": member_id, "tenant_id": user["tenant_id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return {"ok": True}


# ---------- marketing campaigns (envio SIMULADO) ----------
@router.get("/campaigns", response_model=list[CampaignOut])
async def list_campaigns(user: dict = Depends(require_perm("campaigns.send"))):
    docs = await db.campaigns.find(tenant_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)
    return [CampaignOut(**d) for d in docs]


@router.post("/campaigns", response_model=CampaignOut, status_code=201)
async def send_campaign(payload: CampaignIn, user: dict = Depends(require_perm("campaigns.send"))):
    patients = await db.patients.find(tenant_filter(user), {"_id": 0}).to_list(5000)
    if payload.audience == "birthdays":
        month = today_iso()[5:7]
        patients = [p for p in patients if (p.get("birth_date") or "")[5:7] == month]
    elif payload.audience == "inactive":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()[:10]
        recent = {
            a["patient_id"]
            for a in await db.appointments.find(
                tenant_filter(user, {"date": {"$gte": cutoff}}), {"_id": 0, "patient_id": 1}
            ).to_list(5000)
        }
        patients = [p for p in patients if p["id"] not in recent]
    doc = {
        "id": new_id(),
        "tenant_id": user["tenant_id"],
        **payload.model_dump(),
        "recipients": len(patients),
        "status": "sent",
        "created_at": utcnow(),
    }
    await db.campaigns.insert_one(dict(doc))
    return CampaignOut(**doc)
