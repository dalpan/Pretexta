from fastapi import APIRouter, Depends

from models.schemas import Settings, SettingsUpdate, User
from services.auth import get_current_user, require_admin
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
async def update_settings(updates: SettingsUpdate, current_user: User = Depends(require_admin)):
    await db.settings.update_one(
        {"id": "settings"},
        {"$set": updates.model_dump(exclude_unset=True)},
        upsert=True,
    )
    return {"message": "Settings updated"}
