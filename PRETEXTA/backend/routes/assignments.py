"""
Assignments API (User-Facing)

Endpoints accessible to ALL authenticated users (not just trainers).
Allows regular users to see and interact with their own assignments.

Trainer-facing assignment management stays in routes/instructor.py.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import AssignmentResult, User
from services.auth import get_current_user
from services.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/my-groups")
async def get_my_groups(current_user: User = Depends(get_current_user)):
    """
    Return all training groups the current user belongs to.
    Used to show group membership on user dashboard.
    """
    groups = await db.training_groups.find(
        {"trainee_ids": current_user.id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    # Enrich with trainer name
    result = []
    for g in groups:
        trainer = await db.users.find_one(
            {"id": g.get("instructor_id")},
            {"_id": 0, "username": 1, "display_name": 1},
        )
        result.append({
            **g,
            "trainer_name": (trainer or {}).get("display_name") or (trainer or {}).get("username") or "Unknown",
        })
    return result


@router.get("/mine")
async def get_my_assignments(current_user: User = Depends(get_current_user)):
    """
    Return all assignments for the current authenticated user.
    Accessible to ALL roles — this is the user-facing assignments view.
    """
    assignments = (
        await db.assignments.find(
            {"trainee_id": current_user.id, "status": {"$ne": "cancelled"}},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(200)
    )

    # Enrich with completion results
    results_map = {}
    if assignments:
        results = await db.assignment_results.find(
            {"trainee_id": current_user.id},
            {"_id": 0},
        ).to_list(500)
        for r in results:
            results_map[r["assignment_id"]] = r

    for a in assignments:
        a["result"] = results_map.get(a["id"])
        # Override status to 'completed' if there's a passing result
        result = a.get("result")
        if result and result.get("passed") and a["status"] == "active":
            a["status"] = "completed"

    return assignments


@router.post("/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    data: dict,
    current_user: User = Depends(get_current_user),
):
    """
    Record completion of an assignment by the current user.
    Called automatically when a simulation linked to an assignment completes.
    """
    assignment = await db.assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if assignment.get("trainee_id") != current_user.id:
        raise HTTPException(status_code=403, detail="This assignment is not for you")

    if assignment.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Assignment is cancelled")

    score = data.get("score", 0)
    simulation_id = data.get("simulation_id")
    passing_score = assignment.get("passing_score", 70)
    passed = score >= passing_score

    # Check how many attempts already
    existing_results = await db.assignment_results.count_documents(
        {"assignment_id": assignment_id, "trainee_id": current_user.id}
    )
    max_attempts = assignment.get("max_attempts", 3)

    if existing_results >= max_attempts:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum attempts ({max_attempts}) reached for this assignment",
        )

    # Record result
    result = AssignmentResult(
        assignment_id=assignment_id,
        trainee_id=current_user.id,
        simulation_id=simulation_id,
        score=score,
        passed=passed,
        attempts=existing_results + 1,
        completed_at=datetime.now(UTC).isoformat(),
    )
    await db.assignment_results.insert_one(result.model_dump())

    # Mark assignment as completed if passed
    if passed:
        await db.assignments.update_one(
            {"id": assignment_id},
            {"$set": {"status": "completed"}},
        )

    logger.info(
        f"Assignment {assignment_id} submitted by {current_user.id}: "
        f"score={score}, passed={passed}, attempt={existing_results + 1}"
    )

    return {
        "message": "Assignment result recorded",
        "passed": passed,
        "score": score,
        "attempt": existing_results + 1,
        "remaining_attempts": max(0, max_attempts - existing_results - 1),
    }
