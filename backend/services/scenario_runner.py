"""
Server-authoritative branching-scenario runner.

Closes the last client-scored path. The old flow shipped each option's
`score_impact` and `next` to the browser (the answer key) and let the client
compute and PUT the score. Here the server holds the current node and the
score, applies each choice, and records the simulation itself.
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException

from services.database import db

START_SCORE = 100


def strip_node(node: dict) -> dict:
    """Node as the trainee may see it: no score_impact, no branch targets."""
    if not node:
        return node
    out = {
        "id": node.get("id"),
        "type": node.get("type"),
        "channel": node.get("channel"),
        "content_en": node.get("content_en"),
        "content_id": node.get("content_id"),
        "content": node.get("content"),
    }
    if node.get("type") == "question":
        out["options"] = [
            {"text": o.get("text"), "text_id": o.get("text_id")} for o in node.get("options", [])
        ]
    return {k: v for k, v in out.items() if v is not None}


def _nodes(challenge: dict) -> dict[str, dict]:
    return {n["id"]: n for n in challenge.get("nodes", []) if n.get("id")}


def _start_node(challenge: dict) -> dict | None:
    nodes = challenge.get("nodes", [])
    return next((n for n in nodes if n.get("id") == "start"), nodes[0] if nodes else None)


async def start_scenario(user_id: str, challenge_id: str, assignment_id: str | None = None) -> dict:
    challenge = await db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    start = _start_node(challenge)
    if not start:
        raise HTTPException(status_code=400, detail="Challenge has no nodes")

    from services.simulation import create_simulation

    sim = await create_simulation(
        {
            "simulation_type": "simulation",
            "challenge_id": challenge_id,
            "assignment_id": assignment_id,
            "status": "running",
            "score": START_SCORE,
            "title": challenge.get("title", "Scenario"),
            "difficulty": challenge.get("difficulty"),
            "challenge_data": {
                "cialdini_categories": challenge.get("cialdini_categories", []),
                "channel": start.get("channel"),
            },
            "events": [],
        },
        user_id,
        internal=True,
    )
    session = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "challenge_id": challenge_id,
        "simulation_id": sim["id"],
        "current_node_id": start["id"],
        "score": START_SCORE,
        "status": "active",
        "events": [],
        "created_at": datetime.now(UTC).isoformat(),
    }
    await db.scenario_sessions.insert_one(dict(session))
    return {
        "session_id": session["id"],
        "simulation_id": sim["id"],
        "node": strip_node(start),
        "score": START_SCORE,
        "status": "active",
    }


async def ensure_session(user_id: str, simulation_id: str) -> dict:
    """Return the scenario session for an existing simulation, creating one if
    needed (e.g. a simulation started by a campaign stage). Lets the player
    resume by simulation_id, surviving refreshes and uniform across entry points."""
    session = await db.scenario_sessions.find_one(
        {"simulation_id": simulation_id, "user_id": user_id}, {"_id": 0}
    )
    if session:
        return await get_session(user_id, session["id"])

    sim = await db.simulations.find_one(
        {"id": simulation_id, "user_id": user_id}, {"_id": 0}
    )
    if not sim or not sim.get("challenge_id"):
        raise HTTPException(status_code=404, detail="Scenario simulation not found")
    challenge = await db.challenges.find_one({"id": sim["challenge_id"]}, {"_id": 0})
    start = _start_node(challenge or {})
    if not start:
        raise HTTPException(status_code=400, detail="Challenge has no nodes")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "challenge_id": sim["challenge_id"],
        "simulation_id": simulation_id,
        "current_node_id": start["id"],
        "score": sim.get("score") or START_SCORE,
        "status": "completed" if sim.get("status") == "completed" else "active",
        "events": [],
        "created_at": datetime.now(UTC).isoformat(),
    }
    await db.scenario_sessions.insert_one(dict(doc))
    return await get_session(user_id, doc["id"])


async def get_session(user_id: str, session_id: str) -> dict:
    """Current state of a scenario session (for resume / refresh)."""
    session = await db.scenario_sessions.find_one(
        {"id": session_id, "user_id": user_id}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    challenge = await db.challenges.find_one({"id": session["challenge_id"]}, {"_id": 0})
    node = _nodes(challenge or {}).get(session["current_node_id"])
    state = {
        "session_id": session["id"],
        "simulation_id": session["simulation_id"],
        "node": strip_node(node),
        "score": session["score"],
        "status": session["status"],
    }
    if session["status"] == "completed":
        state["outcome"] = "success" if session["score"] >= 70 else "failure"
    return state


async def choose(user_id: str, session_id: str, option_index: int | None) -> dict:
    session = await db.scenario_sessions.find_one(
        {"id": session_id, "user_id": user_id}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="This scenario has already ended")

    challenge = await db.challenges.find_one({"id": session["challenge_id"]}, {"_id": 0})
    nodes = _nodes(challenge or {})
    node = nodes.get(session["current_node_id"])
    if not node:
        raise HTTPException(status_code=409, detail="Scenario state is invalid")

    score = session["score"]
    events = list(session.get("events", []))
    next_id = None

    if node.get("type") == "question":
        options = node.get("options", [])
        if option_index is None or not (0 <= option_index < len(options)):
            raise HTTPException(status_code=400, detail="A valid option choice is required")
        chosen = options[option_index]
        impact = int(chosen.get("score_impact", 0) or 0)
        score = max(0, min(100, score + impact))
        next_id = chosen.get("next")
        events.append(
            {
                "event_type": "choice_made",
                "node_id": node["id"],
                "action": "complied" if impact < 0 else "resisted",
                "payload": {"option_index": option_index, "score_impact": impact},
            }
        )
    else:
        # message / ai_adaptive / anything else: just advance along `next`
        next_id = node.get("next")
        events.append({"event_type": "node_entered", "node_id": node["id"]})

    next_node = nodes.get(next_id) if next_id else None

    # Terminal: an explicit end node, or nowhere left to go.
    if next_node is None or next_node.get("type") == "end":
        outcome = (next_node or {}).get("result") or ("success" if score >= 70 else "failure")
        events.append(
            {
                "event_type": "outcome_reached",
                "node_id": (next_node or {}).get("id"),
                "action": "resisted" if outcome == "success" else "complied",
                "payload": {"outcome": outcome},
            }
        )
        await db.scenario_sessions.update_one(
            {"id": session_id},
            {"$set": {"status": "completed", "score": score, "events": events}},
        )
        await _finalize_simulation(session["simulation_id"], user_id, score, events)
        return {
            "status": "completed",
            "node": strip_node(next_node) if next_node else None,
            "score": score,
            "outcome": outcome,
            "simulation_id": session["simulation_id"],
        }

    await db.scenario_sessions.update_one(
        {"id": session_id},
        {"$set": {"current_node_id": next_id, "score": score, "events": events}},
    )
    return {"status": "active", "node": strip_node(next_node), "score": score}


async def _finalize_simulation(sim_id: str, user_id: str, score: int, events: list) -> None:
    from services.simulation import update_simulation

    await update_simulation(
        sim_id,
        {"status": "completed", "score": score, "events": events},
        user_id,
    )
