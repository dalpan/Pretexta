from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import Challenge, User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/challenges", tags=["challenges"])

MAX_PAGE_SIZE = 100


@router.get("")
async def get_challenges(
    current_user: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=MAX_PAGE_SIZE),
    difficulty: str | None = Query(default=None),
    search: str | None = Query(default=None),
):
    """List challenges with optional filtering and pagination."""
    query: dict = {}
    if difficulty:
        query["difficulty"] = difficulty.lower()
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]

    skip = (page - 1) * limit
    challenges = (
        await db.challenges.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .to_list(limit)
    )
    total = await db.challenges.count_documents(query)
    return {
        "items": challenges,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/all")
async def get_all_challenges(current_user: User = Depends(get_current_user)):
    """Return all challenges without pagination (for dropdowns, assignments, etc.)."""
    pipeline = [
        {"$addFields": {"node_count": {"$size": {"$ifNull": ["$nodes", []]}}}},
        {"$project": {"_id": 0, "nodes": 0}},
        {"$sort": {"title": 1}},
    ]
    challenges = await db.challenges.aggregate(pipeline).to_list(500)
    return challenges


@router.get("/{challenge_id}")
async def get_challenge(challenge_id: str, current_user: User = Depends(get_current_user)):
    challenge = await db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    # Ensure nodes is always a list to prevent player crash
    if not isinstance(challenge.get("nodes"), list):
        challenge["nodes"] = []
    return challenge


@router.post("", response_model=Challenge)
async def create_challenge(
    challenge: Challenge, current_user: User = Depends(get_current_user)
):
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Instructor or admin role required")
    doc = challenge.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.challenges.insert_one(doc)
    return challenge


@router.delete("/{challenge_id}")
async def delete_challenge(
    challenge_id: str, current_user: User = Depends(get_current_user)
):
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Instructor or admin role required")
    result = await db.challenges.delete_one({"id": challenge_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return {"message": "Challenge deleted"}
