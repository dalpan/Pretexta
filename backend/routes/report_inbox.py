"""
Report-Phish mailbox API (LIVE OPS). Staff-only, scoped to the caller's org.

The abuse inbox: reported messages, their classification, who reported them, and
triage. When a report matches one of our simulations the reporter is credited
automatically (it flows into the campaign's report rate).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from models.schemas import REPORT_VERDICTS, User
from services import audit, report_inbox
from services.auth import require_trainer
from services.database import db

router = APIRouter(prefix="/report-inbox", tags=["report-inbox"])


def _scope(user: User) -> dict:
    return {} if user.role == "admin" else {"organization_id": user.organization_id}


@router.get("")
async def list_reports(
    user: User = Depends(require_trainer),
    verdict: str | None = Query(None),
    limit: int = Query(100, le=500),
):
    query = _scope(user)
    if verdict:
        query = {**query, "verdict": verdict}
    return await db.phish_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)


@router.get("/stats")
async def report_stats(user: User = Depends(require_trainer)):
    return await report_inbox.stats(_scope(user))


@router.get("/leaderboard")
async def report_leaderboard(user: User = Depends(require_trainer)):
    return await report_inbox.leaderboard(_scope(user))


class ReportIn(BaseModel):
    reporter_email: str = Field(min_length=3, max_length=320)
    subject: str = Field(default="", max_length=400)
    from_address: str = Field(default="", max_length=320)
    body: str = Field(default="", max_length=20000)


@router.post("/ingest", status_code=201)
async def ingest(body: ReportIn, user: User = Depends(require_trainer)):
    """Record a reported message (the integration point the mail poller also uses)."""
    org_id = None if user.role == "admin" else user.organization_id
    report = await report_inbox.ingest_report(
        org_id, body.reporter_email, body.subject, body.from_address, body.body
    )
    return report


class TriageIn(BaseModel):
    verdict: str


@router.patch("/{report_id}")
async def triage(report_id: str, body: TriageIn, user: User = Depends(require_trainer)):
    """Reclassify a report, e.g. needs_review -> threat or benign."""
    if body.verdict not in REPORT_VERDICTS:
        raise HTTPException(422, f"verdict must be one of {REPORT_VERDICTS}")
    res = await db.phish_reports.update_one(
        {"id": report_id, **_scope(user)},
        {"$set": {"verdict": body.verdict, "triaged_by": user.id}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Report not found")
    await audit.record(user.id, "live.report.triage", report_id, {"verdict": body.verdict})
    return {"updated": report_id, "verdict": body.verdict}
