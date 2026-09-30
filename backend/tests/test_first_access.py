import bcrypt
import pytest
from fastapi import HTTPException

import lib.auth as auth
from create_admin import ADMIN_EMAIL, ensure_admin
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


def test_verify_bcrypt_password():
    password = "temporary-bcrypt-password"
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    assert auth.verify_password(password, password_hash)


class MemoryAdminUsers:
    def __init__(self):
        self.documents = []
        self.indexes = []

    def find_one(self, query, projection=None):
        return next((doc for doc in self.documents if doc["email"] == query["email"]), None)

    def create_index(self, keys, **kwargs):
        self.indexes.append((keys, kwargs))

    def insert_one(self, document):
        self.documents.append(dict(document))


def test_admin_creation_is_bcrypt_hashed_and_idempotent():
    users = MemoryAdminUsers()
    password = "a-unique-admin-password"

    assert ensure_admin(users, password) is True
    assert ensure_admin(users, password) is False
    assert len(users.documents) == 1

    admin = users.documents[0]
    assert admin["email"] == ADMIN_EMAIL
    assert admin["role"] == "super_admin"
    assert bcrypt.checkpw(password.encode(), admin["password_hash"].encode())
