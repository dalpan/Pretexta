from fastapi import APIRouter, Depends, Query

from models.schemas import User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, le=100),
    current_user: User = Depends(get_current_user),
):
    """Get user notifications."""
    query = {"user_id": current_user.id}
    if unread_only:
        query["read"] = False

    notifications = (
        await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    )

    unread_count = await db.notifications.count_documents(
        {"user_id": current_user.id, "read": False}
    )

    return {"notifications": notifications, "unread_count": unread_count}


@router.put("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: User = Depends(get_current_user)):
    """Mark a notification as read."""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user.id},
        {"$set": {"read": True}},
    )
    return {"message": "Marked as read"}


@router.put("/read-all")
async def mark_all_read(current_user: User = Depends(get_current_user)):
    """Mark all notifications as read."""
    await db.notifications.update_many(
        {"user_id": current_user.id, "read": False},
        {"$set": {"read": True}},
    )
    return {"message": "All notifications marked as read"}
