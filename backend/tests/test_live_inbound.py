"""P3 plumbing: IMAP reply parsing and routing."""

import uuid
from datetime import UTC, datetime
from email.message import EmailMessage

from services.database import db
from services.live import inbound, mailer

# ---------- pure parsing ----------


def test_parse_token_from_plus_address():
    assert inbound.parse_token("IT Replies <sim+abc123XYZ@acme.test>") == "abc123XYZ"
    assert inbound.parse_token(None, "sim+tok456aa@x.test") == "tok456aa"
    assert inbound.parse_token("plain@acme.test") is None


def test_sender_address_normalized():
    assert inbound.sender_address('"Bob" <BOB@Acme.test>') == "bob@acme.test"
    assert inbound.sender_address("") is None


def test_strip_quoted_removes_history():
    body = (
        "No thanks, this looks like phishing.\n"
        "\n"
        "On Mon, 1 Dec 2026, IT Helpdesk wrote:\n"
        "> Please reset your password\n"
        "> urgently\n"
    )
    assert inbound.strip_quoted(body) == "No thanks, this looks like phishing."


def test_strip_quoted_handles_caret_without_header():
    assert inbound.strip_quoted("real text\n> quoted") == "real text"


def test_extract_body_multipart_prefers_plain():
    msg = EmailMessage()
    msg["From"] = "bob@acme.test"
    msg.set_content("plain version")
    msg.add_alternative("<p>html version</p>", subtype="html")
    assert "plain version" in inbound.extract_body(msg)


# ---------- routing ----------


class FakeGateway:
    async def persona_reply(self, *, system_prompt, history):
        return "A gentle follow-up."

    async def judge_compliance(self, *, objective, message):
        return False


async def _running_campaign(reply_token="tok12345678"):
    cid = str(uuid.uuid4())
    camp = {
        "id": cid,
        "organization_id": None,
        "status": "running",
        "name": "drill",
        "objective": "click_link",
        "principles": ["authority"],
        "sender_name": "IT Helpdesk",
        "sender_email": "helpdesk@acme.test",
        "subject": "Reset",
        "body_html": "<p>x</p>",
        "recipients": ["bob@acme.test"],
        "max_turns": 3,
        "language": "en",
        "killed": False,
        "reply_token": reply_token,
    }
    await db.live_campaigns.insert_one(dict(camp))
    await db.live_config.update_one(
        {"id": "live_config"},
        {
            "$set": {
                "id": "live_config",
                "smtp_host": "mail:25",
                "gophish_base_url": "x",
                "gophish_api_key": "y",
                "phish_url": "z",
            }
        },
        upsert=True,
    )
    await db.live_recipients.insert_one(
        {
            "campaign_id": cid,
            "email": "bob@acme.test",
            "state": "sent",
            "reported": False,
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )
    return camp


def _raw_reply(token, from_addr, body):
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = f"sim+{token}@acme.test"
    msg["Subject"] = "Re: Reset"
    msg.set_content(body)
    return msg.as_bytes()


async def test_route_message_dispatches_to_engine(api, monkeypatch):
    await _running_campaign()

    async def fake_send(config, **kwargs):
        return "<id@test>"

    monkeypatch.setattr(mailer, "send_email", fake_send)
    raw = _raw_reply("tok12345678", "Bob <bob@acme.test>", "who is this?")
    result = await inbound.route_message(raw, gateway=FakeGateway())
    assert result["status"] == "draft_pending"


async def test_route_message_redacts_secret_from_real_email(api, monkeypatch):
    camp = await _running_campaign()

    async def fake_send(config, **kwargs):
        return "<id@test>"

    monkeypatch.setattr(mailer, "send_email", fake_send)
    raw = _raw_reply("tok12345678", "bob@acme.test", "fine, my otp is 334455")
    result = await inbound.route_message(raw, gateway=FakeGateway())
    assert result["status"] == "disclosed"
    inb = await db.live_messages.find_one({"campaign_id": camp["id"], "direction": "inbound"})
    assert "334455" not in inb["body_redacted"]


async def test_route_message_unknown_token(api):
    await _running_campaign()
    # A stranger (not a recipient) with a bad token matches nothing.
    raw = _raw_reply("nosuchtoken", "stranger@elsewhere.test", "hi")
    assert (await inbound.route_message(raw))["status"] == "unknown_campaign"


async def test_route_message_no_token(api):
    msg = EmailMessage()
    msg["From"] = "bob@acme.test"
    msg["To"] = "plain@acme.test"
    msg.set_content("hi")
    # No token and no matching recipient -> unknown campaign
    assert (await inbound.route_message(msg.as_bytes()))["status"] == "unknown_campaign"


async def test_route_message_matches_by_sender_without_token(api):
    from email.message import EmailMessage

    await _running_campaign()
    msg = EmailMessage()
    msg["From"] = "Bob <bob@acme.test>"
    msg["To"] = "helpdesk@acme.test"  # replied to the sender address, no token
    msg["Subject"] = "Re: Reset"
    msg.set_content("who is this?")
    result = await inbound.route_message(msg.as_bytes(), gateway=FakeGateway())
    assert result["status"] == "draft_pending"


async def test_poll_once_without_config(api):
    assert (await inbound.poll_once())["reason"] == "imap_not_configured"
