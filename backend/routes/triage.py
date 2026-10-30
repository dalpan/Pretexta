"""
Inbox triage API (server-authoritative, signal-detection scoring).

The per-item labels never leave the server; the taker submits their flags and
the server grades, computing d' with a false-alarm penalty.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from models.schemas import User
from services import audit, triage
from services.auth import get_current_user, require_trainer
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


# ---- authoring: trainers add their own sets (e.g. a unit-specific content pack)


class TriageItemIn(BaseModel):
    model_config = {"extra": "forbid"}
    channel: Literal["email_inbox", "whatsapp", "sms"] = "email_inbox"
    # For chat channels `from` is the contact as shown in the chat header and
    # `subject` is the one-line preview in the chat list.
    from_: str = Field(alias="from", min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    is_pretext: bool
    principle: str | None = Field(default=None, max_length=40)
    explanation: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _pretext_is_explained(self):
        if self.is_pretext and not (self.principle and self.explanation):
            raise ValueError("a pretext needs a principle and an explanation for the debrief")
        return self


class TriageSetIn(BaseModel):
    model_config = {"extra": "forbid"}
    id: str | None = Field(default=None, min_length=3, max_length=80, pattern=r"^[a-z0-9-]+$")
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    language: Literal["en", "id"] = "en"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    items: list[TriageItemIn] = Field(min_length=4, max_length=40)

    @model_validator(mode="after")
    def _has_both_kinds(self):
        # d' needs at least one pretext and one legitimate message to be defined.
        kinds = {i.is_pretext for i in self.items}
        if kinds != {True, False}:
            raise ValueError("a set needs both pretexts and legitimate messages")
        return self


@router.post("", status_code=201)
async def create_set(data: TriageSetIn, current_user: User = Depends(require_trainer)):
    set_id = data.id or f"triage-{uuid.uuid4().hex[:12]}"
    if await db.triage_sets.find_one({"id": set_id}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="A triage set with this id already exists")
    doc = {
        **data.model_dump(exclude={"items", "id"}),
        "id": set_id,
        "created_by": current_user.id,
        "items": [
            {"id": str(uuid.uuid4()), **item.model_dump(by_alias=True)} for item in data.items
        ],
    }
    await db.triage_sets.insert_one(doc)
    await audit.record(current_user.id, "triage.set.create", set_id, {"items": len(data.items)})
    return {"id": set_id, "items": len(data.items)}
