"""
Live campaigns API (P1: guardrail foundation).

Lifecycle: draft → pending_approval → approved → running → closed, with
`killed` reachable from any non-final state. See docs/design/live-campaigns.md.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from models.schemas import LiveCampaign, LiveCampaignCreate, User, VerifiedDomain
from services import audit
from services.auth import require_admin, require_trainer
from services.database import db
from services.live import domains as domain_svc
from services.live.domains import email_domain
from services.live.preflight import has_errors, run_preflight

router = APIRouter(prefix="/live", tags=["live-campaigns"])
audit_router = APIRouter(prefix="/audit", tags=["audit"])

ACTIVE_STATUSES = ("pending_approval", "approved", "running")


def _scope(user: User) -> dict:
    """Admins see every organization; trainers only their own."""
    return {} if user.role == "admin" else {"organization_id": user.organization_id}


def _normalize_recipients(addresses: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for address in addresses:
        seen.setdefault(address.strip().lower(), None)
    return list(seen)


async def _get_campaign(campaign_id: str, user: User) -> dict:
    doc = await db.live_campaigns.find_one({"id": campaign_id, **_scope(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return doc


async def _transition(campaign: dict, expected: tuple[str, ...], updates: dict) -> None:
    """Change status only if nobody else changed it first."""
    result = await db.live_campaigns.update_one(
        {"id": campaign["id"], "status": {"$in": list(expected)}}, {"$set": updates}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Campaign status changed, reload and retry")


# ==================== DOMAINS (G1) ====================


class DomainCreate(BaseModel):
    domain: str = Field(min_length=3, max_length=253)


@router.get("/domains")
async def list_domains(current_user: User = Depends(require_trainer)):
    return await db.verified_domains.find(_scope(current_user), {"_id": 0}).to_list(200)


@router.post("/domains")
async def add_domain(data: DomainCreate, current_user: User = Depends(require_trainer)):
    domain = domain_svc.normalize_domain(data.domain)
    if not domain:
        raise HTTPException(status_code=400, detail="Not a valid domain name")
    if await db.verified_domains.find_one(
        {"domain": domain, "organization_id": current_user.organization_id}
    ):
        raise HTTPException(status_code=409, detail="Domain already added")

    doc = VerifiedDomain(
        organization_id=current_user.organization_id,
        domain=domain,
        token=domain_svc.new_token(),
        sandbox=domain_svc.is_sandbox(domain),
        created_by=current_user.id,
    ).model_dump()
    await db.verified_domains.insert_one(dict(doc))
    if doc["sandbox"]:
        await domain_svc.check(doc)
    await audit.record(current_user.id, "live.domain.add", domain, {"sandbox": doc["sandbox"]})

    doc = await db.verified_domains.find_one({"id": doc["id"]}, {"_id": 0})
    return {
        **doc,
        "instructions": None
        if doc["sandbox"]
        else f'Publish a TXT record on {domain}: "{domain_svc.TXT_PREFIX}{doc["token"]}"',
    }


@router.post("/domains/{domain_id}/verify")
async def verify_domain(domain_id: str, current_user: User = Depends(require_trainer)):
    doc = await db.verified_domains.find_one({"id": domain_id, **_scope(current_user)}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Domain not found")
    ok = await domain_svc.check(doc)
    await audit.record(current_user.id, "live.domain.verify", doc["domain"], {"verified": ok})
    return {"domain": doc["domain"], "verified": ok}


@router.delete("/domains/{domain_id}")
async def delete_domain(domain_id: str, current_user: User = Depends(require_admin)):
    doc = await db.verified_domains.find_one_and_delete({"id": domain_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Domain not found")
    await audit.record(current_user.id, "live.domain.delete", doc["domain"])
    return {"message": "Domain removed"}


# ==================== EXCLUSIONS (G11) ====================


class ExclusionCreate(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=5000)
    reason: str = Field(default="", max_length=200)


@router.get("/exclusions")
async def list_exclusions(current_user: User = Depends(require_trainer)):
    return await db.live_exclusions.find(_scope(current_user), {"_id": 0}).to_list(10000)


@router.post("/exclusions")
async def add_exclusions(data: ExclusionCreate, current_user: User = Depends(require_trainer)):
    added = 0
    for email in _normalize_recipients(data.emails):
        if not email_domain(email):
            continue
        result = await db.live_exclusions.update_one(
            {"organization_id": current_user.organization_id, "email": email},
            {"$setOnInsert": {"reason": data.reason, "added_by": current_user.id}},
            upsert=True,
        )
        added += 1 if result.upserted_id else 0
    await audit.record(current_user.id, "live.exclusion.add", None, {"count": added})
    return {"added": added}


@router.delete("/exclusions/{email}")
async def remove_exclusion(email: str, current_user: User = Depends(require_trainer)):
    result = await db.live_exclusions.delete_one(
        {"organization_id": current_user.organization_id, "email": email.lower()}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not on the exclusion list")
    await audit.record(current_user.id, "live.exclusion.remove", email.lower())
    return {"message": "Exclusion removed"}


# ==================== CAMPAIGNS ====================


def _public(doc: dict) -> dict:
    return {**doc, "recipient_count": len(doc.get("recipients", []))}


@router.get("/campaigns")
async def list_campaigns(current_user: User = Depends(require_trainer)):
    # List view omits the heavy fields (body, full recipient list) and keeps a count.
    pipeline = [
        {"$match": _scope(current_user)},
        {"$sort": {"created_at": -1}},
        {"$limit": 200},
        {"$addFields": {"recipient_count": {"$size": {"$ifNull": ["$recipients", []]}}}},
        {"$project": {"_id": 0, "body_html": 0, "recipients": 0}},
    ]
    return await db.live_campaigns.aggregate(pipeline).to_list(200)


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, current_user: User = Depends(require_trainer)):
    return _public(await _get_campaign(campaign_id, current_user))


@router.post("/campaigns")
async def create_campaign(data: LiveCampaignCreate, current_user: User = Depends(require_trainer)):
    campaign = LiveCampaign(
        **{**data.model_dump(), "recipients": _normalize_recipients(data.recipients)},
        organization_id=current_user.organization_id,
        created_by=current_user.id,
    )
    doc = campaign.model_dump()
    doc["preflight"] = await run_preflight(doc)
    await db.live_campaigns.insert_one(dict(doc))
    await audit.record(current_user.id, "live.campaign.create", campaign.id, {"name": data.name})
    return _public(doc)


@router.put("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: str, data: LiveCampaignCreate, current_user: User = Depends(require_trainer)
):
    campaign = await _get_campaign(campaign_id, current_user)
    if campaign["status"] != "draft":
        raise HTTPException(status_code=409, detail="Only drafts can be edited")
    if campaign["created_by"] != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can edit a draft")

    updates = {**data.model_dump(), "recipients": _normalize_recipients(data.recipients)}
    updates["preflight"] = await run_preflight({**campaign, **updates})
    await _transition(campaign, ("draft",), updates)
    await audit.record(current_user.id, "live.campaign.update", campaign_id)
    return _public({**campaign, **updates})


@router.post("/campaigns/{campaign_id}/submit")
async def submit_campaign(campaign_id: str, current_user: User = Depends(require_trainer)):
    campaign = await _get_campaign(campaign_id, current_user)
    if campaign["status"] != "draft":
        raise HTTPException(status_code=409, detail="Only drafts can be submitted")

    findings = await run_preflight(campaign)
    if has_errors(findings):
        await db.live_campaigns.update_one({"id": campaign_id}, {"$set": {"preflight": findings}})
        raise HTTPException(status_code=422, detail={"preflight": findings})

    await _transition(campaign, ("draft",), {"status": "pending_approval", "preflight": findings})
    await audit.record(current_user.id, "live.campaign.submit", campaign_id)
    return {"status": "pending_approval", "preflight": findings}


@router.post("/campaigns/{campaign_id}/approve")
async def approve_campaign(campaign_id: str, current_user: User = Depends(require_admin)):
    campaign = await _get_campaign(campaign_id, current_user)
    if campaign["status"] != "pending_approval":
        raise HTTPException(status_code=409, detail="Campaign is not awaiting approval")
    if campaign["created_by"] == current_user.id:
        raise HTTPException(status_code=403, detail="A campaign must be approved by someone else")
    if await _global_kill_engaged():
        raise HTTPException(status_code=423, detail="Global kill switch is engaged")

    findings = await run_preflight(campaign)
    if has_errors(findings):
        raise HTTPException(status_code=422, detail={"preflight": findings})

    await _transition(
        campaign,
        ("pending_approval",),
        {"status": "approved", "approved_by": current_user.id, "preflight": findings},
    )
    await audit.record(
        current_user.id,
        "live.campaign.approve",
        campaign_id,
        {"brand_override_reason": campaign.get("brand_override_reason")},
    )
    return {"status": "approved"}


class RejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/campaigns/{campaign_id}/reject")
async def reject_campaign(
    campaign_id: str, data: RejectRequest, current_user: User = Depends(require_admin)
):
    campaign = await _get_campaign(campaign_id, current_user)
    await _transition(campaign, ("pending_approval",), {"status": "draft"})
    await audit.record(
        current_user.id, "live.campaign.reject", campaign_id, {"reason": data.reason}
    )
    return {"status": "draft"}


@router.post("/campaigns/{campaign_id}/kill")
async def kill_campaign(campaign_id: str, current_user: User = Depends(require_trainer)):
    campaign = await _get_campaign(campaign_id, current_user)
    await _transition(campaign, ("draft", *ACTIVE_STATUSES), {"status": "killed", "killed": True})
    await audit.record(current_user.id, "live.campaign.kill", campaign_id)
    return {"status": "killed"}


# ==================== GLOBAL KILL SWITCH (G4) ====================


async def _global_kill_engaged() -> bool:
    settings = await db.settings.find_one({"id": "settings"}, {"_id": 0, "live_kill_switch": 1})
    return bool(settings and settings.get("live_kill_switch"))


class KillSwitchRequest(BaseModel):
    engaged: bool


@router.get("/kill-switch")
async def get_kill_switch(current_user: User = Depends(require_trainer)):
    return {"engaged": await _global_kill_engaged()}


@router.post("/kill-switch")
async def set_kill_switch(data: KillSwitchRequest, current_user: User = Depends(require_admin)):
    await db.settings.update_one(
        {"id": "settings"}, {"$set": {"live_kill_switch": data.engaged}}, upsert=True
    )
    killed = 0
    if data.engaged:
        result = await db.live_campaigns.update_many(
            {"status": {"$in": list(ACTIVE_STATUSES)}},
            {"$set": {"status": "killed", "killed": True}},
        )
        killed = result.modified_count
    await audit.record(
        current_user.id, "live.kill_switch", None, {"engaged": data.engaged, "killed": killed}
    )
    return {"engaged": data.engaged, "campaigns_killed": killed}


# ==================== AUDIT LOG (G12) ====================


@audit_router.get("")
async def list_audit(
    current_user: User = Depends(require_admin),
    limit: int = Query(default=100, ge=1, le=1000),
    before_seq: int | None = Query(default=None, ge=1),
) -> list[dict[str, Any]]:
    query = {"seq": {"$lt": before_seq}} if before_seq else {}
    return await db.audit_log.find(query, {"_id": 0}).sort("seq", -1).to_list(limit)


@audit_router.get("/verify")
async def verify_audit(current_user: User = Depends(require_admin)):
    return await audit.verify_chain()
