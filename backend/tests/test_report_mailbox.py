"""Report mailbox: forwarded reports are parsed, classified and credited."""

from email.message import EmailMessage

from services import report_inbox
from services.database import db
from services.live import inbound
from tests.conftest import make_user

LURE_FROM = "IT Helpdesk <helpdesk@acme.test>"
LURE_SUBJECT = "Action required: verify your mailbox"


async def _campaign_with_recipient(org="acme", email="davan@acme.test"):
    await db.live_campaigns.insert_one(
        {
            "id": "camp-1",
            "organization_id": org,
            "status": "running",
            "sender_email": "helpdesk@acme.test",
            "subject": LURE_SUBJECT,
        }
    )
    await db.live_recipients.insert_one(
        {"campaign_id": "camp-1", "email": email, "reported": False}
    )


def _inline_forward(reporter="Davan <davan@acme.test>") -> bytes:
    msg = EmailMessage()
    msg["From"] = reporter
    msg["To"] = "lapor@acme.test"
    msg["Subject"] = f"Fwd: {LURE_SUBJECT}"
    msg.set_content(
        "Ini mencurigakan.\n\n"
        "-------- Forwarded Message --------\n"
        f"Subject: {LURE_SUBJECT}\n"
        f"From: {LURE_FROM}\n"
        "To: davan@acme.test\n\n"
        "Please verify your mailbox here.\n"
    )
    return msg.as_bytes()


def _attached_forward() -> bytes:
    original = EmailMessage()
    original["From"] = LURE_FROM
    original["To"] = "davan@acme.test"
    original["Subject"] = LURE_SUBJECT
    original.set_content("Please verify your mailbox here.")
    msg = EmailMessage()
    msg["From"] = "davan@acme.test"
    msg["To"] = "lapor@acme.test"
    msg["Subject"] = "Laporan phishing"
    msg.set_content("Lihat lampiran.")
    msg.add_attachment(original)
    return msg.as_bytes()


# ---------- parsing ----------


def test_parse_inline_forward_finds_original_sender_and_subject():
    parsed = inbound.parse_report(_inline_forward())
    assert parsed["reporter_email"] == "davan@acme.test"
    assert parsed["from_address"] == "helpdesk@acme.test"
    assert parsed["subject"] == LURE_SUBJECT


def test_parse_forward_as_attachment_reads_inner_message():
    parsed = inbound.parse_report(_attached_forward())
    assert parsed["reporter_email"] == "davan@acme.test"
    assert parsed["from_address"] == "helpdesk@acme.test"
    assert parsed["subject"] == LURE_SUBJECT


def test_parse_html_only_forward():
    msg = EmailMessage()
    msg["From"] = "davan@acme.test"
    msg["Subject"] = f"Fwd: {LURE_SUBJECT}"
    msg.set_content(
        "<div>Cek ini</div><p>From: IT Helpdesk &lt;helpdesk@acme.test&gt;</p><p>verify</p>",
        subtype="html",
    )
    parsed = inbound.parse_report(msg.as_bytes())
    assert parsed["from_address"] == "helpdesk@acme.test"


# ---------- ingest through the mailbox path ----------


async def test_mailbox_report_credits_reporter_under_campaign_org(api):
    await _campaign_with_recipient()
    report = await report_inbox.ingest_report(None, **inbound.parse_report(_inline_forward()))
    assert report["verdict"] == "simulation" and report["credited"] is True
    assert report["organization_id"] == "acme"
    rec = await db.live_recipients.find_one({"campaign_id": "camp-1"})
    assert rec["reported"] is True


async def _configure(**over):
    await db.live_config.insert_one(
        {
            "id": "live_config",
            "imap_host": "greenmail:3143",
            "imap_user": "sim-reply@acme.test",
            "report_imap_user": "lapor@acme.test",
            **over,
        }
    )


async def test_poll_reports_without_mailbox(api):
    assert (await inbound.poll_reports_once())["reason"] == "report_mailbox_not_configured"
    await _configure(report_imap_user="")
    assert (await inbound.poll_reports_once())["reason"] == "report_mailbox_not_configured"


async def test_poll_reports_ingests_and_advances_watermark(api, monkeypatch):
    await _campaign_with_recipient()
    await _configure()
    calls = []

    def fake_fetch(config, user, password, last_uid, uidvalidity):
        calls.append(user)
        if last_uid:
            return [], 7, last_uid
        return [_inline_forward(), _inline_forward("Lapor <lapor@acme.test>")], 7, 2

    monkeypatch.setattr(inbound, "_fetch_new", fake_fetch)
    result = await inbound.poll_reports_once()
    assert calls == ["lapor@acme.test"]
    # The mailbox's own message (e.g. an auto-reply) is not a report.
    assert result["outcomes"] == {"credited": 1, "skipped": 1}
    assert (await db.live_state.find_one({"id": "report_imap_watermark"}))["last_uid"] == 2

    again = await inbound.poll_reports_once()
    assert again["polled"] == 0
    assert await db.phish_reports.count_documents({}) == 1


# ---------- API ----------


async def test_mailbox_endpoint_shows_address_to_staff(api):
    _, trainer = await make_user("trainer")
    assert (await api.get("/api/report-inbox/mailbox", headers=trainer)).json() == {
        "address": None,
        "configured": False,
    }
    await _configure()
    got = (await api.get("/api/report-inbox/mailbox", headers=trainer)).json()
    assert got == {"address": "lapor@acme.test", "configured": True}
    _, user = await make_user("user")
    assert (await api.get("/api/report-inbox/mailbox", headers=user)).status_code == 403
    assert (await api.post("/api/report-inbox/poll", headers=user)).status_code == 403


async def test_report_mailbox_must_differ_from_reply_mailbox(api):
    _, admin = await make_user("admin")
    base = {
        "gophish_base_url": "https://gp:3333",
        "gophish_api_key": "k",
        "phish_url": "http://phish",
        "smtp_host": "mail:25",
        "imap_host": "greenmail:3143",
        "imap_user": "sim-reply@acme.test",
    }
    r = await api.put(
        "/api/live/config", headers=admin, json={**base, "report_imap_user": "SIM-REPLY@acme.test"}
    )
    assert r.status_code == 400
    r = await api.put(
        "/api/live/config",
        headers=admin,
        json={**base, "report_imap_user": "lapor@acme.test", "report_imap_password": "pw"},
    )
    assert r.status_code == 200
    got = (await api.get("/api/live/config", headers=admin)).json()
    assert got["report_imap_user"] == "lapor@acme.test" and got["report_imap_password"] == "***"


async def test_reused_sender_credits_the_campaign_the_reporter_received(api):
    # An older campaign with the same sender and subject that the reporter
    # already reported, and a newer running one they have not.
    await db.live_campaigns.insert_many(
        [
            {
                "id": "old",
                "organization_id": "acme",
                "status": "killed",
                "sender_email": "helpdesk@acme.test",
                "subject": LURE_SUBJECT,
                "created_at": "2026-10-26T10:00:00+00:00",
            },
            {
                "id": "new",
                "organization_id": "acme",
                "status": "running",
                "sender_email": "helpdesk@acme.test",
                "subject": LURE_SUBJECT,
                "created_at": "2026-10-30T10:00:00+00:00",
            },
            {
                "id": "other",
                "organization_id": "acme",
                "status": "running",
                "sender_email": "helpdesk@acme.test",
                "subject": LURE_SUBJECT,
                "created_at": "2026-10-31T10:00:00+00:00",
            },
        ]
    )
    await db.live_recipients.insert_many(
        [
            {"campaign_id": "old", "email": "davan@acme.test", "reported": True},
            {"campaign_id": "new", "email": "davan@acme.test", "reported": False},
            {"campaign_id": "other", "email": "someone@acme.test", "reported": False},
        ]
    )
    report = await report_inbox.ingest_report(None, **inbound.parse_report(_inline_forward()))
    assert report["campaign_id"] == "new" and report["credited"] is True
