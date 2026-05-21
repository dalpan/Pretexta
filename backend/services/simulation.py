"""
Simulation service layer.

Centralizes all simulation business logic so route handlers stay thin.
- Scopes all simulations to the owning user
- Awards XP + badges on completion
- Updates risk profile on completion
- Auto-links assignment results when a simulation maps to an assignment
"""

import logging
from datetime import UTC, datetime

from fastapi import HTTPException

from models.schemas import AssignmentResult
from services.database import db
from services.gamification import award_xp, check_simulation_badges

logger = logging.getLogger(__name__)


async def create_simulation(data: dict, user_id: str) -> dict:
    """
    Persist a new simulation owned by user_id.
    Awards XP and checks badge conditions on completion.
    """
    data["user_id"] = user_id

    # Normalize timestamps
    for field in ("started_at", "completed_at"):
        val = data.get(field)
        if val and not isinstance(val, str):
            data[field] = val.isoformat()
        elif val is None:
            data.pop(field, None)

    await db.simulations.insert_one(data)

    # Award XP + update risk profile if simulation completed immediately (e.g. quiz)
    if data.get("status") == "completed" and data.get("score") is not None:
        await _on_simulation_complete(data, user_id)

    return {"id": data["id"], "status": "created"}


async def list_simulations(user_id: str, limit: int = 100) -> list[dict]:
    """Return simulations owned by user_id, newest first."""
    sims = (
        await db.simulations.find({"user_id": user_id}, {"_id": 0})
        .sort("started_at", -1)
        .to_list(limit)
    )
    return sims


async def get_simulation(simulation_id: str, user_id: str) -> dict:
    """Fetch a single simulation, verifying ownership."""
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.get("user_id") and sim["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this simulation")
    return sim


async def update_simulation(simulation_id: str, updates: dict, user_id: str) -> dict:
    """
    Update a simulation, verifying ownership.
    On status → completed: awards XP, updates risk profile, records assignment result.
    """
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.get("user_id") and sim["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this simulation")

    # Auto-timestamp completion
    if updates.get("status") == "completed" and not updates.get("completed_at"):
        updates["completed_at"] = datetime.now(UTC).isoformat()

    result = await db.simulations.update_one({"id": simulation_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Completion transition — fire all side effects
    if updates.get("status") == "completed" and sim.get("status") != "completed":
        merged = {**sim, **updates}
        await _on_simulation_complete(merged, user_id)

    return {"message": "Simulation updated"}


async def delete_simulation(simulation_id: str, user_id: str) -> dict:
    """Delete a simulation, verifying ownership."""
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.get("user_id") and sim["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this simulation")

    await db.simulations.delete_one({"id": simulation_id})
    return {"message": "Simulation deleted"}


# ── Completion side-effects ────────────────────────────────────────────────


async def _on_simulation_complete(sim: dict, user_id: str) -> None:
    """
    Called when a simulation transitions to status=completed.
    Side effects (all fire-and-forget, never block the response):
      1. Award XP + check badges
      2. Update risk profile vector
      3. Record assignment result if there's an active assignment
    """
    score = sim.get("score") or 0

    # 1. XP + badges
    xp_earned = _calculate_xp(sim)
    if xp_earned > 0:
        try:
            await award_xp(user_id, xp_earned)
            await check_simulation_badges(user_id)
        except Exception as e:
            logger.warning(f"XP/badge award failed for user {user_id}: {e}")

    # 2. Risk profile update
    try:
        from services.risk_engine import update_profile_from_simulation
        channel = _extract_channel(sim)
        outcome = _extract_outcome(sim)
        await update_profile_from_simulation(
            user_id=user_id,
            simulation_id=sim.get("id", ""),
            events=sim.get("events", []),
            channel=channel,
            final_outcome=outcome,
        )
    except Exception as e:
        logger.warning(f"Risk profile update failed for user {user_id}: {e}")

    # 3. Auto-link assignment result
    try:
        await _record_assignment_result(sim, user_id, score)
    except Exception as e:
        logger.warning(f"Assignment result recording failed: {e}")


async def _record_assignment_result(sim: dict, user_id: str, score: float) -> None:
    """
    If there is an active assignment for this user + content,
    automatically record the result and mark it complete if passing.
    """
    challenge_id = sim.get("challenge_id")
    quiz_id = sim.get("quiz_id")
    sim_type = sim.get("simulation_type", "")

    # Build query to find matching assignment
    content_query: dict | None = None
    if challenge_id:
        content_query = {
            "trainee_id": user_id,
            "content_type": "challenge",
            "content_id": challenge_id,
            "status": "active",
        }
    elif quiz_id:
        content_query = {
            "trainee_id": user_id,
            "content_type": "quiz",
            "content_id": quiz_id,
            "status": "active",
        }
    elif sim_type == "ai_challenge":
        # Match any active ai_persona assignment
        content_query = {
            "trainee_id": user_id,
            "content_type": "ai_persona",
            "status": "active",
        }

    if not content_query:
        return

    assignment = await db.assignments.find_one(content_query, {"_id": 0})
    if not assignment:
        return

    assignment_id = assignment["id"]
    passing_score = assignment.get("passing_score", 70)
    passed = score >= passing_score

    # Check existing attempts
    existing_attempts = await db.assignment_results.count_documents(
        {"assignment_id": assignment_id, "trainee_id": user_id}
    )
    max_attempts = assignment.get("max_attempts", 3)

    if existing_attempts >= max_attempts:
        logger.debug(f"Max attempts reached for assignment {assignment_id}")
        return

    # Record result
    result = AssignmentResult(
        assignment_id=assignment_id,
        trainee_id=user_id,
        simulation_id=sim.get("id"),
        score=score,
        passed=passed,
        attempts=existing_attempts + 1,
        completed_at=datetime.now(UTC).isoformat(),
    )
    await db.assignment_results.insert_one(result.model_dump())

    # Mark assignment as completed if passed
    if passed:
        await db.assignments.update_one(
            {"id": assignment_id},
            {"$set": {"status": "completed"}},
        )
        logger.info(f"Assignment {assignment_id} auto-completed for user {user_id} (score={score})")


def _extract_channel(sim: dict) -> str | None:
    """Extract the communication channel from simulation data."""
    # Check events for channel info
    for event in sim.get("events", []):
        payload = event.get("payload", event)
        if ch := payload.get("channel"):
            return ch
    # Fall back to challenge data
    if cd := sim.get("challenge_data", {}):
        return cd.get("channel")
    return None


def _extract_outcome(sim: dict) -> str | None:
    """Extract simulation outcome for risk engine."""
    # Check events for outcome
    for event in reversed(sim.get("events", [])):
        if event.get("event_type") == "outcome_reached":
            return event.get("payload", {}).get("outcome")
    # Infer from score
    score = sim.get("score") or 0
    if score >= 70:
        return "completed"  # successfully defended
    elif score < 40:
        return "failed"     # compromised
    return None


def _calculate_xp(sim: dict) -> int:
    """Determine XP reward for a completed simulation."""
    score = sim.get("score") or 0
    sim_type = sim.get("simulation_type", "")
    difficulty = sim.get("difficulty", "medium")

    base = {"easy": 20, "medium": 35, "hard": 60}.get(difficulty, 30)

    if sim_type == "ai_challenge":
        base = 40
    elif sim_type == "quiz":
        base = 25
    elif sim_type == "campaign":
        base = 50

    # Scale by score (minimum 30% for attempt)
    return round(base * max(0.3, score / 100))
