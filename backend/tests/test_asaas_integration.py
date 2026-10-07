from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import lib.asaas as asaas
import lib.auth as auth
import routers.clinic as clinic
import routers.webhooks as webhooks
from models.schemas import SelectPlanIn


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
async def test_checkout_route_saves_provider_ids_without_activating_plan(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "selected_plan_id": "pro",
    }])
    users = MemoryTenants([{
        "id": "admin-1",
        "tenant_id": "tenant-1",
        "role": "clinic_admin",
        "active": True,
        "name": "Ana",
        "email": "ana@example.com",
    }])
    plans = MemoryTenants([{"id": "pro", "name": "Pro", "price": 349, "active": True}])
    monkeypatch.setattr(
        clinic,
        "db",
        SimpleNamespace(tenants=tenants, users=users, plans=plans),
    )

    async def mock_checkout(*_args):
        return {
            "customer_id": "cus_test",
            "subscription_id": "sub_test",
            "due_date": "2026-10-08",
            "invoice_url": "https://www.asaas.com/i/test",
        }

    monkeypatch.setattr(clinic, "create_asaas_checkout", mock_checkout)

    result = await clinic.subscription_checkout(
        SelectPlanIn(plan_id="pro"),
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert result["subscription_status"] == "pending_payment"
    assert result["invoice_url"] == "https://www.asaas.com/i/test"
    assert tenants.documents[0]["asaas_subscription_id"] == "sub_test"
    assert tenants.documents[0]["subscription_status"] == "pending_payment"


@pytest.mark.asyncio
async def test_failed_checkout_releases_tenant_lock(monkeypatch):
    tenants = MemoryTenants([{
        "id": "tenant-1",
        "subscription_status": "pending_payment",
        "selected_plan_id": "pro",
    }])
    users = MemoryTenants([{
        "id": "admin-1",
        "tenant_id": "tenant-1",
        "role": "clinic_admin",
        "active": True,
        "name": "Ana",
        "email": "ana@example.com",
    }])
    plans = MemoryTenants([{"id": "pro", "name": "Pro", "price": 349, "active": True}])
    monkeypatch.setattr(
        clinic,
        "db",
        SimpleNamespace(tenants=tenants, users=users, plans=plans),
    )

    async def failed_checkout(*_args):
        raise asaas.AsaasApiError

    monkeypatch.setattr(clinic, "create_asaas_checkout", failed_checkout)

    with pytest.raises(HTTPException) as error:
        await clinic.subscription_checkout(
            SelectPlanIn(plan_id="pro"),
            {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
        )

    assert error.value.status_code == 502
    assert "asaas_checkout_lock_id" not in tenants.documents[0]
    assert "asaas_checkout_lock_until" not in tenants.documents[0]


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
