from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import Organization, User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("")
async def create_organization(data: dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create a new organization."""
    org = Organization(
        name=data["name"],
        description=data.get("description", ""),
        owner_id=current_user.id,
        member_ids=[current_user.id],
    )
    doc = org.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.organizations.insert_one(doc)

    # Update user's org
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"organization_id": org.id, "role": "admin"}},
    )

    # Award team player badge
    if "team_player" not in current_user.badges:
        from services.gamification import award_xp

        await db.users.update_one({"id": current_user.id}, {"$addToSet": {"badges": "team_player"}})
        await award_xp(current_user.id, 50)

    return {"id": org.id, "invite_code": org.invite_code, "message": "Organization created"}


@router.get("/mine")
async def get_my_organization(current_user: User = Depends(get_current_user)):
    """Get current user's organization."""
    if not current_user.organization_id:
        return None

    org = await db.organizations.find_one({"id": current_user.organization_id}, {"_id": 0})
    if not org:
        return None

    # Get member details
    members = await db.users.find(
        {"id": {"$in": org.get("member_ids", [])}},
        {"_id": 0, "password_hash": 0},
    ).to_list(100)

    org["members"] = [
        {
            "id": m["id"],
            "username": m.get("username"),
            "display_name": m.get("display_name"),
            "role": m.get("role", "user"),
            "level": m.get("level", 1),
            "xp": m.get("xp", 0),
        }
        for m in members
    ]

    return org


@router.post("/join")
async def join_organization(data: dict[str, Any], current_user: User = Depends(get_current_user)):
    """Join an organization via invite code."""
    invite_code = data.get("invite_code", "")
    org = await db.organizations.find_one({"invite_code": invite_code}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    if current_user.id in org.get("member_ids", []):
        raise HTTPException(status_code=400, detail="Already a member")

    await db.organizations.update_one(
        {"id": org["id"]},
        {"$addToSet": {"member_ids": current_user.id}},
    )
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"organization_id": org["id"]}},
    )

    # Award badge
    if "team_player" not in current_user.badges:
        from services.gamification import award_xp

        await db.users.update_one({"id": current_user.id}, {"$addToSet": {"badges": "team_player"}})
        await award_xp(current_user.id, 50)

    return {"message": f"Joined {org['name']}", "organization_id": org["id"]}


@router.delete("/leave")
async def leave_organization(current_user: User = Depends(get_current_user)):
    """Leave current organization."""
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Not in an organization")

    org = await db.organizations.find_one({"id": current_user.organization_id}, {"_id": 0})
    if org and org.get("owner_id") == current_user.id:
        raise HTTPException(status_code=400, detail="Owner cannot leave. Transfer ownership first.")

    await db.organizations.update_one(
        {"id": current_user.organization_id},
        {"$pull": {"member_ids": current_user.id}},
    )
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"organization_id": None}},
    )

    return {"message": "Left organization"}
