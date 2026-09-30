import pytest
from fastapi import HTTPException

import lib.auth as auth
from models.schemas import AccountUpdateIn
import routers.auth as auth_router


class MemoryUsers:
    def __init__(self, user):
        self.user = dict(user)

    async def find_one(self, query):
        if query.get("id", {}).get("$ne") == self.user["id"]:
            return None
        if query.get("email") == self.user["email"]:
            return dict(self.user)
        return None

    async def find_one_and_update(self, query, update, **kwargs):
        if query.get("id") != self.user["id"]:
            return None
        self.user.update(update["$set"])
        return dict(self.user)


class MemoryDatabase:
    def __init__(self, user):
        self.users = MemoryUsers(user)


@pytest.fixture

def super_admin(monkeypatch):
    user = {
        "id": "super-admin-test",
        "tenant_id": None,
        "name": "Super Admin",
        "email": "temporary@example.com",
        "password_hash": auth.hash_password("temporary-password"),
        "role": "super_admin",
        "active": True,
    }
    database = MemoryDatabase(user)
    monkeypatch.setattr(auth_router, "db", database)
    return user, database


async def test_first_access_requires_password_change(super_admin):
    user, _database = super_admin

    assert auth.public_user(user)["must_change_password"] is True
    with pytest.raises(HTTPException) as error:
        await auth.require_super_admin(user)
    assert error.value.status_code == 403


async def test_first_access_changes_email_and_password(super_admin):
    user, database = super_admin
    payload = AccountUpdateIn(
        email="owner@example.com",
        current_password="temporary-password",
        new_password="A-longer-secure-password-93",
    )

    result = await auth_router.update_account(payload, user)

    assert result["user"]["email"] == "owner@example.com"
    assert result["user"]["must_change_password"] is False
    assert auth.verify_password(payload.new_password, database.users.user["password_hash"])
    assert database.users.user["password_hash"] != payload.new_password


async def test_first_access_rejects_wrong_current_password(super_admin):
    user, database = super_admin
    payload = AccountUpdateIn(
        email="owner@example.com",
        current_password="wrong-temporary-password",
        new_password="A-longer-secure-password-93",
    )

    with pytest.raises(HTTPException) as error:
        await auth_router.update_account(payload, user)

    assert error.value.status_code == 401
    assert database.users.user["email"] == "temporary@example.com"
