from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import bcrypt
import pytest
from fastapi import HTTPException, Response
from pydantic import ValidationError

import lib.auth as auth
import routers.auth as auth_router
import routers.clinic as clinic_router
from models.schemas import ForgotPasswordIn, RegisterIn, ResetPasswordIn, SelectPlanIn


class MemoryCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, length):
        return self.documents[:length]


class MemoryCollection:
    def __init__(self, documents=None):
        self.documents = [dict(document) for document in (documents or [])]

    @staticmethod
    def matches(document, query):
        for key, expected in query.items():
            value = document.get(key)
            if isinstance(expected, dict):
                if "$gt" in expected and not value > expected["$gt"]:
                    return False
                if "$ne" in expected and value == expected["$ne"]:
                    return False
            elif value != expected:
                return False
        return True

    async def find_one(self, query, _projection=None):
        return next((dict(doc) for doc in self.documents if self.matches(doc, query)), None)

    def find(self, query, _projection=None):
        return MemoryCursor([doc for doc in self.documents if self.matches(doc, query)])

    async def insert_one(self, document):
        self.documents.append(dict(document))

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if self.matches(document, query):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, query):
        before = len(self.documents)
        self.documents[:] = [doc for doc in self.documents if not self.matches(doc, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def find_one_and_delete(self, query, projection=None):
        result = await self.find_one(query, projection)
        if result:
            await self.delete_one(query)
        return result

    async def update_one(self, query, update):
        document = next((doc for doc in self.documents if self.matches(doc, query)), None)
        if not document:
            return SimpleNamespace(matched_count=0)
        document.update(update["$set"])
        return SimpleNamespace(matched_count=1)


class MemoryDatabase:
    def __init__(self, **collections):
        for name, collection in collections.items():
            setattr(self, name, collection)


async def test_registration_creates_bcrypt_admin_and_seven_day_trial(monkeypatch):
    database = MemoryDatabase(
        users=MemoryCollection(),
        tenants=MemoryCollection(),
        plans=MemoryCollection([{"id": "basic", "name": "Básico", "price": 149, "active": True}]),
    )
    monkeypatch.setattr(auth_router, "db", database)

    async def create_session(*_args):
        return "session"

    monkeypatch.setattr(auth_router, "create_session", create_session)
    payload = RegisterIn(
        clinic_name="Clínica Teste",
        name="Ana Teste",
        email="ana@example.com",
        password="senha-forte-de-teste-2026",
    )

    result = await auth_router.register(payload, Response())

    user = database.users.documents[0]
    tenant = database.tenants.documents[0]
    assert result["user"]["role"] == "clinic_admin"
    assert user["role"] == "clinic_admin"
    assert bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode())
    assert tenant["subscription_status"] == "trialing"
    assert tenant["trial_ends_at"] - tenant["created_at"] == timedelta(days=7)


async def test_password_reset_token_is_single_use_and_invalidates_sessions(monkeypatch):
    token = "single-use-reset-token-value-with-enough-length"
    password_resets = MemoryCollection([{
        "user_id": "user-1",
        "token_hash": auth_router._reset_token_hash(token),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=20),
    }])
    users = MemoryCollection([{
        "id": "user-1",
        "active": True,
        "password_hash": auth.hash_password("old-password-value"),
    }])
    sessions = MemoryCollection([{"id": "session-1", "subject_id": "user-1", "kind": "staff"}])
    monkeypatch.setattr(auth_router, "db", MemoryDatabase(password_resets=password_resets, users=users, sessions=sessions))

    result = await auth_router.reset_password(
        ResetPasswordIn(token=token, new_password="new-secure-password-2026"),
    )

    assert result == {"ok": True}
    assert bcrypt.checkpw("new-secure-password-2026".encode(), users.documents[0]["password_hash"].encode())
    assert sessions.documents == []
    with pytest.raises(HTTPException) as error:
        await auth_router.reset_password(
            ResetPasswordIn(token=token, new_password="another-secure-password-2026"),
        )
    assert error.value.status_code == 400


async def test_forgot_password_returns_same_message_for_unknown_email(monkeypatch):
    database = MemoryDatabase(users=MemoryCollection(), password_resets=MemoryCollection())
    monkeypatch.setattr(auth_router, "db", database)
    monkeypatch.setattr(auth_router, "email_is_configured", lambda: True)

    async def send_email(*_args):
        raise AssertionError("No email should be sent for an unknown address")

    monkeypatch.setattr(auth_router, "send_password_reset_email", send_email)
    response = await auth_router.forgot_password(ForgotPasswordIn(email="missing@example.com"))

    assert response["message"] == "Se o e-mail estiver cadastrado, enviaremos instruções para redefinir a senha."
    assert database.password_resets.documents == []


async def test_expired_trial_blocks_clinic_routes(monkeypatch):
    database = MemoryDatabase(tenants=MemoryCollection([{
        "id": "tenant-1",
        "subscription_status": "trialing",
        "trial_ends_at": datetime.now(timezone.utc) - timedelta(seconds=1),
    }]))
    monkeypatch.setattr(auth, "db", database)
    user = {"id": "user-1", "tenant_id": "tenant-1", "role": "clinic_admin"}

    with pytest.raises(HTTPException) as error:
        await auth.require_tenant_user(user)

    assert error.value.status_code == 402


async def test_expired_trial_can_select_plan_without_claiming_payment(monkeypatch):
    tenants = MemoryCollection([{
        "id": "tenant-1",
        "subscription_status": "trialing",
        "trial_ends_at": datetime.now(timezone.utc) - timedelta(seconds=1),
    }])
    plans = MemoryCollection([{"id": "pro", "name": "Pro", "price": 349, "active": True}])
    monkeypatch.setattr(clinic_router, "db", MemoryDatabase(tenants=tenants, plans=plans))

    result = await clinic_router.select_subscription_plan(
        SelectPlanIn(plan_id="pro"),
        {"id": "user-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert result["subscription_status"] == "pending_payment"
    assert tenants.documents[0]["plan_id"] == "pro"
    assert tenants.documents[0]["subscription_status"] == "pending_payment"


def test_bcrypt_passwords_are_limited_by_utf8_bytes():
    with pytest.raises(ValidationError):
        RegisterIn(
            clinic_name="Clínica Teste",
            name="Ana Teste",
            email="ana@example.com",
            password="á" * 37,
        )
    with pytest.raises(ValidationError):
        ResetPasswordIn(token="single-use-reset-token-value-with-enough-length", new_password="á" * 37)
