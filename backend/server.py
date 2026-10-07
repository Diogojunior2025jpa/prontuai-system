import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from lib.db import client, ensure_indexes  # noqa: E402
from routers.ai import router as ai_router  # noqa: E402
from routers.availability import router as availability_router  # noqa: E402
from routers.assistant import router as assistant_router  # noqa: E402
from routers.auth import router as auth_router  # noqa: E402
from routers.clinic import router as clinic_router  # noqa: E402
from routers.portal import router as portal_router  # noqa: E402
from routers.superadmin import router as admin_router  # noqa: E402
from routers.webhooks import router as webhooks_router  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    yield
    client.close()


app = FastAPI(title="ProntuAI", lifespan=lifespan)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "ProntuAI API", "status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(clinic_router)
api_router.include_router(availability_router)
api_router.include_router(ai_router)
api_router.include_router(assistant_router)
api_router.include_router(portal_router)
api_router.include_router(webhooks_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Include the router in the main app — must stay last.
app.include_router(api_router)
