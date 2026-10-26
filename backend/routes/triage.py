"""
Inbox triage API (server-authoritative, signal-detection scoring).

The per-item labels never leave the server; the taker submits their flags and
the server grades, computing d' with a false-alarm penalty.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from models.schemas import User
from services import triage
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/triage", tags=["triage"])


@router.get("")
async def list_sets(current_user: User = Depends(get_current_user)):
    pipeline = [
        {"$addFields": {"item_count": {"$size": {"$ifNull": ["$items", []]}}}},
        {"$project": {"_id": 0, "items": 0}},
        {"$sort": {"title": 1}},
    ]
    return await db.triage_sets.aggregate(pipeline).to_list(200)


@router.get("/{set_id}")
async def get_set(set_id: str, current_user: User = Depends(get_current_user)):
    """The inbox to triage — item labels and explanations are stripped."""
    return await triage.get_set(set_id, with_labels=False)


class TriageSubmission(BaseModel):
    # item_id -> "flag" (report as phishing) or "leave"
    marks: dict[str, str] = Field(default_factory=dict)
    duration_seconds: int = Field(default=0, ge=0, le=86400)


@router.post("/{set_id}/submit")
async def submit(
    set_id: str, data: TriageSubmission, current_user: User = Depends(get_current_user)
):
    return await triage.grade(set_id, current_user.id, data.marks, data.duration_seconds)
