import uuid as uuid_lib
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import Campaign, CampaignProgress, User
from services.auth import get_current_user
from services.database import db
from services.gamification import award_xp

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("")
async def get_campaigns(current_user: User = Depends(get_current_user)):
    """List all published campaigns."""
    campaigns = await db.campaigns.find({"is_published": True}, {"_id": 0}).to_list(100)
    return campaigns


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, current_user: User = Depends(get_current_user)):
    """Get campaign details with user progress. Resolves challenge/quiz titles to IDs."""
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Resolve challenge_title → challenge_id for stages that lack a direct ID
    stages = campaign.get("stages", [])
    for stage in stages:
        if not stage.get("challenge_id") and stage.get("challenge_title"):
            ch = await db.challenges.find_one(
                {"title": {"$regex": f"^{stage['challenge_title']}$", "$options": "i"}},
                {"_id": 0, "id": 1, "title": 1},
            )
            if ch:
                stage["challenge_id"] = ch["id"]
                stage["challenge_title"] = ch["title"]
        if not stage.get("quiz_id") and stage.get("quiz_title"):
            qz = await db.quizzes.find_one(
                {"title": {"$regex": f"^{stage['quiz_title']}$", "$options": "i"}},
                {"_id": 0, "id": 1, "title": 1},
            )
            if qz:
                stage["quiz_id"] = qz["id"]
                stage["quiz_title"] = qz["title"]
    campaign["stages"] = stages

    progress = await db.campaign_progress.find_one(
        {"campaign_id": campaign_id, "user_id": current_user.id}, {"_id": 0}
    )

    return {"campaign": campaign, "progress": progress}


@router.post("")
async def create_campaign(data: dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create a new campaign (admin/instructor only)."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    campaign = Campaign(
        title=data["title"],
        description=data.get("description", ""),
        difficulty=data.get("difficulty", "medium"),
        stages=data.get("stages", []),
        cialdini_categories=data.get("cialdini_categories", []),
        estimated_time=data.get("estimated_time", 30),
        created_by=current_user.id,
        is_published=data.get("is_published", False),
    )
    doc = campaign.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.campaigns.insert_one(doc)
    return {"id": campaign.id, "message": "Campaign created"}


@router.post("/{campaign_id}/start")
async def start_campaign(campaign_id: str, current_user: User = Depends(get_current_user)):
    """Start a campaign."""
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Check if already in progress
    existing = await db.campaign_progress.find_one(
        {"campaign_id": campaign_id, "user_id": current_user.id, "status": "in_progress"}
    )
    if existing:
        return {"progress_id": existing["id"], "message": "Campaign already in progress"}

    progress = CampaignProgress(
        campaign_id=campaign_id,
        user_id=current_user.id,
    )
    doc = progress.model_dump()
    doc["started_at"] = doc["started_at"].isoformat()
    await db.campaign_progress.insert_one(doc)

    return {"progress_id": progress.id, "message": "Campaign started", "first_stage": 0}


@router.post("/{campaign_id}/stage/{stage_index}/start")
async def start_stage(
    campaign_id: str,
    stage_index: int,
    current_user: User = Depends(get_current_user),
):
    """
    Start a specific campaign stage.
    - If stage has challenge_id → creates a simulation and returns sim_id
    - If stage has quiz_id → returns quiz_id for frontend redirect
    - Otherwise → marks stage as started with no linked content
    """
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    progress = await db.campaign_progress.find_one(
        {"campaign_id": campaign_id, "user_id": current_user.id, "status": "in_progress"},
        {"_id": 0},
    )
    if not progress:
        raise HTTPException(status_code=400, detail="Start the campaign first")

    stages = campaign.get("stages", [])
    if stage_index >= len(stages):
        raise HTTPException(status_code=400, detail="Invalid stage index")

    current_stage_idx = progress.get("current_stage", 0)
    if stage_index != current_stage_idx:
        raise HTTPException(status_code=400, detail=f"Stage {stage_index} is not the active stage")

    stage = stages[stage_index]
    # Resolve title if needed
    if not stage.get("challenge_id") and stage.get("challenge_title"):
        ch = await db.challenges.find_one(
            {"title": {"$regex": f"^{stage['challenge_title']}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if ch:
            stage["challenge_id"] = ch["id"]

    challenge_id = stage.get("challenge_id")
    quiz_id = stage.get("quiz_id")

    if challenge_id:
        # Create a simulation for this stage
        sim_doc = {
            "id": str(uuid_lib.uuid4()),
            "user_id": current_user.id,
            "challenge_id": challenge_id,
            "title": f"[Kampanye] {campaign.get('title', '')} — Tahap {stage_index + 1}: {stage.get('title', '')}",
            "simulation_type": "simulation",
            "status": "running",
            "campaign_id": campaign_id,
            "stage_index": stage_index,
            "started_at": datetime.now(UTC).isoformat(),
            "score": 100,
            "events": [],
        }
        await db.simulations.insert_one(sim_doc)
        return {"type": "challenge", "simulation_id": sim_doc["id"], "challenge_id": challenge_id}

    if quiz_id:
        return {"type": "quiz", "quiz_id": quiz_id}

    # No linked content — mark as directly completable
    return {"type": "manual", "stage": stage}


@router.post("/{campaign_id}/stage/{stage_index}/complete")
async def complete_stage(
    campaign_id: str,
    stage_index: int,
    result: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Complete a campaign stage."""
    progress = await db.campaign_progress.find_one(
        {"campaign_id": campaign_id, "user_id": current_user.id, "status": "in_progress"},
        {"_id": 0},
    )
    if not progress:
        raise HTTPException(status_code=404, detail="No active campaign progress")

    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Add stage result
    stage_result = {
        "stage_index": stage_index,
        "score": result.get("score", 0),
        "completed_at": datetime.now(UTC).isoformat(),
        "events": result.get("events", []),
    }

    stage_results = progress.get("stage_results", [])
    stage_results.append(stage_result)

    # Check if campaign is complete
    total_stages = len(campaign.get("stages", []))
    next_stage = stage_index + 1
    is_complete = next_stage >= total_stages

    updates = {
        "stage_results": stage_results,
        "current_stage": next_stage,
    }

    if is_complete:
        updates["status"] = "completed"
        updates["completed_at"] = datetime.now(UTC).isoformat()
        # Calculate overall score
        all_scores = [r.get("score", 0) for r in stage_results]
        updates["overall_score"] = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0

        # Award XP for campaign completion
        xp_earned = 100 + (updates["overall_score"] // 10) * 10
        await award_xp(current_user.id, int(xp_earned))
    else:
        # Award XP per stage
        await award_xp(current_user.id, 25)

    await db.campaign_progress.update_one(
        {"id": progress["id"]},
        {"$set": updates},
    )

    return {
        "message": "Stage completed" if not is_complete else "Campaign completed!",
        "next_stage": next_stage if not is_complete else None,
        "is_complete": is_complete,
        "overall_score": updates.get("overall_score"),
    }
