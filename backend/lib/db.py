"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "plans": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "tenants": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("tenant_id", ASCENDING), ("name", ASCENDING)], name="tenant_name"),
    ],
    "sessions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", ASCENDING)], name="ttl", expireAfterSeconds=60 * 60 * 24 * 14),
    ],
    "patients": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("tenant_id", ASCENDING), ("name", ASCENDING)], name="tenant_name"),
        IndexModel([("tenant_id", ASCENDING), ("cpf", ASCENDING)], name="tenant_cpf"),
        IndexModel([("cpf", ASCENDING)], name="cpf"),
    ],
    "appointments": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("tenant_id", ASCENDING), ("date", ASCENDING)], name="tenant_date"),
        IndexModel([("patient_id", ASCENDING), ("date", DESCENDING)], name="patient_date"),
    ],
    "records": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("tenant_id", ASCENDING), ("patient_id", ASCENDING), ("created_at", DESCENDING)], name="tenant_patient_created"),
    ],
    "campaigns": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("tenant_id", ASCENDING), ("created_at", DESCENDING)], name="tenant_created"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
