"""
Branching-scenario play API (server-authoritative).

The trainee plays through a scenario here instead of fetching the full node
graph and scoring locally. The server holds the current node and the score.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from models.schemas import User
from services.auth import get_current_user
from services.scenario_runner import choose, ensure_session, get_session, start_scenario

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


class StartRequest(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=64)
    assignment_id: str | None = Field(default=None, max_length=64)


class ChooseRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    option_index: int | None = Field(default=None, ge=0, le=50)


@router.post("/start")
async def start(data: StartRequest, current_user: User = Depends(get_current_user)):
    return await start_scenario(current_user.id, data.challenge_id, data.assignment_id)


@router.get("/session/{session_id}")
async def session_state(session_id: str, current_user: User = Depends(get_current_user)):
    return await get_session(current_user.id, session_id)


class ResumeRequest(BaseModel):
    simulation_id: str = Field(min_length=1, max_length=64)


@router.post("/resume")
async def resume(data: ResumeRequest, current_user: User = Depends(get_current_user)):
    """Resume (or begin) the scenario session for an existing simulation."""
    return await ensure_session(current_user.id, data.simulation_id)


@router.post("/choose")
async def make_choice(data: ChooseRequest, current_user: User = Depends(get_current_user)):
    return await choose(current_user.id, data.session_id, data.option_index)
