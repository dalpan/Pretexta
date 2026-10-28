"""
Recurring live campaigns (LIVE OPS). A schedule materialises a fresh campaign on
a cadence so an organization can run a baseline and periodic retests without
re-building the campaign each time.

Guardrail note (G2): a scheduled run is created in `pending_approval`, never sent
automatically. A second admin still has to approve and launch each instance, so
two-person approval and the kill switch continue to apply. The schedule only
automates the drafting cadence, not the send ("supervised auto-send" stays a
separate, deferred step).
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from models.schemas import CampaignTemplate, LiveCampaign
from services.database import db
from services.live.preflight import run_preflight

logger = logging.getLogger(__name__)

SCHEDULER_INTERVAL_SECONDS = 300  # how often the loop checks for due schedules


async def materialize(schedule: dict, now: datetime | None = None) -> str | None:
    """Create one campaign instance from a schedule's template (pending_approval)."""
    now = now or datetime.now(UTC)
    try:
        template = CampaignTemplate(**schedule["template"])
    except Exception as exc:  # a bad template must not wedge the whole loop
        logger.warning(f"Schedule {schedule['id']} has an invalid template: {exc}")
        return None

    window = int(schedule.get("window_days", 5))
    campaign = LiveCampaign(
        **template.model_dump(),
        starts_at=now,
        ends_at=now + timedelta(days=window),
        organization_id=schedule.get("organization_id"),
        created_by=schedule["created_by"],
        status="pending_approval",
    )
    doc = campaign.model_dump()
    doc["preflight"] = await run_preflight(doc)
    doc["scheduled_from"] = schedule["id"]
    await db.live_campaigns.insert_one(dict(doc))
    logger.info(f"Schedule {schedule['id']} created campaign {campaign.id}")
    return campaign.id


async def run_due(now: datetime | None = None) -> list[str]:
    """Materialise every active schedule whose next_run has passed, and advance it."""
    now = now or datetime.now(UTC)
    created: list[str] = []
    cursor = db.campaign_schedules.find(
        {"active": True, "next_run": {"$lte": now.isoformat()}}, {"_id": 0}
    )
    async for schedule in cursor:
        cid = await materialize(schedule, now)
        updates = {
            "next_run": (now + timedelta(days=int(schedule["interval_days"]))).isoformat(),
            "last_run_at": now.isoformat(),
        }
        if cid:
            updates["last_campaign_id"] = cid
            created.append(cid)
        await db.campaign_schedules.update_one({"id": schedule["id"]}, {"$set": updates})
    return created


async def run_scheduler(interval_seconds: int = SCHEDULER_INTERVAL_SECONDS) -> None:
    """Background loop. Always running; a no-op until a schedule is due."""
    while True:
        try:
            await run_due()
        except Exception as exc:  # never let the loop die
            logger.warning(f"scheduler tick failed: {exc}")
        await asyncio.sleep(interval_seconds)
