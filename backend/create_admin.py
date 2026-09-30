"""Create the initial Super Admin without replacing existing database data.

Run from the backend directory with MONGO_URI, DB_NAME, and ADMIN_PASSWORD set.
"""

import os
import sys
import uuid
from datetime import datetime, timezone

import bcrypt
from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

ADMIN_EMAIL = "junior2011pb@gmail.com"


def ensure_admin(users: Collection, password: str) -> bool:
    if users.find_one({"email": ADMIN_EMAIL}, {"_id": 1}):
        return False

    users.create_index([("email", ASCENDING)], unique=True, name="email")
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    admin = {
        "id": str(uuid.uuid4()),
        "tenant_id": None,
        "name": "Super Admin",
        "email": ADMIN_EMAIL,
        "password_hash": password_hash,
        "role": "super_admin",
        "permissions": [],
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        users.insert_one(admin)
    except DuplicateKeyError:
        return False
    return True


def main() -> int:
    mongo_uri = os.environ.get("MONGO_URI")
    database_name = os.environ.get("DB_NAME")
    password = os.environ.get("ADMIN_PASSWORD")

    if not mongo_uri or not database_name or not password:
        print("Defina MONGO_URI, DB_NAME e ADMIN_PASSWORD no ambiente.", file=sys.stderr)
        return 2

    password_bytes = password.encode()
    if len(password_bytes) < 12 or len(password_bytes) > 72:
        print("ADMIN_PASSWORD deve ter pelo menos 12 e no máximo 72 bytes.", file=sys.stderr)
        return 2

    client = MongoClient(
        mongo_uri,
        appname="prontuai-create-admin",
        serverSelectionTimeoutMS=10_000,
    )
    try:
        client.admin.command("ping")
        users = client[database_name]["users"]
        if ensure_admin(users, password):
            print(f"Administrador {ADMIN_EMAIL} criado.")
        else:
            print(f"Administrador {ADMIN_EMAIL} já existe; nenhuma alteração nos documentos foi feita.")
        return 0
    except Exception as error:
        print(
            f"Falha no bootstrap ({type(error).__name__}); URI e senha foram omitidas.",
            file=sys.stderr,
        )
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())