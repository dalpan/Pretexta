"""Report-Phish mailbox: classification, reporter credit, triage, API."""

from services import report_inbox
from services.database import db
from tests.conftest import make_user


async def _campaign(org="acme", **over):
    doc = {
        "id": over.get("id", "camp-1"),
        "organization_id": org,
        "status": "running",
        "sender_email": "it-helpdesk@acme-support.net",
        "subject": "Action required: mailbox will be locked",
        "name": "Helpdesk lure",
    }
    doc.update(over)
    await db.live_campaigns.insert_one(doc)
    return doc


# ---------- classification ----------


async def test_report_matching_sender_is_a_simulation(api):
    await _campaign()
    v, cid = await report_inbox.classify(
        {"organization_id": "acme"}, "Fwd: something", "it-helpdesk@acme-support.net", "body"
    )
    assert v == "simulation" and cid == "camp-1"


async def test_report_matching_subject_is_a_simulation(api):
    await _campaign()
    v, cid = await report_inbox.classify(
        {"organization_id": "acme"},
        "FW: Action required: mailbox will be locked",
        "someone@else.test",
        "",
    )
    assert v == "simulation" and cid == "camp-1"


async def test_sender_mentioned_in_body_is_a_simulation(api):
    await _campaign()
    v, cid = await report_inbox.classify(
        {"organization_id": "acme"},
        "Fwd: weird email",
        "",
        "From: it-helpdesk@acme-support.net ...",
    )
    assert v == "simulation" and cid == "camp-1"


async def test_unrelated_report_needs_review(api):
    await _campaign()
    v, cid = await report_inbox.classify(
        {"organization_id": "acme"}, "Fwd: invoice", "accounts@real-vendor.com", "please pay"
    )
    assert v == "needs_review" and cid is None


# ---------- ingest + reporter credit ----------


async def test_ingesting_a_simulation_credits_the_reporter(api):
    await _campaign()
    await db.live_recipients.insert_one(
        {"campaign_id": "camp-1", "email": "alice@acme.test", "reported": False}
    )
    report = await report_inbox.ingest_report(
        "acme", "alice@acme.test", "Fwd: Action required: mailbox will be locked"
    )
    assert report["verdict"] == "simulation" and report["credited"] is True
    rec = await db.live_recipients.find_one({"campaign_id": "camp-1", "email": "alice@acme.test"})
    assert rec["reported"] is True
    assert await db.live_events.count_documents({"campaign_id": "camp-1", "type": "reported"}) == 1


async def test_credit_is_idempotent(api):
    await _campaign()
    await db.live_recipients.insert_one(
        {"campaign_id": "camp-1", "email": "bob@acme.test", "reported": False}
    )
    await report_inbox.ingest_report(
        "acme", "bob@acme.test", "FW: Action required: mailbox will be locked"
    )
    second = await report_inbox.ingest_report(
        "acme", "bob@acme.test", "FW: Action required: mailbox will be locked"
    )
    assert second["credited"] is False  # already credited
    assert await db.live_events.count_documents({"campaign_id": "camp-1", "type": "reported"}) == 1


async def test_secret_in_forwarded_body_is_scrubbed(api):
    await _campaign()
    report = await report_inbox.ingest_report(
        "acme",
        "carol@acme.test",
        "Fwd: suspicious",
        body="my password is Hunter2 and card 4111111111111111",
    )
    assert "4111111111111111" not in report["body_excerpt"]


# ---------- API ----------


async def test_report_inbox_requires_staff(api):
    _, h = await make_user("user")
    assert (await api.get("/api/report-inbox", headers=h)).status_code == 403


async def test_ingest_and_list_and_stats(api):
    _, admin = await make_user("admin")
    await _campaign(org=None)  # admin sees all; org None
    r = await api.post(
        "/api/report-inbox/ingest",
        headers=admin,
        json={
            "reporter_email": "dan@acme.test",
            "subject": "Fwd: Action required: mailbox will be locked",
        },
    )
    assert r.status_code == 201 and r.json()["verdict"] == "simulation"
    listed = (await api.get("/api/report-inbox", headers=admin)).json()
    assert len(listed) == 1
    stats = (await api.get("/api/report-inbox/stats", headers=admin)).json()
    assert stats["total"] == 1 and stats["simulation"] == 1


async def test_triage_reclassifies(api):
    _, admin = await make_user("admin")
    rep = await report_inbox.ingest_report(
        None, "e@acme.test", "Fwd: random", "stranger@x.test", "hi"
    )
    rid = rep["id"]
    r = await api.patch(f"/api/report-inbox/{rid}", headers=admin, json={"verdict": "threat"})
    assert r.status_code == 200
    doc = await db.phish_reports.find_one({"id": rid})
    assert doc["verdict"] == "threat"
    bad = await api.patch(f"/api/report-inbox/{rid}", headers=admin, json={"verdict": "nonsense"})
    assert bad.status_code == 422


async def test_leaderboard_ranks_by_simulations_caught(api):
    _, admin = await make_user("admin")
    await _campaign(org=None)
    await report_inbox.ingest_report(
        None, "top@acme.test", "Fwd: Action required: mailbox will be locked"
    )
    await report_inbox.ingest_report(
        None, "top@acme.test", "Fwd: Action required: mailbox will be locked"
    )
    await report_inbox.ingest_report(None, "low@acme.test", "Fwd: not ours", "x@y.test", "")
    board = (await api.get("/api/report-inbox/leaderboard", headers=admin)).json()
    assert board[0]["reporter_email"] == "top@acme.test"
    assert board[0]["simulations_caught"] == 2
