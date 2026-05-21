from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import Challenge, ScenarioTemplate, User
from services.auth import get_current_user
from services.database import db
from services.gamification import award_xp

router = APIRouter(prefix="/scenario-builder", tags=["scenario-builder"])


@router.get("/templates")
async def get_my_templates(current_user: User = Depends(get_current_user)):
    """Get user's scenario templates (drafts and published)."""
    templates = (
        await db.scenario_templates.find({"created_by": current_user.id}, {"_id": 0})
        .sort("updated_at", -1)
        .to_list(100)
    )
    return templates


@router.get("/templates/{template_id}")
async def get_template(template_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific template."""
    template = await db.scenario_templates.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/templates")
async def create_template(data: dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create a new scenario template (draft)."""
    template = ScenarioTemplate(
        title=data.get("title", "Untitled Scenario"),
        description=data.get("description", ""),
        difficulty=data.get("difficulty", "medium"),
        cialdini_categories=data.get("cialdini_categories", []),
        channel=data.get("channel", "email_inbox"),
        nodes=data.get("nodes", []),
        metadata=data.get("metadata", {}),
        content_en=data.get("content_en"),
        content_id=data.get("content_id"),
        created_by=current_user.id,
    )
    doc = template.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db.scenario_templates.insert_one(doc)
    return {"id": template.id, "message": "Template created"}


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str, data: dict[str, Any], current_user: User = Depends(get_current_user)
):
    """Update a scenario template."""
    existing = await db.scenario_templates.find_one(
        {"id": template_id, "created_by": current_user.id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    data["updated_at"] = datetime.now(UTC).isoformat()
    await db.scenario_templates.update_one({"id": template_id}, {"$set": data})
    return {"message": "Template updated"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current_user: User = Depends(get_current_user)):
    """Delete a scenario template."""
    result = await db.scenario_templates.delete_one(
        {"id": template_id, "created_by": current_user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


@router.post("/templates/{template_id}/publish")
async def publish_template(template_id: str, current_user: User = Depends(get_current_user)):
    """Publish a template as a playable challenge."""
    template = await db.scenario_templates.find_one(
        {"id": template_id, "created_by": current_user.id}, {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not template.get("nodes") or len(template["nodes"]) < 2:
        raise HTTPException(status_code=400, detail="Scenario must have at least 2 nodes")

    # Create a challenge from the template
    challenge = Challenge(
        title=template["title"],
        description=template["description"],
        difficulty=template["difficulty"],
        cialdini_categories=template.get("cialdini_categories", []),
        estimated_time=len(template.get("nodes", [])) * 2,
        nodes=template["nodes"],
        metadata={
            **template.get("metadata", {}),
            "author": current_user.username,
            "source": "scenario_builder",
            "template_id": template_id,
        },
        content_en=template.get("content_en"),
        content_id=template.get("content_id"),
    )
    doc = challenge.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.challenges.insert_one(doc)

    # Mark template as published
    await db.scenario_templates.update_one(
        {"id": template_id},
        {"$set": {"is_published": True, "is_draft": False}},
    )

    # Award badge
    if "scenario_creator" not in current_user.badges:
        await db.users.update_one(
            {"id": current_user.id}, {"$addToSet": {"badges": "scenario_creator"}}
        )
        await award_xp(current_user.id, 200)

    return {"challenge_id": challenge.id, "message": "Scenario published as challenge!"}
