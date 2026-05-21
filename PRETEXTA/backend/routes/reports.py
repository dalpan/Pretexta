from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User
from services.auth import get_current_user
from services.database import db
from services.scoring import calculate_susceptibility_score

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/{simulation_id}/json")
async def get_report_json(simulation_id: str, current_user: User = Depends(get_current_user)):
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    score_data = calculate_susceptibility_score(sim)

    return {
        "simulation_id": simulation_id,
        "score": score_data,
        "events": sim.get("events", []),
        "started_at": sim.get("started_at"),
        "completed_at": sim.get("completed_at"),
        "participant_name": sim.get("participant_name"),
    }
