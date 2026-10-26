"""
Free-text response exercise.

The trainee is shown a social-engineering message and types how they would
respond. An LLM grades the reply against a fixed rubric, so what matters is the
*behavior* — refusing, verifying through an independent channel, reporting —
not picking an option from a list. Grading is server-side; the rubric scoring
is computed here, not by the model's own number.
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException

from services.database import db


def strip_prompt(prompt: dict) -> dict:
    """What the trainee sees — the scenario, not the rubric hints."""
    return {
        "id": prompt.get("id"),
        "title": prompt.get("title"),
        "difficulty": prompt.get("difficulty"),
        "channel": prompt.get("channel", "email_inbox"),
        "from": prompt.get("from"),
        "scenario": prompt.get("scenario"),
    }


def score_from_rubric(rubric: dict) -> tuple[int, str]:
    """Turn the LLM's rubric booleans into a 0-100 score and an outcome.

    Complying is the dominant failure. Independent verification and reporting
    are the behaviors we reward; verifying with the sender instead is weak.
    """
    if rubric.get("complied"):
        return 15, "compromised"
    score = 55
    if rubric.get("verified_independently"):
        score += 25
    if rubric.get("would_report"):
        score += 20
    if rubric.get("asked_the_sender") and not rubric.get("verified_independently"):
        score -= 15
    score = max(0, min(100, score))
    return score, ("success" if score >= 70 else "failure")


async def get_prompt(prompt_id: str, *, full: bool = False) -> dict:
    prompt = await db.freetext_prompts.find_one({"id": prompt_id}, {"_id": 0})
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt if full else strip_prompt(prompt)


async def grade(prompt_id: str, user_id: str, response: str, gateway) -> dict:
    prompt = await get_prompt(prompt_id, full=True)
    if not gateway:
        raise HTTPException(
            status_code=400,
            detail="This exercise needs an LLM provider. Configure one in Settings.",
        )
    rubric = await gateway.grade_freetext(
        scenario=prompt.get("scenario", ""),
        response=response,
        language=prompt.get("language", "en"),
    )
    score, outcome = score_from_rubric(rubric)

    from services.simulation import create_simulation

    sim = await create_simulation(
        {
            "simulation_type": "freetext",
            "freetext_prompt_id": prompt_id,
            "status": "completed",
            "score": score,
            "title": prompt.get("title", "Free-text response"),
            "difficulty": prompt.get("difficulty"),
            "challenge_data": {
                "cialdini_categories": [prompt["principle"]] if prompt.get("principle") else []
            },
            "events": [
                {
                    "event_type": "freetext_graded",
                    "action": "complied" if outcome == "compromised" else "resisted",
                    "payload": rubric,
                }
            ],
            "completed_at": datetime.now(UTC).isoformat(),
        },
        user_id,
        internal=True,
    )
    return {"score": score, "outcome": outcome, "rubric": rubric, "simulation_id": sim["id"]}


async def seed_default_prompts() -> None:
    if await db.freetext_prompts.count_documents({}):
        return
    await db.freetext_prompts.insert_many(_defaults())


def _p(title, difficulty, principle, from_, scenario):
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "difficulty": difficulty,
        "principle": principle,
        "channel": "email_inbox",
        "from": from_,
        "scenario": scenario,
        "language": "en",
    }


def _defaults() -> list[dict]:
    return [
        _p(
            "The urgent CEO",
            "hard",
            "authority",
            "ceo@acme.corp-mail.com",
            "Hi, I'm in a board meeting and can't talk. I need you to process an urgent wire "
            "transfer to a new supplier today — $48,000. Reply here and I'll send the account "
            "details. Keep this confidential until the deal closes.",
        ),
        _p(
            "IT password reset",
            "medium",
            "scarcity",
            "it-helpdesk@acme-support.net",
            "We detected a breach on your account. To avoid suspension in the next 30 minutes, "
            "reply with your current password so we can migrate your mailbox to the secure server.",
        ),
        _p(
            "The helpful vendor",
            "medium",
            "reciprocity",
            "billing@vendor-portal.net",
            "Thanks for being a great customer! We've credited your account. Just confirm the "
            "one-time code we're texting you now so we can apply the refund.",
        ),
    ]
