import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User, WebhookConfig
from services.auth import get_current_user
from services.database import db
from services.net_guard import is_public_http_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _scope(user: User) -> dict:
    """Admins manage every webhook; trainers only their organization's."""
    return {} if user.role == "admin" else {"organization_id": user.organization_id}


@router.get("")
async def get_webhooks(current_user: User = Depends(get_current_user)):
    """List configured webhooks."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    webhooks = await db.webhooks.find(_scope(current_user), {"_id": 0}).to_list(50)
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
    if not await is_public_http_url(url):
        raise HTTPException(
            status_code=400, detail="Webhook URL must be http(s) and resolve to a public address"
        )

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

    result = await db.webhooks.delete_one({"id": webhook_id, **_scope(current_user)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"message": "Webhook deleted"}


async def fire_webhooks(event: str, payload: dict[str, Any], organization_id: str | None = None):
    """Fire the webhooks of exactly one organization (or of users without one)."""
    query = {"enabled": True, "events": event, "organization_id": organization_id}

    webhooks = await db.webhooks.find(query, {"_id": 0}).to_list(50)

    for wh in webhooks:
        # Re-check at send time: DNS may have changed since the webhook was saved
        if not await is_public_http_url(wh["url"]):
            logger.warning(f"Webhook skipped, non-public target: {wh['name']}")
            continue
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                headers = {"Content-Type": "application/json"}
                if wh.get("secret"):
                    headers["X-Webhook-Secret"] = wh["secret"]

                await client.post(  # follow_redirects stays False (httpx default)
                    wh["url"],
                    json={"event": event, "data": payload},
                    headers=headers,
                )
                logger.info(f"Webhook fired: {wh['name']} -> {event}")
        except Exception as e:
            logger.error(f"Webhook failed: {wh['name']} -> {e}")
