from typing import Any

from fastapi import APIRouter, Depends

from models.schemas import Settings, User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=Settings)
async def get_settings(current_user: User = Depends(get_current_user)):
    settings = await db.settings.find_one({"id": "settings"}, {"_id": 0})
    if not settings:
        settings = Settings().model_dump()
        await db.settings.insert_one(settings)
    return settings


@router.put("")
async def update_settings(updates: dict[str, Any], current_user: User = Depends(get_current_user)):
    await db.settings.update_one(
        {"id": "settings"},
        {"$set": updates},
        upsert=True,
    )
    return {"message": "Settings updated"}
