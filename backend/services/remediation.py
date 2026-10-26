"""
Remediation loop (docs/roadmap.md, priority #1).

When someone fails — in a lab exercise or a live campaign — the server assigns
them a targeted practice exercise for the Cialdini principle they fell for, and
when they pass that remediation it schedules a variant retest. This is what makes
Pretexta a closed loop (measure -> remediate -> retest) rather than a set of
exercises.

Everything here is best-effort and must never block the triggering action.
"""

import logging
from datetime import UTC, datetime, timedelta

from models.schemas import Assignment
from services.database import db

logger = logging.getLogger(__name__)

SYSTEM_ACTOR = "system"
FAIL_SCORE = 70  # lab score below this triggers remediation
REMEDIATION_DUE_DAYS = 7
RETEST_AFTER_DAYS = 21

PRINCIPLE_LABELS = {
    "authority": "authority (someone in charge pressuring you)",
    "scarcity": "scarcity / urgency",
    "reciprocity": "reciprocity (returning a favour)",
    "commitment": "commitment & consistency",
    "liking": "liking / rapport",
    "social_proof": "social proof (everyone else is doing it)",
}


async def _pick_content(principle: str, exclude_ids: set[str]) -> dict | None:
    """Choose a lab exercise that trains `principle` and the trainee hasn't just done.

    Prefers an interactive scenario; falls back to a quiz on the same principle.
    """
    for coll, content_type in (("challenges", "challenge"), ("quizzes", "quiz")):
        async for doc in db[coll].find(
            {"cialdini_categories": principle}, {"_id": 0, "id": 1, "title": 1}
        ):
            if doc["id"] not in exclude_ids:
                return {
                    "content_type": content_type,
                    "content_id": doc["id"],
                    "title": doc["title"],
                }
    return None


async def _recent_content_ids(user_id: str) -> set[str]:
    """Content the user already has active, or passed recently — don't re-assign it."""
    ids: set[str] = set()
    async for a in db.assignments.find(
        {"trainee_id": user_id, "status": "active"}, {"_id": 0, "content_id": 1}
    ):
        ids.add(a["content_id"])
    return ids


async def assign_remediation(
    user_id: str,
    principle: str,
    reason: str,
    *,
    source: str = "remediation",
    retest_of: str | None = None,
    due_days: int = REMEDIATION_DUE_DAYS,
) -> str | None:
    """Create a remediation assignment for `principle`. Idempotent per principle:
    skips if the user already has an active remediation for it."""
    if principle not in PRINCIPLE_LABELS:
        return None

    existing = await db.assignments.find_one(
        {
            "trainee_id": user_id,
            "principle": principle,
            "source": {"$in": ["remediation", "retest"]},
            "status": "active",
        }
    )
    if existing:
        return None

    content = await _pick_content(principle, await _recent_content_ids(user_id))
    if not content:
        logger.info(f"No remediation content for principle '{principle}'")
        return None

    assignment = Assignment(
        instructor_id=SYSTEM_ACTOR,
        trainee_id=user_id,
        content_type=content["content_type"],
        content_id=content["content_id"],
        title=f"Remediation: {content['title']}",
        instructions=reason,
        reason=reason,
        principle=principle,
        source=source,
        retest_of=retest_of,
        due_date=(datetime.now(UTC) + timedelta(days=due_days)).isoformat(),
        passing_score=70.0,
    )
    await db.assignments.insert_one(assignment.model_dump())
    logger.info(f"Assigned {source} on '{principle}' to {user_id}")
    return assignment.id


def _label(principle: str) -> str:
    return PRINCIPLE_LABELS.get(principle, principle)


async def on_lab_result(sim: dict, user_id: str) -> None:
    """A completed lab simulation: remediate the weak principle(s) if it failed."""
    score = sim.get("score")
    if score is None or score >= FAIL_SCORE:
        return
    principles = (sim.get("challenge_data") or {}).get("cialdini_categories") or []
    title = sim.get("title", "an exercise")
    for principle in principles[:2]:
        await assign_remediation(
            user_id,
            principle,
            f"You scored {round(score)}% on '{title}', which tested {_label(principle)}. "
            f"This exercise gives you focused practice.",
        )


async def on_live_fail(campaign: dict, email: str, outcome: str) -> None:
    """A recipient clicked / complied / disclosed in a live campaign.

    Remediation can only be assigned to a registered user, matched by email.
    """
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if not user:
        return
    verb = {
        "clicked": "clicked the link in",
        "submitted": "submitted data to",
        "complied": "agreed to the request in",
        "disclosed": "shared a secret in",
    }.get(outcome, "fell for")
    for principle in (campaign.get("principles") or [])[:2]:
        await assign_remediation(
            user["id"],
            principle,
            f"In a live phishing simulation you {verb} a message that used {_label(principle)}. "
            f"This exercise helps you recognise it next time.",
        )


async def on_assignment_passed(assignment: dict, user_id: str) -> None:
    """When a remediation is passed, schedule one variant retest later."""
    if assignment.get("source") != "remediation" or not assignment.get("principle"):
        return
    await assign_remediation(
        user_id,
        assignment["principle"],
        f"Scheduled retest for {_label(assignment['principle'])} — "
        "a different exercise to confirm the lesson stuck.",
        source="retest",
        retest_of=assignment["id"],
        due_days=RETEST_AFTER_DAYS,
    )
