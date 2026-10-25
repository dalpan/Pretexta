import logging
import os
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.schemas import User
from services.database import db

logger = logging.getLogger(__name__)

# Secrets that ship in this public repo and must never sign real tokens
_PUBLIC_DEFAULT_SECRETS = {"", "change-this-secret-key-in-production"}


def _resolve_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "")
    if secret in _PUBLIC_DEFAULT_SECRETS:
        logger.warning(
            "JWT_SECRET is unset or uses the public default. Using a random per-process "
            "secret: sessions will not survive a restart. Set JWT_SECRET in .env."
        )
        return secrets.token_hex(32)
    return secret


JWT_SECRET = _resolve_jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(user_id: str) -> str:
    expiration = datetime.now(UTC) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {"user_id": user_id, "exp": expiration}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")

        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")

        return User(**user_doc)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles: str):
    """Dependency factory: allow only users whose role is in `roles`."""

    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return checker


require_admin = require_role("admin")
require_trainer = require_role("admin", "trainer")


def is_staff(user: User) -> bool:
    return user.role in ("admin", "trainer")
