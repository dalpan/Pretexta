from fastapi import APIRouter, Depends, Query

from models.schemas import User
from services.auth import get_current_user
from services.database import db
from services.gamification import BADGE_DEFINITIONS, xp_for_next_level

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("")
async def get_leaderboard(
    scope: str = Query("global", regex="^(global|organization)$"),
    limit: int = Query(50, le=100),
    current_user: User = Depends(get_current_user),
):
    """Get leaderboard rankings."""
    query = {}
    if scope == "organization" and current_user.organization_id:
        query["organization_id"] = current_user.organization_id

    users = (
        await db.users.find(
            query,
            {"_id": 0, "password_hash": 0},
        )
        .sort("xp", -1)
        .to_list(limit)
    )

    leaderboard = []
    for rank, user in enumerate(users, 1):
        # Count completed simulations
        sim_count = await db.simulations.count_documents(
            {"user_id": user["id"], "status": "completed"}
        )

        leaderboard.append(
            {
                "rank": rank,
                "user_id": user["id"],
                "username": user.get("username", ""),
                "display_name": user.get("display_name", user.get("username", "")),
                "xp": user.get("xp", 0),
                "level": user.get("level", 1),
                "badges_count": len(user.get("badges", [])),
                "streak_days": user.get("streak_days", 0),
                "simulations_completed": sim_count,
                "is_current_user": user["id"] == current_user.id,
            }
        )

    return leaderboard


@router.get("/me")
async def get_my_rank(current_user: User = Depends(get_current_user)):
    """Get current user's rank and XP progress."""
    # Count users with more XP
    higher_xp_count = await db.users.count_documents({"xp": {"$gt": current_user.xp}})
    rank = higher_xp_count + 1
    total_users = await db.users.count_documents({})

    sim_count = await db.simulations.count_documents(
        {"user_id": current_user.id, "status": "completed"}
    )

    return {
        "rank": rank,
        "total_users": total_users,
        "xp_progress": xp_for_next_level(current_user.xp),
        "badges": current_user.badges,
        "streak_days": current_user.streak_days,
        "simulations_completed": sim_count,
    }


@router.get("/badges")
async def get_all_badges(current_user: User = Depends(get_current_user)):
    """Get all available badges with earned status."""
    result = []
    for badge in BADGE_DEFINITIONS:
        result.append(
            {
                **badge,
                "earned": badge["id"] in current_user.badges,
            }
        )
    return result
