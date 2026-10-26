"""P3: secret detector, output filter, conversation engine, review queue."""

import uuid
from datetime import UTC, datetime

import pytest

from services.database import db
from services.live import conversation, mailer
from services.live.output_filter import review_draft
from services.live.secrets import scrub
from tests.conftest import make_user

# ---------- secret detector (G6) ----------


@pytest.mark.parametrize(
    "text,should_flag",
    [
        ("my otp is 123456", True),
        ("the code is 4821", True),
        ("pin: 1234", True),
        ("password: Hunter2!", True),
        ("kata sandi saya rahasia123", True),
        ("here is the number 847263", True),
        ("my card is 4111 1111 1111 1111", True),
        ("Let's meet in 2026 at the office", False),
        ("I will not share my password with anyone", False),
        ("That message looks suspicious, I'm reporting it", False),
        ("order 12345 confirmed", False),
    ],
)
def test_scrub_flags(text, should_flag):
    _, found = scrub(text)
    assert bool(found) is should_flag


def test_scrub_removes_the_secret_value():
    red, found = scrub("my otp is 123456 thanks")
    assert "123456" not in red
    assert "otp" in found
    assert red.startswith("my otp is") and red.endswith("thanks")


# ---------- output filter (G8) ----------


def test_output_filter_flags_out_of_scope_and_threats():
    assert any(
        v.startswith("out_of_scope")
        for v in review_draft("Also what's your home address?", "click_link", ["IT"], 1, 4)
    )
    assert any(
        v.startswith("threat")
        for v in review_draft("Do it now or you'll be fired.", "click_link", ["IT"], 1, 4)
    )


def test_output_filter_blocks_code_request_for_non_otp_objective():
    v = review_draft("Please send the verification code.", "click_link", ["IT"], 1, 4)
    assert "out_of_scope:asks_for_code" in v


def test_output_filter_turn_budget_and_identity():
    assert "turn_budget_exceeded" in review_draft("hi", "reply", ["IT"], 5, 4)
    v = review_draft("Hi, this is John Smith from finance.", "reply", ["IT Helpdesk"], 1, 4)
    assert any(x.startswith("identity:") for x in v)


def test_output_filter_passes_clean_on_scope():
    assert (
        review_draft("Just following up on the reset link I sent.", "click_link", ["IT"], 2, 4)
        == []
    )


# ---------- conversation engine ----------


class FakeGateway:
    def __init__(self, reply="Just a gentle reminder to complete the reset.", compliant=False):
        self._reply = reply
        self._compliant = compliant

    async def persona_reply(self, *, system_prompt, history):
        return self._reply

    async def judge_compliance(self, *, objective, message):
        return self._compliant


async def _running_campaign(org=None, objective="click_link", recipients=("bob@acme.test",)):
    cid = str(uuid.uuid4())
    camp = {
        "id": cid,
        "organization_id": org,
        "status": "running",
        "name": "drill",
        "objective": objective,
        "principles": ["authority"],
        "sender_name": "IT Helpdesk",
        "sender_email": "helpdesk@acme.test",
        "subject": "Password reset",
        "body_html": "<p>{{.URL}}</p>",
        "recipients": list(recipients),
        "max_turns": 3,
        "language": "en",
        "killed": False,
    }
    await db.live_config.update_one(
        {"id": "live_config"},
        {
            "$set": {
                "id": "live_config",
                "gophish_base_url": "x",
                "gophish_api_key": "y",
                "phish_url": "z",
                "smtp_host": "mail:25",
            }
        },
        upsert=True,
    )
    await db.live_campaigns.insert_one(dict(camp))
    now = datetime.now(UTC).isoformat()
    for e in recipients:
        await db.live_recipients.insert_one(
            {"campaign_id": cid, "email": e, "state": "sent", "reported": False, "updated_at": now}
        )
    return camp


@pytest.fixture(autouse=True)
def _no_real_mail(monkeypatch):
    sent = []

    async def fake_send(config, **kwargs):
        sent.append(kwargs)
        return "<msgid@test>"

    monkeypatch.setattr(mailer, "send_email", fake_send)
    return sent


async def test_disclosed_secret_is_redacted_and_closes(api, _no_real_mail):
    camp = await _running_campaign()
    r = await conversation.process_inbound(
        camp, "bob@acme.test", "sure, my OTP is 998877", FakeGateway()
    )
    assert r["status"] == "disclosed"

    inbound = await db.live_messages.find_one({"campaign_id": camp["id"], "direction": "inbound"})
    assert "998877" not in inbound["body_redacted"]  # secret never stored
    assert inbound["secrets_found"] == ["otp"]
    rec = await db.live_recipients.find_one({"campaign_id": camp["id"], "email": "bob@acme.test"})
    assert rec["conversation_state"] == "disclosed"
    # teachable moment was sent
    assert any(k["to_address"] == "bob@acme.test" for k in _no_real_mail)


async def test_compliance_closes_as_complied(api):
    camp = await _running_campaign(objective="agree_to_share_otp")
    r = await conversation.process_inbound(
        camp, "bob@acme.test", "ok sure, i'll send it over", FakeGateway(compliant=True)
    )
    assert r["status"] == "complied"
    rec = await db.live_recipients.find_one({"campaign_id": camp["id"], "email": "bob@acme.test"})
    assert rec["conversation_state"] == "complied"


async def test_normal_reply_drafts_pending_review(api):
    camp = await _running_campaign()
    r = await conversation.process_inbound(camp, "bob@acme.test", "who is this?", FakeGateway())
    assert r["status"] == "draft_pending"
    draft = await db.live_messages.find_one(
        {"campaign_id": camp["id"], "direction": "outbound", "status": "draft_pending"}
    )
    assert draft is not None
    rec = await db.live_recipients.find_one({"campaign_id": camp["id"], "email": "bob@acme.test"})
    assert rec["turn"] == 1


async def test_draft_with_violation_is_blocked_not_sent(api):
    camp = await _running_campaign()
    gw = FakeGateway(reply="Reply now or you'll be fired and we'll call the police.")
    r = await conversation.process_inbound(camp, "bob@acme.test", "no thanks", gw)
    assert r["status"] == "blocked"
    assert r["violations"]
    # nothing was auto-sent; the blocked draft is stored for a human
    assert (
        await db.live_messages.count_documents(
            {"campaign_id": camp["id"], "direction": "outbound", "status": "blocked"}
        )
        == 1
    )


async def test_turn_budget_closes_conversation(api):
    camp = await _running_campaign()
    await db.live_recipients.update_one(
        {"campaign_id": camp["id"], "email": "bob@acme.test"}, {"$set": {"turn": 3}}
    )
    r = await conversation.process_inbound(camp, "bob@acme.test", "still here", FakeGateway())
    assert r["status"] == "turn_budget_reached"


async def test_closed_conversation_ignores_further_replies(api):
    camp = await _running_campaign()
    await conversation.process_inbound(camp, "bob@acme.test", "my pin is 4455", FakeGateway())
    r = await conversation.process_inbound(camp, "bob@acme.test", "hello again", FakeGateway())
    assert r["status"] == "conversation_closed"


async def test_unknown_recipient_rejected(api):
    camp = await _running_campaign()
    r = await conversation.process_inbound(camp, "stranger@acme.test", "hi", FakeGateway())
    assert r["status"] == "unknown_recipient"


# ---------- review queue routes ----------


async def _seed_draft(org=None):
    camp = await _running_campaign(org=org)
    draft = {
        "id": str(uuid.uuid4()),
        "campaign_id": camp["id"],
        "organization_id": org,
        "email": "bob@acme.test",
        "direction": "outbound",
        "body_redacted": "Just a reminder to complete the reset.",
        "status": "draft_pending",
        "at": datetime.now(UTC),
    }
    await db.live_messages.insert_one(dict(draft))
    return camp, draft


async def test_review_queue_lists_pending(api):
    _, h = await make_user("trainer", organization_id="o1")
    await _seed_draft(org="o1")
    rows = (await api.get("/api/live/review", headers=h)).json()
    assert len(rows) == 1 and rows[0]["status"] == "draft_pending"


async def test_review_queue_scoped_by_org(api):
    await _seed_draft(org="o1")
    _, other = await make_user("trainer", organization_id="o2")
    assert (await api.get("/api/live/review", headers=other)).json() == []


async def test_approve_sends_and_marks_sent(api, _no_real_mail):
    _, h = await make_user("trainer", organization_id="o1")
    _, draft = await _seed_draft(org="o1")
    r = await api.post(f"/api/live/review/{draft['id']}/approve", json={}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "sent"
    assert any(k["to_address"] == "bob@acme.test" for k in _no_real_mail)
    stored = await db.live_messages.find_one({"id": draft["id"]})
    assert stored["status"] == "sent" and stored["reviewed_by"]


async def test_approve_with_edit_uses_edited_body(api, _no_real_mail):
    _, h = await make_user("trainer", organization_id="o1")
    _, draft = await _seed_draft(org="o1")
    await api.post(
        f"/api/live/review/{draft['id']}/approve", json={"body": "Edited by reviewer."}, headers=h
    )
    assert _no_real_mail[-1]["body"] == "Edited by reviewer."


async def test_discard_draft(api):
    _, h = await make_user("trainer", organization_id="o1")
    _, draft = await _seed_draft(org="o1")
    r = await api.post(f"/api/live/review/{draft['id']}/discard", headers=h)
    assert r.status_code == 200
    stored = await db.live_messages.find_one({"id": draft["id"]})
    assert stored["status"] == "discarded"


async def test_approve_blocked_on_killed_campaign(api):
    _, h = await make_user("trainer", organization_id="o1")
    camp, draft = await _seed_draft(org="o1")
    await db.live_campaigns.update_one({"id": camp["id"]}, {"$set": {"killed": True}})
    r = await api.post(f"/api/live/review/{draft['id']}/approve", json={}, headers=h)
    assert r.status_code == 409


async def test_users_cannot_access_review(api):
    _, h = await make_user("user")
    assert (await api.get("/api/live/review", headers=h)).status_code == 403
