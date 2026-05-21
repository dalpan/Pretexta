from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import Quiz, User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/quizzes", tags=["quizzes"])

MAX_PAGE_SIZE = 100


@router.get("")
async def get_quizzes(
    current_user: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=MAX_PAGE_SIZE),
    difficulty: str | None = Query(default=None),
):
    """List quizzes with pagination."""
    query: dict = {}
    if difficulty:
        query["difficulty"] = difficulty.lower()

    skip = (page - 1) * limit
    quizzes = (
        await db.quizzes.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .to_list(limit)
    )
    total = await db.quizzes.count_documents(query)
    return {
        "items": quizzes,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/all")
async def get_all_quizzes(current_user: User = Depends(get_current_user)):
    """Return all quizzes without pagination (for dropdowns and assignments)."""
    pipeline = [
        {"$addFields": {"question_count": {"$size": {"$ifNull": ["$questions", []]}}}},
        {"$project": {"_id": 0, "questions": 0}},
        {"$sort": {"title": 1}},
    ]
    quizzes = await db.quizzes.aggregate(pipeline).to_list(500)
    return quizzes


@router.get("/{quiz_id}")
async def get_quiz(quiz_id: str, current_user: User = Depends(get_current_user)):
    quiz = await db.quizzes.find_one({"id": quiz_id}, {"_id": 0})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not isinstance(quiz.get("questions"), list):
        quiz["questions"] = []
    return quiz
