from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from models.schemas import User
from services.auth import get_current_user
from services.database import db
from services.simulation import create_simulation

router = APIRouter(prefix="/quizzes", tags=["quizzes"])

MAX_PAGE_SIZE = 100


def _strip_answer_key(quiz: dict) -> dict:
    """Remove the answer key before sending a quiz to a taker.

    The old flow shipped `correct` flags and explanations to the browser, so a
    trainee could read every answer in the network response. Grading now happens
    server-side in /submit, which returns the key afterwards for the review screen.
    """
    for question in quiz.get("questions", []):
        for option in question.get("options", []):
            option.pop("correct", None)
        for content_key in ("content_en", "content_id"):
            if isinstance(question.get(content_key), dict):
                question[content_key].pop("explanation", None)
    return quiz


def _correct_index(question: dict) -> int:
    for i, option in enumerate(question.get("options", [])):
        if option.get("correct"):
            return i
    return -1


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
        await db.quizzes.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).to_list(limit)
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
    return _strip_answer_key(quiz)


class QuizSubmission(BaseModel):
    # {question_id: chosen_option_index}; -1 or missing means unanswered
    answers: dict[str, int] = Field(default_factory=dict)


@router.post("/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: str, submission: QuizSubmission, current_user: User = Depends(get_current_user)
):
    """Grade a quiz on the server and record the result. The browser never sees
    the answer key until it has submitted, and never sets the score."""
    quiz = await db.quizzes.find_one({"id": quiz_id}, {"_id": 0})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    questions = quiz.get("questions", [])
    if not questions:
        raise HTTPException(status_code=400, detail="Quiz has no questions")

    results = []
    earned = 0.0
    possible = 0.0
    correct_count = 0
    for q in questions:
        points = float(q.get("points", 1) or 1)
        possible += points
        correct_index = _correct_index(q)
        your_index = submission.answers.get(q.get("id"), -1)
        is_correct = your_index == correct_index and correct_index != -1
        if is_correct:
            earned += points
            correct_count += 1
        results.append(
            {
                "question_id": q.get("id"),
                "correct_index": correct_index,
                "your_index": your_index,
                "is_correct": is_correct,
                "explanation": (q.get("content_en") or {}).get("explanation"),
                "explanation_id": (q.get("content_id") or {}).get("explanation"),
            }
        )

    score = round((earned / possible) * 100) if possible else 0
    sim = await create_simulation(
        {
            "simulation_type": "quiz",
            "quiz_id": quiz_id,
            "status": "completed",
            "score": score,
            "title": quiz.get("title", "Quiz"),
            "difficulty": quiz.get("difficulty"),
            "challenge_data": {"cialdini_categories": quiz.get("cialdini_categories", [])},
            "total_questions": len(questions),
            "correct_answers": correct_count,
            "completed_at": datetime.now(UTC).isoformat(),
        },
        current_user.id,
        internal=True,
    )
    return {
        "score": score,
        "correct_count": correct_count,
        "total": len(questions),
        "results": results,
        "simulation_id": sim["id"],
    }
