import os

import pytest
from cryptography.fernet import Fernet
import lib.api_keys as api_keys


class MemoryCollection:
    def __init__(self):
        self.documents = {}

    async def find_one(self, query, projection=None):
        return self.documents.get(query["provider"])

    async def update_one(self, query, update, upsert=False):
        self.documents[query["provider"]] = dict(update["$set"])


class MemoryDatabase:
    def __init__(self):
        self.api_keys = MemoryCollection()


@pytest.fixture
def key_vault(monkeypatch, tmp_path):
    database = MemoryDatabase()
    monkeypatch.setattr(api_keys, "db", database)
    monkeypatch.setattr(api_keys, "ENCRYPTION_KEY_FILE", tmp_path / "vault.key")
    monkeypatch.setenv("APP_SECRET_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    return database


async def test_saved_key_is_encrypted_and_available_to_provider(key_vault):
    api_key = "unit-test-key-never-use"

    status = await api_keys.save_provider_key("groq", api_key)
    encrypted = key_vault.api_keys.documents["groq"]["encrypted_value"]

    assert status["providers"]["groq"] == {"configured": True, "source": "vault"}
    assert api_key not in encrypted
    assert await api_keys.get_provider_key("groq") == api_key


async def test_key_status_never_returns_secret_value(key_vault):
    api_key = "unit-test-key-never-return"
    await api_keys.save_provider_key("gemini", api_key)

    status = await api_keys.provider_key_status()

    assert api_key not in str(status)
    assert status["providers"]["gemini"]["configured"] is True


async def test_local_encryption_key_is_generated_with_restricted_permissions(monkeypatch, key_vault):
    monkeypatch.delenv("APP_SECRET_ENCRYPTION_KEY")

    status = await api_keys.save_provider_key("groq", "unit-test-key-never-use")

    key_file = api_keys.ENCRYPTION_KEY_FILE
    assert status["encryption_ready"] is True
    assert key_file.exists()
    assert key_file.stat().st_mode & 0o777 == 0o600
    assert await api_keys.get_provider_key("groq")
