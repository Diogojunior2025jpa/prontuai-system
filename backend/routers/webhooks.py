import hmac
import os
from datetime import date, timedelta

from fastapi import APIRouter, Header, HTTPException

from lib.db import db
from models.schemas import utcnow

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

PAID_EVENTS = {"PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"}
PAYMENT_PROBLEM_EVENTS = {
    "PAYMENT_OVERDUE",
    "PAYMENT_REFUNDED",
    "PAYMENT_PARTIALLY_REFUNDED",
    "PAYMENT_RECEIVED_IN_CASH_UNDONE",
    "PAYMENT_CHARGEBACK_REQUESTED",
    "PAYMENT_CHARGEBACK_DISPUTE",
}
GRACE_PERIOD = timedelta(days=5)


@router.post("/asaas")
async def asaas_webhook(
    payload: dict,
    asaas_access_token: str | None = Header(default=None, alias="asaas-access-token"),
):
    expected_token = os.environ.get("ASAAS_WEBHOOK_TOKEN", "")
    if not expected_token:
        raise HTTPException(status_code=503, detail="Webhook Asaas não está configurado")
    if not asaas_access_token or not hmac.compare_digest(asaas_access_token, expected_token):
        raise HTTPException(status_code=401, detail="Webhook não autorizado")

    event = payload.get("event")
    payment = payload.get("payment")
    if not isinstance(payment, dict):
        raise HTTPException(status_code=400, detail="Evento Asaas sem dados de cobrança")
    if event not in PAID_EVENTS | PAYMENT_PROBLEM_EVENTS:
        return {"ok": True, "ignored": True}

    subscription_id = payment.get("subscription")
    payment_id = payment.get("id")
    if not isinstance(subscription_id, str) or not subscription_id:
        return {"ok": True, "ignored": True}
    due_date = payment.get("dueDate")
    if due_date is not None and not isinstance(due_date, str):
        raise HTTPException(status_code=400, detail="Data de vencimento inválida")
    if due_date:
        try:
            date.fromisoformat(due_date)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Data de vencimento inválida") from exc

    tenant = await db.tenants.find_one(
        {"asaas_subscription_id": subscription_id},
        {
            "_id": 0,
            "id": 1,
            "subscription_payment_due_date": 1,
            "subscription_payment_status": 1,
            "last_paid_payment_id": 1,
            "overdue_payment_id": 1,
        },
    )
    if not tenant:
        return {"ok": True, "ignored": True}

    current_due_date = tenant.get("subscription_payment_due_date")
    if current_due_date and due_date and due_date < current_due_date:
        return {"ok": True, "ignored": True}

    now = utcnow()
    if event in PAID_EVENTS:
        update = {
            "subscription_status": "active",
            "subscription_payment_status": "paid",
            "subscription_last_paid_at": now,
            "last_paid_payment_id": payment_id,
        }
        if due_date:
            update["subscription_payment_due_date"] = due_date
        await db.tenants.update_one({"id": tenant["id"]}, {"$set": update, "$unset": {
            "subscription_grace_until": "",
            "subscription_overdue_at": "",
            "overdue_payment_id": "",
        }})
        return {"ok": True, "subscription_status": "active"}

    if (
        event == "PAYMENT_OVERDUE"
        and (
            payment_id == tenant.get("last_paid_payment_id")
            or (
                tenant.get("subscription_payment_status") == "overdue"
                and payment_id == tenant.get("overdue_payment_id")
            )
        )
    ):
        return {"ok": True, "ignored": True}

    update = {
        "subscription_status": "pending_payment",
        "subscription_payment_status": "overdue" if event == "PAYMENT_OVERDUE" else "payment_problem",
        "subscription_overdue_at": now,
        "subscription_grace_until": now + GRACE_PERIOD,
        "overdue_payment_id": payment_id,
    }
    if due_date:
        update["subscription_payment_due_date"] = due_date
    await db.tenants.update_one({"id": tenant["id"]}, {"$set": update})
    return {
        "ok": True,
        "subscription_status": "pending_payment",
        "grace_until": update["subscription_grace_until"],
    }
