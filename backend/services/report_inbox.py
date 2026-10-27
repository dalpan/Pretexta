"""
Report-Phish mailbox / abuse inbox (docs/roadmap.md LIVE OPS #1).

The defensive mirror of a live campaign. When someone forwards a suspicious
email to the organization's abuse mailbox, Pretexta:

  1. classifies it — is it one of *our* simulated lures, or something else?
  2. if it is ours, credits the reporter (their recipient row is marked reported,
     which is exactly the behaviour report rate measures), closing the loop;
  3. if it is not ours, queues it as `needs_review` so the security team can
     decide whether it is a genuine threat.

Reporting a phish is the behaviour we want, so this never triggers remediation.
Secrets in the forwarded body are scrubbed before anything is stored.
"""

import logging
import re
from datetime import UTC, datetime

from models.schemas import PhishReport
from services.database import db
from services.live.secrets import scrub

logger = logging.getLogger(__name__)

# Statuses of campaigns that actually sent mail (so a report could match one).
_SENT_STATUSES = ("launching", "running", "closed", "killed")
_SUBJECT_PREFIX = re.compile(r"^\s*(?:re|fw|fwd)\s*:\s*", re.IGNORECASE)


def _clean_subject(subject: str) -> str:
    s = subject or ""
    while True:
        stripped = _SUBJECT_PREFIX.sub("", s)
        if stripped == s:
            return s.strip().lower()
        s = stripped


async def classify(
    org_scope: dict, subject: str, from_address: str, body: str
) -> tuple[str, str | None]:
    """Decide whether a reported message is one of our simulations.

    Matches by the campaign's sender address (in the From or anywhere in the
    forwarded body) or by an exact subject match. Returns (verdict, campaign_id).
    """
    clean_subj = _clean_subject(subject)
    from_addr = (from_address or "").strip().lower()
    body_l = (body or "").lower()

    async for c in db.live_campaigns.find(
        {**org_scope, "status": {"$in": list(_SENT_STATUSES)}},
        {"_id": 0, "id": 1, "sender_email": 1, "subject": 1},
    ):
        sender = (c.get("sender_email") or "").strip().lower()
        if sender and (sender == from_addr or sender in body_l):
            return "simulation", c["id"]
        csubj = (c.get("subject") or "").strip().lower()
        if csubj and clean_subj and csubj == clean_subj:
            return "simulation", c["id"]
    return "needs_review", None


async def credit_reporter(campaign_id: str, reporter_email: str) -> bool:
    """Mark the reporter as having reported the campaign (feeds report rate).

    Idempotent; returns True only if this call flipped them to reported.
    """
    email = reporter_email.strip().lower()
    rec = await db.live_recipients.find_one(
        {"campaign_id": campaign_id, "email": email}, {"_id": 0, "reported": 1}
    )
    if not rec or rec.get("reported"):
        return False
    await db.live_recipients.update_one(
        {"campaign_id": campaign_id, "email": email},
        {"$set": {"reported": True, "updated_at": datetime.now(UTC).isoformat()}},
    )
    campaign = await db.live_campaigns.find_one(
        {"id": campaign_id}, {"_id": 0, "organization_id": 1}
    )
    await db.live_events.insert_one(
        {
            "campaign_id": campaign_id,
            "organization_id": (campaign or {}).get("organization_id"),
            "email": email,
            "type": "reported",
            "at": datetime.now(UTC),
        }
    )
    return True


async def ingest_report(
    org_id: str | None,
    reporter_email: str,
    subject: str = "",
    from_address: str = "",
    body: str = "",
) -> dict:
    """Store one reported message and, if it is ours, credit the reporter."""
    org_scope = {} if org_id is None else {"organization_id": org_id}
    redacted, _ = scrub(body or "")
    verdict, campaign_id = await classify(org_scope, subject, from_address, body)

    credited = False
    if verdict == "simulation" and campaign_id:
        credited = await credit_reporter(campaign_id, reporter_email)

    user = await db.users.find_one({"email": reporter_email.strip().lower()}, {"_id": 0, "id": 1})
    report = PhishReport(
        organization_id=org_id,
        reporter_email=reporter_email.strip().lower(),
        reporter_user_id=(user or {}).get("id"),
        subject=subject[:200],
        from_address=from_address[:200],
        verdict=verdict,
        campaign_id=campaign_id,
        body_excerpt=redacted[:500],
        credited=credited,
    )
    await db.phish_reports.insert_one(report.model_dump())
    logger.info(f"Phish report from {report.reporter_email}: {verdict}")
    return report.model_dump()


async def stats(org_scope: dict) -> dict:
    """Counts by verdict plus a report-quality ratio."""
    out = {"total": 0, "simulation": 0, "needs_review": 0, "threat": 0, "benign": 0}
    async for row in db.phish_reports.aggregate(
        [{"$match": org_scope}, {"$group": {"_id": "$verdict", "n": {"$sum": 1}}}]
    ):
        out[row["_id"]] = row["n"]
        out["total"] += row["n"]
    return out


async def leaderboard(org_scope: dict, limit: int = 10) -> list[dict]:
    """Top reporters by number of reports (simulations caught shown separately)."""
    pipeline = [
        {"$match": org_scope},
        {
            "$group": {
                "_id": "$reporter_email",
                "reports": {"$sum": 1},
                "simulations_caught": {
                    "$sum": {"$cond": [{"$eq": ["$verdict", "simulation"]}, 1, 0]}
                },
            }
        },
        {"$sort": {"simulations_caught": -1, "reports": -1}},
        {"$limit": limit},
    ]
    rows = []
    async for r in db.phish_reports.aggregate(pipeline):
        rows.append(
            {
                "reporter_email": r["_id"],
                "reports": r["reports"],
                "simulations_caught": r["simulations_caught"],
            }
        )
    return rows
