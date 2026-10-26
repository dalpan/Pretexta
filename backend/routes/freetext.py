"""
Free-text response API (LLM-graded against a rubric, server-side).

The trainee submits only their written reply; the scenario and the grading live
on the server. Needs an LLM provider configured.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from models.schemas import User
from services import freetext
from services.ai_gateway import AIGateway
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/freetext", tags=["freetext"])


@router.get("")
async def list_prompts(current_user: User = Depends(get_current_user)):
    pipeline = [{"$project": {"_id": 0, "scenario": 0, "principle": 0}}, {"$sort": {"title": 1}}]
    return await db.freetext_prompts.aggregate(pipeline).to_list(200)


@router.get("/{prompt_id}")
async def get_prompt(prompt_id: str, current_user: User = Depends(get_current_user)):
    return await freetext.get_prompt(prompt_id, full=False)


class FreetextSubmission(BaseModel):
    response: str = Field(min_length=1, max_length=4000)


@router.post("/{prompt_id}/submit")
async def submit(
    prompt_id: str, data: FreetextSubmission, current_user: User = Depends(get_current_user)
):
    gateway = await AIGateway.from_db()
    return await freetext.grade(prompt_id, current_user.id, data.response, gateway)
