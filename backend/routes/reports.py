from fastapi import APIRouter, Depends

from models.schemas import User
from services.auth import get_current_user
from services.scoring import calculate_susceptibility_score
from services.simulation import get_simulation_for_viewer

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/{simulation_id}/json")
async def get_report_json(simulation_id: str, current_user: User = Depends(get_current_user)):
    sim = await get_simulation_for_viewer(simulation_id, current_user)

    score_data = calculate_susceptibility_score(sim)

    return {
        "simulation_id": simulation_id,
        "score": score_data,
        "events": sim.get("events", []),
        "started_at": sim.get("started_at"),
        "completed_at": sim.get("completed_at"),
        "participant_name": sim.get("participant_name"),
    }
