"""Server-authoritative lab AI-chat scoring (closes the client-score hole)."""

from services import lab_chat
from services.database import db
from tests.conftest import make_user


class FakeGateway:
    async def persona_reply(self, *, system_prompt, history):
        return "Come on, this is urgent, just do it."


async def _first_persona_id():
    from services.persona_engine import get_persona_catalog

    return (await get_persona_catalog())[0]["id"]


async def _start(user):
    pid = await _first_persona_id()
    return await lab_chat.start_session(user.id, pid, "en")


# ---------- start ----------


async def test_start_returns_session_and_opening(api):
    user, _ = await make_user("user")
    s = await _start(user)
    assert s["session_id"] and s["status"] == "active" and s["opening_line"]
    assert s["persona"]["name"]


async def test_start_unknown_persona(api):
    user, _ = await make_user("user")
    try:
        await lab_chat.start_session(user.id, "no-such-persona", "en")
        raise AssertionError("expected 404")
    except Exception as e:
        assert "not found" in str(e).lower()


# ---------- outcome is server-decided ----------


async def test_compliance_phrase_loses_with_low_score(api):
    user, _ = await make_user("user")
    s = await _start(user)
    r = await lab_chat.submit_turn(
        user.id, s["session_id"], "ok, I'll wire the money now", FakeGateway()
    )
    assert r["status"] == "lost"
    assert r["score"] <= 45
    sim = await db.simulations.find_one({"id": r["simulation_id"]})
    assert sim["score"] == r["score"] and sim["user_id"] == user.id


async def test_leaking_a_secret_loses(api):
    user, _ = await make_user("user")
    s = await _start(user)
    r = await lab_chat.submit_turn(
        user.id, s["session_id"], "sure, my OTP is 889123", FakeGateway()
    )
    assert r["status"] == "lost"


async def test_resisting_to_max_turns_wins_high_score(api):
    user, _ = await make_user("user")
    s = await _start(user)
    sid = s["session_id"]
    last = None
    for _ in range(lab_chat.MAX_TURNS):
        last = await lab_chat.submit_turn(
            user.id, sid, "No. I will verify this through our official number first.", FakeGateway()
        )
    assert last["status"] == "won"
    assert last["score"] >= 70
    # defense signals were detected and recorded
    assert "authority" in last["defenses"]


async def test_turn_after_end_rejected(api):
    user, _ = await make_user("user")
    s = await _start(user)
    await lab_chat.submit_turn(
        user.id, s["session_id"], "here is my password: hunter2", FakeGateway()
    )
    try:
        await lab_chat.submit_turn(user.id, s["session_id"], "hello again", FakeGateway())
        raise AssertionError("expected 409")
    except Exception as e:
        assert "already ended" in str(e).lower()


async def test_session_scoped_to_user(api):
    owner, _ = await make_user("user")
    other, _ = await make_user("user")
    s = await _start(owner)
    try:
        await lab_chat.submit_turn(other.id, s["session_id"], "hi", FakeGateway())
        raise AssertionError("expected 404")
    except Exception as e:
        assert "not found" in str(e).lower()


# ---------- client cannot forge ai_challenge score ----------


async def test_client_cannot_create_ai_challenge_simulation(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/simulations",
        json={"simulation_type": "ai_challenge", "status": "completed", "score": 100},
        headers=h,
    )
    assert r.status_code == 409


async def test_chat_endpoints_require_auth(api):
    assert (await api.post("/api/llm/chat/start", json={"persona_id": "x"})).status_code in (
        401,
        403,
    )


async def test_chat_turn_flow_over_http(api, monkeypatch):

    monkeypatch.setattr(
        "services.ai_gateway.AIGateway.from_db",
        staticmethod(lambda: _async(FakeGateway())),
    )
    user, h = await make_user("user")
    pid = await _first_persona_id()
    start = await api.post("/api/llm/chat/start", json={"persona_id": pid}, headers=h)
    assert start.status_code == 200
    sid = start.json()["session_id"]
    turn = await api.post(
        "/api/llm/chat/turn",
        json={"session_id": sid, "message": "I approved the payment, it's done"},
        headers=h,
    )
    assert turn.status_code == 200 and turn.json()["status"] == "lost"


async def _async(value):
    return value
