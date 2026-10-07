from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import lib.asaas as asaas
import lib.auth as auth
import routers.clinic as clinic
import routers.superadmin as superadmin
import routers.webhooks as webhooks
from models.schemas import PlanIn, SelectPlanIn


class MemoryTenants:
    def __init__(self, documents):
        self.documents = [dict(document) for document in documents]

    async def find_one(self, query, _projection=None):
        return next(
            (
                dict(document)
                for document in self.documents
                if self.matches(document, query)
            ),
            None,
        )

    async def update_one(self, query, update):
        document = next(
            (
                item
                for item in self.documents
                if self.matches(item, query)
            ),
            None,
        )
        if not document:
            return SimpleNamespace(matched_count=0)
        document.update(update.get("$set", {}))
        for key in update.get("$unset", {}):
            document.pop(key, None)
        return SimpleNamespace(matched_count=1)

    @classmethod
    def matches(cls, document, query):
        for key, expected in query.items():
            if key == "$or":
                if not any(cls.matches(document, condition) for condition in expected):
                    return False
                continue
            if isinstance(expected, dict):
                if "$ne" in expected and document.get(key) == expected["$ne"]:
                    return False
                if "$exists" in expected and (key in document) != expected["$exists"]:
                    return False
                if "$lt" in expected:
                    value = document.get(key)
                    if value is None or not value < expected["$lt"]:
                        return False
            elif document.get(key) != expected:
                return False
        return True

    def find(self, query, _projection=None):
        return MemoryCursor([
            document for document in self.documents
            if self.matches(document, query)
        ])


class MemoryCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, length):
        return self.documents[:length]


def test_asaas_uses_sandbox_by_default(monkeypatch):
    monkeypatch.setenv("ASAAS_API_KEY", "sandbox-test-key")
    monkeypatch.setenv("ASAAS_WEBHOOK_TOKEN", "sandbox-webhook-token")
    monkeypatch.delenv("ASAAS_ENV", raising=False)

    assert asaas._configuration() == (
        "sandbox-test-key",
        "https://api-sandbox.asaas.com/v3",
    )


def test_asaas_requires_api_and_webhook_secrets(monkeypatch):
    monkeypatch.setenv("ASAAS_API_KEY", "sandbox-test-key")
    monkeypatch.delenv("ASAAS_WEBHOOK_TOKEN", raising=False)

    with pytest.raises(asaas.AsaasNotConfigured):
        asaas._configuration()


@pytest.mark.asyncio
async def test_checkout_creates_monthly_undefined_subscription(monkeypatch):
    requests = []
    responses = [
        {"data": []},
        {"id": "cus_test"},
        {"id": "sub_test"},
        {"data": [{"invoiceUrl": "https://www.asaas.com/i/test"}]},
    ]

    async def mock_request(method, path, *, json=None, params=None):
        requests.append((method, path, json, params))
        return responses.pop(0)

    monkeypatch.setattr(asaas, "_request", mock_request)

    checkout = await asaas.create_asaas_checkout(
        {"id": "tenant-1"},
        {"name": "Ana", "email": "ana@example.com"},
        {"id": "pro", "name": "Pro", "price": 349},
    )

    subscription_request = requests[2][2]
    assert subscription_request["billingType"] == "UNDEFINED"
    assert subscription_request["cycle"] == "MONTHLY"
    assert subscription_request["value"] == 349
    assert subscription_request["externalReference"] == "tenant-1"
    assert checkout == {
        "customer_id": "cus_test",
        "subscription_id": "sub_test",
        "due_date": (date.fromisoformat(asaas.today_iso()) + timedelta(days=1)).isoformat(),
        "invoice_url": "https://www.asaas.com/i/test",
    }


@pytest.mark.asyncio
async def test_legacy_asaas_checkout_reuses_existing_invoice(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "selected_plan_id": "pro",
        "asaas_subscription_id": "sub-existing",
        "asaas_plan_id": "pro",
        "asaas_checkout_url": "https://www.asaas.com/i/existing",
    }])
    plans = MemoryTenants([{"id": "pro", "name": "Pro", "price": 349, "active": True}])
    monkeypatch.setattr(
        clinic,
        "db",
        SimpleNamespace(tenants=tenants, plans=plans),
    )

    result = await clinic.subscription_checkout(
        SelectPlanIn(plan_id="pro"),
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert result["subscription_status"] == "pending_payment"
    assert result["payment_url"] == "https://www.asaas.com/i/existing"
    assert tenants.documents[0]["asaas_subscription_id"] == "sub-existing"
    assert tenants.documents[0]["subscription_status"] == "pending_payment"


@pytest.mark.asyncio
async def test_pagbank_recurring_link_checkout_requires_manual_confirmation(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "selected_plan_id": "pro",
    }])
    plans = MemoryTenants([{
        "id": "pro",
        "name": "Pro",
        "price": 349,
        "active": True,
        "pagbank_recurring_url": "https://pag.ae/recurring-pro",
    }])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(tenants=tenants, plans=plans))

    result = await clinic.subscription_checkout(
        SelectPlanIn(plan_id="pro"),
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert result["subscription_status"] == "pending_payment"
    assert result["payment_url"] == "https://pag.ae/recurring-pro"
    assert tenants.documents[0]["subscription_status"] == "pending_payment"
    assert tenants.documents[0]["subscription_payment_status"] == "awaiting_manual_confirmation"
    assert tenants.documents[0]["pagbank_recurring_link_started"] is True

    with pytest.raises(HTTPException) as error:
        await clinic.subscription_checkout(
            SelectPlanIn(plan_id="pro"),
            {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
        )
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_pagbank_checkout_accepts_stale_selected_plan_id(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "plan_id": "pro",
        "selected_plan_id": "basic",
    }])
    plans = MemoryTenants([{
        "id": "pro",
        "name": "Pro",
        "price": 349,
        "active": True,
        "pagbank_recurring_url": "https://pag.ae/recurring-pro",
    }])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(tenants=tenants, plans=plans))

    result = await clinic.subscription_checkout(
        SelectPlanIn(plan_id="pro"),
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert result["payment_url"] == "https://pag.ae/recurring-pro"
    assert tenants.documents[0]["selected_plan_id"] == "pro"
    assert tenants.documents[0]["pagbank_recurring_link_started"] is True


@pytest.mark.asyncio
async def test_pagbank_checkout_requires_a_configured_recurring_link(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "selected_plan_id": "pro",
    }])
    plans = MemoryTenants([{"id": "pro", "name": "Pro", "price": 349, "active": True}])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(tenants=tenants, plans=plans))

    with pytest.raises(HTTPException) as error:
        await clinic.subscription_checkout(
            SelectPlanIn(plan_id="pro"),
            {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
        )

    assert error.value.status_code == 503
    assert not tenants.documents[0].get("pagbank_recurring_link_started")


@pytest.mark.asyncio
async def test_superadmin_can_release_pagbank_attempt_after_manual_review(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "pagbank_recurring_link_started": True,
        "pagbank_payment_link": "https://pag.ae/recurring-pro",
        "pagbank_plan_id": "pro",
    }])
    monkeypatch.setattr(superadmin, "db", SimpleNamespace(tenants=tenants))

    result = await superadmin.reset_subscription_payment_attempt("tenant-1")

    assert result == {"ok": True}
    assert not tenants.documents[0].get("pagbank_recurring_link_started")
    assert not tenants.documents[0].get("pagbank_payment_link")
    assert not tenants.documents[0].get("pagbank_plan_id")


def test_plan_rejects_non_https_pagbank_recurring_link():
    with pytest.raises(ValueError):
        PlanIn(
            name="Pro",
            price=349,
            max_users=15,
            max_patients=5000,
            pagbank_recurring_url="http://example.com/checkout",
        )


@pytest.mark.asyncio
async def test_asaas_webhook_rejects_invalid_token(monkeypatch):
    monkeypatch.setenv("ASAAS_WEBHOOK_TOKEN", "expected-secret")

    with pytest.raises(HTTPException) as error:
        await webhooks.asaas_webhook(
            {"event": "PAYMENT_RECEIVED", "payment": {}},
            "wrong-secret",
        )

    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_payment_received_activates_subscription_and_clears_grace(monkeypatch):
    monkeypatch.setenv("ASAAS_WEBHOOK_TOKEN", "expected-secret")
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "asaas_subscription_id": "sub-1",
        "subscription_status": "pending_payment",
        "subscription_grace_until": datetime.now(timezone.utc) + timedelta(days=2),
    }])
    monkeypatch.setattr(webhooks, "db", SimpleNamespace(tenants=tenants))

    result = await webhooks.asaas_webhook(
        {
            "event": "PAYMENT_RECEIVED",
            "payment": {
                "id": "pay-1",
                "subscription": "sub-1",
                "dueDate": "2026-10-07",
            },
        },
        "expected-secret",
    )

    assert result["subscription_status"] == "active"
    assert tenants.documents[0]["subscription_payment_status"] == "paid"
    assert tenants.documents[0]["last_paid_payment_id"] == "pay-1"
    assert "subscription_grace_until" not in tenants.documents[0]


@pytest.mark.asyncio
async def test_overdue_webhook_grants_five_day_grace_without_extending_on_retry(monkeypatch):
    monkeypatch.setenv("ASAAS_WEBHOOK_TOKEN", "expected-secret")
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "asaas_subscription_id": "sub-1",
        "subscription_status": "active",
        "subscription_payment_due_date": "2026-10-07",
    }])
    monkeypatch.setattr(webhooks, "db", SimpleNamespace(tenants=tenants))
    payload = {
        "event": "PAYMENT_OVERDUE",
        "payment": {
            "id": "pay-late",
            "subscription": "sub-1",
            "dueDate": "2026-10-07",
        },
    }

    await webhooks.asaas_webhook(payload, "expected-secret")
    first_grace_deadline = tenants.documents[0]["subscription_grace_until"]
    await webhooks.asaas_webhook(payload, "expected-secret")

    assert tenants.documents[0]["subscription_status"] == "pending_payment"
    assert tenants.documents[0]["subscription_payment_status"] == "overdue"
    assert tenants.documents[0]["subscription_grace_until"] == first_grace_deadline
    assert first_grace_deadline - tenants.documents[0]["subscription_overdue_at"] == timedelta(days=5)


@pytest.mark.asyncio
async def test_clinic_access_is_allowed_during_grace_and_blocked_after(monkeypatch):
    now = datetime.now(timezone.utc)
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "subscription_grace_until": now + timedelta(days=1),
    }])
    monkeypatch.setattr(auth, "db", SimpleNamespace(tenants=tenants))
    user = {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"}

    assert await auth.require_tenant_user(user) == user

    tenants.documents[0]["subscription_grace_until"] = now - timedelta(seconds=1)
    with pytest.raises(HTTPException) as error:
        await auth.require_tenant_user(user)

    assert error.value.status_code == 402
