"""Free-text response: rubric scoring, server-graded, scenario not leaking rubric."""

import pytest

from services import freetext
from services.database import db
from tests.conftest import make_user

PROMPT = {
    "id": "ft1",
    "title": "The urgent CEO",
    "difficulty": "hard",
    "principle": "authority",
    "channel": "email_inbox",
    "from": "ceo@acme.corp-mail.com",
    "scenario": "Process an urgent wire transfer today, keep it confidential.",
    "language": "en",
}


class FakeGateway:
    def __init__(self, rubric):
        self._rubric = rubric

    async def grade_freetext(self, *, scenario, response, language="en"):
        return {
            "complied": False,
            "verified_independently": False,
            "asked_the_sender": False,
            "would_report": False,
            "feedback": "ok",
            **self._rubric,
        }


async def _seed():
    await db.freetext_prompts.insert_one(dict(PROMPT))


# ---------- scoring ----------


def test_score_rewards_the_right_behavior():
    assert freetext.score_from_rubric({"complied": True})[0] == 15
    good = freetext.score_from_rubric({"verified_independently": True, "would_report": True})
    assert good == (100, "success")
    weak = freetext.score_from_rubric({"asked_the_sender": True})
    assert weak[0] < 55  # verifying with the sender is penalised


# ---------- API ----------


async def test_get_prompt_hides_rubric_fields(api):
    _, h = await make_user("user")
    await _seed()
    p = (await api.get("/api/freetext/ft1", headers=h)).json()
    assert "scenario" in p and "principle" not in p


async def test_submit_grades_via_gateway(api, monkeypatch):
    _, h = await make_user("user")
    await _seed()
    monkeypatch.setattr(
        "services.ai_gateway.AIGateway.from_db",
        staticmethod(
            lambda: _wrap(FakeGateway({"verified_independently": True, "would_report": True}))
        ),
    )
    r = await api.post(
        "/api/freetext/ft1/submit",
        json={"response": "I'll call the CFO on the official number to verify, and report this."},
        headers=h,
    )
    body = r.json()
    assert body["score"] == 100 and body["outcome"] == "success"
    sim = await db.simulations.find_one({"id": body["simulation_id"]})
    assert sim["simulation_type"] == "freetext" and sim["score"] == 100


async def test_complying_scores_low(api, monkeypatch):
    _, h = await make_user("user")
    await _seed()
    monkeypatch.setattr(
        "services.ai_gateway.AIGateway.from_db",
        staticmethod(lambda: _wrap(FakeGateway({"complied": True}))),
    )
    r = await api.post(
        "/api/freetext/ft1/submit", json={"response": "Sure, here are the bank details."}, headers=h
    )
    assert r.json()["score"] == 15 and r.json()["outcome"] == "compromised"


async def test_submit_requires_llm(api, monkeypatch):
    _, h = await make_user("user")
    await _seed()
    monkeypatch.setattr("services.ai_gateway.AIGateway.from_db", staticmethod(lambda: _wrap(None)))
    r = await api.post("/api/freetext/ft1/submit", json={"response": "no"}, headers=h)
    assert r.status_code == 400


async def test_client_cannot_post_freetext_simulation(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/simulations",
        json={"simulation_type": "freetext", "status": "completed", "score": 100},
        headers=h,
    )
    assert r.status_code == 409


@pytest.mark.parametrize("field", ["scenario", "principle"])
async def test_list_hides_scenario(api, field):
    _, h = await make_user("user")
    await _seed()
    rows = (await api.get("/api/freetext", headers=h)).json()
    assert rows and field not in rows[0]


async def _wrap(value):
    return value
