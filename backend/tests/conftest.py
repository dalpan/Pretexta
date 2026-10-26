import os
import sys
from pathlib import Path

import pytest_asyncio

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27099")
os.environ.setdefault("DB_NAME", "pretexta_test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from models.schemas import User  # noqa: E402
from server import app  # noqa: E402
from services.auth import create_token, hash_password  # noqa: E402
from services.database import client as mongo_client  # noqa: E402
from services.database import db  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    await mongo_client.drop_database(os.environ["DB_NAME"])
    try:
        from middleware.rate_limit import reset_rate_limits
    except ImportError:
        pass
    else:
        reset_rate_limits()
    yield


@pytest_asyncio.fixture
async def api():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def make_user(role: str = "user", organization_id: str | None = None, username=None):
    user = User(
        username=username or f"{role}-{os.urandom(4).hex()}",
        password_hash=hash_password("Password123"),
        role=role,
        organization_id=organization_id,
    )
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.users.insert_one(doc)
    return user, {"Authorization": f"Bearer {create_token(user.id)}"}
