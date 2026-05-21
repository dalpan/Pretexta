import logging
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User, WebhookConfig
from services.auth import get_current_user
from services.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("")
async def get_webhooks(current_user: User = Depends(get_current_user)):
    """List configured webhooks."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = {}
    if current_user.organization_id:
        query["organization_id"] = current_user.organization_id

    webhooks = await db.webhooks.find(query, {"_id": 0}).to_list(50)
    # Mask secrets
    for wh in webhooks:
        if wh.get("secret"):
            wh["secret"] = "***"
    return webhooks


@router.post("")
async def create_webhook(data: dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create a webhook configuration."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    url = data.get("url", "")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Webhook URL must be http(s) with a host")

    webhook = WebhookConfig(
        name=data["name"],
        url=url,
        events=data.get("events", ["simulation_complete"]),
        secret=data.get("secret"),
        organization_id=current_user.organization_id,
    )
    doc = webhook.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.webhooks.insert_one(doc)
    return {"id": webhook.id, "message": "Webhook created"}


@router.delete("/{webhook_id}")
async def delete_webhook(webhook_id: str, current_user: User = Depends(get_current_user)):
    """Delete a webhook."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    result = await db.webhooks.delete_one({"id": webhook_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"message": "Webhook deleted"}


async def fire_webhooks(event: str, payload: dict[str, Any], organization_id: str = None):
    """Fire all matching webhooks for an event."""
    query = {"enabled": True, "events": event}
    if organization_id:
        query["organization_id"] = organization_id

    webhooks = await db.webhooks.find(query, {"_id": 0}).to_list(50)

    for wh in webhooks:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                headers = {"Content-Type": "application/json"}
                if wh.get("secret"):
                    headers["X-Webhook-Secret"] = wh["secret"]

                await client.post(
                    wh["url"],
                    json={"event": event, "data": payload},
                    headers=headers,
                )
                logger.info(f"Webhook fired: {wh['name']} -> {event}")
        except Exception as e:
            logger.error(f"Webhook failed: {wh['name']} -> {e}")
