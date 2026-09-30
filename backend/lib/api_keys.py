"""Encrypted API-key storage for the platform's external AI providers."""

import os
import fcntl
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from lib.db import db

PROVIDER_ENV = {"groq": "GROQ_API_KEY", "gemini": "GEMINI_API_KEY"}
ENCRYPTION_KEY_FILE = Path(__file__).resolve().parents[1] / ".api_key_encryption.key"


def _cipher() -> Fernet:
    key = os.environ.get("APP_SECRET_ENCRYPTION_KEY", "").strip()
    if not key:
        lock_path = ENCRYPTION_KEY_FILE.with_suffix(".lock")
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            if ENCRYPTION_KEY_FILE.exists():
                key = ENCRYPTION_KEY_FILE.read_text(encoding="ascii").strip()
            else:
                key = Fernet.generate_key().decode("ascii")
                key_fd = os.open(ENCRYPTION_KEY_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(key_fd, "w", encoding="ascii") as key_file:
                    key_file.write(key)
                    key_file.flush()
                    os.fsync(key_file.fileno())
        except OSError as exc:
            raise HTTPException(status_code=503, detail="Cofre de chaves indisponível") from exc
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            os.close(lock_fd)
    try:
        return Fernet(key.encode())
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="APP_SECRET_ENCRYPTION_KEY inválida") from exc


def encryption_key_ready() -> bool:
    try:
        _cipher()
    except HTTPException:
        return False
    return True


async def provider_key_status() -> dict:
    providers = {}
    for provider, env_name in PROVIDER_ENV.items():
        stored = await db.api_keys.find_one({"provider": provider}, {"_id": 0, "updated_at": 1})
        environment_configured = bool(os.environ.get(env_name, "").strip())
        providers[provider] = {
            "configured": bool(stored) or environment_configured,
            "source": "vault" if stored else "environment" if environment_configured else "missing",
        }
    return {"encryption_ready": encryption_key_ready(), "providers": providers}


async def get_provider_key(provider: str) -> str:
    if provider not in PROVIDER_ENV:
        raise HTTPException(status_code=400, detail="Provedor de IA não suportado")
    stored = await db.api_keys.find_one({"provider": provider}, {"_id": 0, "encrypted_value": 1})
    if stored:
        try:
            return _cipher().decrypt(stored["encrypted_value"].encode()).decode()
        except InvalidToken as exc:
            raise HTTPException(status_code=503, detail="Não foi possível descriptografar a chave salva") from exc
    return os.environ.get(PROVIDER_ENV[provider], "").strip()


async def save_provider_key(provider: str, api_key: str) -> dict:
    if provider not in PROVIDER_ENV:
        raise HTTPException(status_code=404, detail="Provedor de IA não suportado")
    value = api_key.strip()
    if len(value) < 8 or len(value) > 512:
        raise HTTPException(status_code=422, detail="A chave deve conter entre 8 e 512 caracteres")
    cipher = _cipher()
    await db.api_keys.update_one(
        {"provider": provider},
        {
            "$set": {
                "provider": provider,
                "encrypted_value": cipher.encrypt(value.encode()).decode(),
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    return await provider_key_status()