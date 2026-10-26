"""
Server-authoritative lab AI-chat sessions.

Closes the old hole where the browser decided win/loss (from an injectable
`[ATTACK_FAILED]` token) and POSTed its own score. Here the server holds the
conversation, decides the outcome from what the trainee actually typed, and
computes the score. The client can only send the next message.

Outcome:
- compromise  -> the trainee leaked a secret (secrets.scrub) or agreed to the
                 persona's goal (keyword heuristics, optionally an LLM judge)
- defended    -> survived MAX_TURNS without compromising
Score is derived from the outcome and how long/well they resisted, so it is
explainable and cannot be set by the client.
"""

import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException

from services.database import db
from services.live.secrets import scrub
from services.persona_engine import _detect_defenses, get_persona_catalog

logger = logging.getLogger(__name__)

MAX_TURNS = 6

# Phrases that signal the trainee gave in to the persona's request (en + id).
_COMPLIANCE_PHRASES = [
    "i'll wire",
    "i will wire",
    "wiring the",
    "transfer now",
    "sending the money",
    "sent the money",
    "i'll pay",
    "i will pay",
    "paid the invoice",
    "here is my password",
    "here's my password",
    "my password is",
    "installing it now",
    "i installed",
    "i clicked",
    "clicked the link",
    "here you go",
    "here's the code",
    "here is the code",
    "sent it over",
    "ok i'll send",
    "okay i'll send",
    "approved the payment",
    "i approved",
    "saya transfer",
    "sudah saya transfer",
    "saya kirim",
    "sudah saya kirim",
    "ini passwordnya",
    "password saya",
    "saya klik",
    "sudah saya klik",
    "saya install",
    "saya setujui",
    "saya bayar",
    "sudah dibayar",
    "ini kodenya",
    "oke saya kirim",
]


def _is_compliance(message: str) -> bool:
    low = message.lower()
    return any(p in low for p in _COMPLIANCE_PHRASES)


def _build_prompt(persona: dict, language: str, turn: int) -> str:
    lang = (
        "Respond in Indonesian (Bahasa Indonesia)." if language == "id" else "Respond in English."
    )
    return (
        "You are role-playing an attacker in an AUTHORIZED security-awareness "
        "training chat. The trainee is practising how to resist social engineering.\n\n"
        f"Persona: {persona.get('name')} ({persona.get('category')}).\n"
        f"Your goal: {persona.get('goal', 'extract sensitive information or action')}.\n"
        f"Style: {persona.get('style', 'persuasive')}.\n"
        f"Context: {persona.get('context', 'a workplace scenario')}.\n\n"
        "Stay in character. Apply pressure realistically but never actually obtain "
        "real data — this is a drill. Keep replies to 1-3 sentences, like a chat.\n"
        f"This is turn {turn} of at most {MAX_TURNS}. Do not emit any status tokens or "
        "stage directions; just speak as the character.\n"
        f"{lang}"
    )


def _score(outcome: str, turn: int, defense_count: int) -> int:
    if outcome == "compromised":
        # Falling early is worse; resisting a few turns first earns a little credit.
        return max(10, min(45, 10 + (turn - 1) * 8))
    # defended
    return max(70, min(100, 70 + defense_count * 6))


async def _persona(persona_id: str) -> dict:
    persona = next((p for p in await get_persona_catalog() if p["id"] == persona_id), None)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona


async def start_session(user_id: str, persona_id: str, language: str) -> dict:
    persona = await _persona(persona_id)
    session = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "persona_id": persona_id,
        "language": language,
        "history": [
            {
                "role": "assistant",
                "content": persona.get("opening_line") or persona.get("openingLine") or "Hello.",
            }
        ],
        "turns": 0,
        "defenses": [],
        "status": "active",
        "score": None,
        "simulation_id": None,
        "created_at": datetime.now(UTC).isoformat(),
    }
    await db.lab_sessions.insert_one(dict(session))
    return {
        "session_id": session["id"],
        "status": "active",
        "persona": {
            "id": persona["id"],
            "name": persona.get("name"),
            "category": persona.get("category"),
            "difficulty": persona.get("difficulty"),
        },
        "opening_line": persona.get("opening_line") or persona.get("openingLine") or "Hello.",
        "max_turns": MAX_TURNS,
    }


async def submit_turn(user_id: str, session_id: str, message: str, gateway) -> dict:
    session = await db.lab_sessions.find_one({"id": session_id, "user_id": user_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="This session has already ended")

    turn = session["turns"] + 1
    persona = await _persona(session["persona_id"])

    # Decide the outcome from what the trainee typed — the server, not the model.
    _, secrets_found = scrub(message)
    defenses = _detect_defenses(message)
    all_defenses = sorted(set(session.get("defenses", []) + defenses))

    outcome = None
    if secrets_found or _is_compliance(message):
        outcome = "compromised"
    elif turn >= MAX_TURNS:
        outcome = "defended"

    # Persona reply (unless the drill just ended on a compromise).
    history = [*session["history"], {"role": "user", "content": message}]
    reply = ""
    if outcome != "compromised":
        try:
            reply = await gateway.persona_reply(
                system_prompt=_build_prompt(persona, session["language"], turn),
                history=history,
            )
        except Exception as exc:
            logger.warning(f"persona reply failed: {exc}")
            raise HTTPException(status_code=502, detail="LLM error, try again")
        history.append({"role": "assistant", "content": reply})

    updates = {"turns": turn, "defenses": all_defenses, "history": history}

    if outcome:
        score = _score(outcome, turn, len(all_defenses))
        sim_id = await _persist_simulation(session, persona, outcome, score, all_defenses)
        updates.update(
            status=("lost" if outcome == "compromised" else "won"),
            score=score,
            simulation_id=sim_id,
            completed_at=datetime.now(UTC).isoformat(),
        )
        await db.lab_sessions.update_one({"id": session_id}, {"$set": updates})
        return {
            "status": "lost" if outcome == "compromised" else "won",
            "reply": reply,
            "score": score,
            "defenses": all_defenses,
            "simulation_id": sim_id,
        }

    await db.lab_sessions.update_one({"id": session_id}, {"$set": updates})
    return {"status": "active", "reply": reply, "turn": turn, "defenses": all_defenses}


async def _persist_simulation(
    session: dict, persona: dict, outcome: str, score: int, defenses: list[str]
) -> str:
    """Create the simulation record server-side with the computed score."""
    from services.simulation import create_simulation

    events = [
        {"event_type": "chat_turn", "turn": i, "role": m["role"]}
        for i, m in enumerate(session["history"])
    ]
    events.append(
        {
            "event_type": "outcome_reached",
            "action": "complied" if outcome == "compromised" else "resisted",
            "payload": {"outcome": "success" if outcome == "compromised" else "failure"},
        }
    )
    doc = {
        "simulation_type": "ai_challenge",
        "status": "completed",
        "score": score,
        "title": f"AI Battle: {persona.get('name')}",
        "category": persona.get("category"),
        "difficulty": persona.get("difficulty"),
        "challenge_data": {"cialdini_categories": defenses or [persona.get("category", "general")]},
        "events": events,
        "completed_at": datetime.now(UTC).isoformat(),
    }
    result = await create_simulation(doc, session["user_id"], internal=True)
    return result["id"]
