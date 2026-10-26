"""Server-authoritative branching-scenario scoring."""

from services.database import db
from tests.conftest import make_user

CHALLENGE = {
    "id": "ch-1",
    "title": "CEO Wire Transfer",
    "difficulty": "hard",
    "cialdini_categories": ["authority"],
    "nodes": [
        {
            "id": "start",
            "type": "message",
            "channel": "chat",
            "content_en": {"body": "Hey, urgent favor"},
            "next": "q1",
        },
        {
            "id": "q1",
            "type": "question",
            "content_en": {"text": "What do you do?"},
            "options": [
                {"text": "Wire it now", "next": "bad", "score_impact": -25},
                {"text": "Verify first", "next": "good", "score_impact": 20},
            ],
        },
        {"id": "bad", "type": "end", "result": "failure", "content_en": {"body": "Compromised"}},
        {"id": "good", "type": "end", "result": "success", "content_en": {"body": "Well done"}},
    ],
}


async def _seed():
    await db.challenges.insert_one(dict(CHALLENGE))


# ---------- answer key not leaked to trainees ----------


async def test_get_challenge_strips_answer_key_for_trainee(api):
    _, h = await make_user("user")
    await _seed()
    ch = (await api.get("/api/challenges/ch-1", headers=h)).json()
    q = next(n for n in ch["nodes"] if n["type"] == "question")
    for opt in q["options"]:
        assert "score_impact" not in opt and "next" not in opt
    assert "next" not in next(n for n in ch["nodes"] if n["id"] == "start")


async def test_staff_keeps_full_graph(api):
    _, h = await make_user("trainer")
    await _seed()
    ch = (await api.get("/api/challenges/ch-1", headers=h)).json()
    q = next(n for n in ch["nodes"] if n["type"] == "question")
    assert "score_impact" in q["options"][0]


# ---------- server-side play ----------


async def test_start_returns_stripped_start_node(api):
    _, h = await make_user("user")
    await _seed()
    r = await api.post("/api/scenarios/start", json={"challenge_id": "ch-1"}, headers=h)
    body = r.json()
    assert body["score"] == 100 and body["status"] == "active"
    assert body["node"]["id"] == "start"
    assert body["simulation_id"]


async def test_good_path_scores_high(api):
    _, h = await make_user("user")
    await _seed()
    s = (await api.post("/api/scenarios/start", json={"challenge_id": "ch-1"}, headers=h)).json()
    sid = s["session_id"]
    # advance past the start message
    r = await api.post("/api/scenarios/choose", json={"session_id": sid}, headers=h)
    assert r.json()["node"]["id"] == "q1"
    # choose "Verify first" (index 1) -> +20 -> good end
    r = await api.post(
        "/api/scenarios/choose", json={"session_id": sid, "option_index": 1}, headers=h
    )
    body = r.json()
    assert body["status"] == "completed" and body["outcome"] == "success"
    assert body["score"] == 100  # 100 + 20 clamped to 100
    sim = await db.simulations.find_one({"id": body["simulation_id"]})
    assert sim["status"] == "completed" and sim["score"] == 100


async def test_bad_path_scores_low(api):
    _, h = await make_user("user")
    await _seed()
    s = (await api.post("/api/scenarios/start", json={"challenge_id": "ch-1"}, headers=h)).json()
    sid = s["session_id"]
    await api.post("/api/scenarios/choose", json={"session_id": sid}, headers=h)
    r = await api.post(
        "/api/scenarios/choose", json={"session_id": sid, "option_index": 0}, headers=h
    )
    body = r.json()
    assert body["outcome"] == "failure" and body["score"] == 75  # 100 - 25


async def test_invalid_option_rejected(api):
    _, h = await make_user("user")
    await _seed()
    s = (await api.post("/api/scenarios/start", json={"challenge_id": "ch-1"}, headers=h)).json()
    sid = s["session_id"]
    await api.post("/api/scenarios/choose", json={"session_id": sid}, headers=h)
    r = await api.post(
        "/api/scenarios/choose", json={"session_id": sid, "option_index": 9}, headers=h
    )
    assert r.status_code == 400


async def test_choice_after_end_rejected(api):
    _, h = await make_user("user")
    await _seed()
    s = (await api.post("/api/scenarios/start", json={"challenge_id": "ch-1"}, headers=h)).json()
    sid = s["session_id"]
    await api.post("/api/scenarios/choose", json={"session_id": sid}, headers=h)
    await api.post("/api/scenarios/choose", json={"session_id": sid, "option_index": 1}, headers=h)
    r = await api.post(
        "/api/scenarios/choose", json={"session_id": sid, "option_index": 0}, headers=h
    )
    assert r.status_code == 409


async def test_session_scoped_to_user(api):
    owner, _ = await make_user("user")
    _, other = await make_user("user")
    await _seed()
    s = (
        await api.post(
            "/api/scenarios/start", json={"challenge_id": "ch-1"}, headers=(await _auth(owner))
        )
    ).json()
    r = await api.post("/api/scenarios/choose", json={"session_id": s["session_id"]}, headers=other)
    assert r.status_code == 404


async def test_client_cannot_post_scenario_simulation(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/simulations",
        json={"simulation_type": "simulation", "status": "running", "score": 100},
        headers=h,
    )
    assert r.status_code == 409


async def _auth(user):
    from services.auth import create_token

    return {"Authorization": f"Bearer {create_token(user.id)}"}
