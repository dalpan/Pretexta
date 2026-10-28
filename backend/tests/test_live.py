"""Live campaign guardrail tests (P1): G1-G4, G9-G12."""

from datetime import UTC, datetime, timedelta

import pytest

from services import audit
from services.database import db
from tests.conftest import make_user


def _campaign(**over):
    now = datetime.now(UTC)
    base = {
        "name": "Q4 helpdesk drill",
        "objective": "click_link",
        "principles": ["authority"],
        "sender_name": "IT Helpdesk",
        "sender_email": "helpdesk@acme.test",
        "subject": "Password reset required",
        "body_html": "<p>Reset here: {{.URL}}</p>",
        "recipients": ["alice@acme.test", "bob@acme.test"],
        "starts_at": (now + timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(days=5)).isoformat(),
        "max_turns": 3,
    }
    base.update(over)
    return base


async def _add_sandbox_domain(api, headers, domain="acme.test"):
    r = await api.post("/api/live/domains", json={"domain": domain}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["verified_at"]  # sandbox is verified immediately
    return r.json()


# ---------- access control ----------


async def test_users_cannot_touch_live_api(api):
    _, h = await make_user("user")
    for method, path in [
        ("get", "/api/live/campaigns"),
        ("get", "/api/live/domains"),
        ("post", "/api/live/campaigns"),
        ("get", "/api/audit"),
    ]:
        r = (
            await getattr(api, method)(path, json={}, headers=h)
            if method == "post"
            else await getattr(api, method)(path, headers=h)
        )
        assert r.status_code == 403, path


# ---------- G1: domain verification ----------


async def test_real_domain_needs_dns_then_recipients_gate(api, monkeypatch):
    _, h = await make_user("trainer")
    r = await api.post("/api/live/domains", json={"domain": "corp.example.com"}, headers=h)
    assert r.status_code == 200
    assert r.json()["verified_at"] is None
    assert "corp.example.com" in r.json()["instructions"]

    # Campaign on an unverified real domain fails preflight
    c = _campaign(sender_email="it@corp.example.com", recipients=["x@corp.example.com"])
    r = await api.post("/api/live/campaigns", json=c, headers=h)
    assert any(f["rule"] == "G1" for f in r.json()["preflight"])


async def test_sandbox_domain_allows_submit(api):
    _, approver = await make_user("admin")
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    r = await api.post("/api/live/campaigns", json=_campaign(), headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["preflight"] == []
    cid = r.json()["id"]
    r = await api.post(f"/api/live/campaigns/{cid}/submit", headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "pending_approval"


async def test_recipient_outside_verified_domain_blocked(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    c = _campaign(recipients=["alice@acme.test", "victim@gmail.com"])
    r = await api.post("/api/live/campaigns", json=c, headers=h)
    cid = r.json()["id"]
    r = await api.post(f"/api/live/campaigns/{cid}/submit", headers=h)
    assert r.status_code == 422
    assert any(f["rule"] == "G1" for f in r.json()["detail"]["preflight"])


# ---------- G2: two-person approval ----------


async def test_creator_cannot_approve_own_campaign(api):
    creator, h = await make_user("admin")
    await _add_sandbox_domain(api, h)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=h)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=h)
    r = await api.post(f"/api/live/campaigns/{cid}/approve", headers=h)
    assert r.status_code == 403


async def test_second_admin_can_approve(api):
    _, creator = await make_user("admin")
    _, approver = await make_user("admin")
    await _add_sandbox_domain(api, creator)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=creator)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=creator)
    r = await api.post(f"/api/live/campaigns/{cid}/approve", headers=approver)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


async def test_trainer_cannot_approve(api):
    _, creator = await make_user("admin")
    _, trainer = await make_user("trainer")
    await _add_sandbox_domain(api, creator)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=creator)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=creator)
    r = await api.post(f"/api/live/campaigns/{cid}/approve", headers=trainer)
    assert r.status_code == 403


# ---------- G3: window ----------


@pytest.mark.parametrize(
    "over",
    [
        {"ends_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
        {
            "starts_at": datetime.now(UTC).isoformat(),
            "ends_at": (datetime.now(UTC) + timedelta(days=45)).isoformat(),
        },
    ],
)
async def test_bad_windows_blocked(api, over):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    r = await api.post("/api/live/campaigns", json=_campaign(**over), headers=h)
    assert any(f["rule"] == "G3" for f in r.json()["preflight"])


# ---------- G4: kill switch ----------


async def test_kill_switch_halts_active_and_blocks_approval(api):
    _, creator = await make_user("admin")
    _, approver = await make_user("admin")
    await _add_sandbox_domain(api, creator)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=creator)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=creator)

    r = await api.post("/api/live/kill-switch", json={"engaged": True}, headers=approver)
    assert r.json()["campaigns_killed"] == 1
    assert (await db.live_campaigns.find_one({"id": cid}))["status"] == "killed"

    # A fresh campaign cannot be approved while the switch is engaged
    cid2 = (await api.post("/api/live/campaigns", json=_campaign(), headers=creator)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid2}/submit", headers=creator)
    r = await api.post(f"/api/live/campaigns/{cid2}/approve", headers=approver)
    assert r.status_code == 423


async def test_trainer_cannot_toggle_kill_switch(api):
    _, h = await make_user("trainer")
    r = await api.post("/api/live/kill-switch", json={"engaged": True}, headers=h)
    assert r.status_code == 403


# ---------- G9 / G10: content ----------


@pytest.mark.parametrize(
    "over,rule",
    [
        ({"subject": "Your year-end bonus"}, "G9"),
        ({"body_html": "Notice of PHK (layoff) {{.URL}}"}, "G9"),
        ({"subject": "PayPal security alert"}, "G10"),
        ({"body_html": "Update your NPWP at pajak.go.id {{.URL}}"}, "G10"),
    ],
)
async def test_blocked_content(api, over, rule):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    r = await api.post("/api/live/campaigns", json=_campaign(**over), headers=h)
    assert any(f["rule"] == rule and f["level"] == "error" for f in r.json()["preflight"])


async def test_brand_override_downgrades_to_warning(api):
    _, creator = await make_user("admin")
    _, approver = await make_user("admin")
    await _add_sandbox_domain(api, creator)
    c = _campaign(
        subject="PayPal invoice", brand_override_reason="Written authz from PayPal legal #123"
    )
    cid = (await api.post("/api/live/campaigns", json=c, headers=creator)).json()["id"]
    r = await api.post(f"/api/live/campaigns/{cid}/submit", headers=creator)
    assert r.status_code == 200  # warning does not block
    r = await api.post(f"/api/live/campaigns/{cid}/approve", headers=approver)
    assert r.status_code == 200


# ---------- G11: exclusions ----------


async def test_excluded_recipient_is_flagged(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    await api.post("/api/live/exclusions", json={"emails": ["alice@acme.test"]}, headers=h)
    r = await api.post("/api/live/campaigns", json=_campaign(), headers=h)
    assert any(f["rule"] == "G11" for f in r.json()["preflight"])


async def test_all_excluded_blocks_submit(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    await api.post(
        "/api/live/exclusions",
        json={"emails": ["alice@acme.test", "bob@acme.test"]},
        headers=h,
    )
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=h)).json()["id"]
    r = await api.post(f"/api/live/campaigns/{cid}/submit", headers=h)
    assert r.status_code == 422


# ---------- exclusions are per organization ----------


async def test_exclusions_scoped_to_org(api):
    _, a = await make_user("trainer", organization_id="org-a")
    _, b = await make_user("trainer", organization_id="org-b")
    await api.post("/api/live/exclusions", json={"emails": ["x@acme.test"]}, headers=a)
    assert (await api.get("/api/live/exclusions", headers=b)).json() == []


# ---------- G12: audit chain ----------


async def test_audit_chain_records_and_verifies(api):
    _, creator = await make_user("admin")
    _, approver = await make_user("admin")
    await _add_sandbox_domain(api, creator)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=creator)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=creator)
    await api.post(f"/api/live/campaigns/{cid}/approve", headers=approver)

    r = await api.get("/api/audit/verify", headers=approver)
    assert r.json() == {"ok": True, "entries": r.json()["entries"], "broken_at": None}
    actions = {e["action"] for e in (await api.get("/api/audit", headers=approver)).json()}
    assert {"live.campaign.create", "live.campaign.submit", "live.campaign.approve"} <= actions


async def test_audit_chain_detects_tampering(api):
    await audit.record("u1", "live.test.a")
    await audit.record("u1", "live.test.b")
    await audit.record("u1", "live.test.c")
    await db.audit_log.update_one({"seq": 2}, {"$set": {"action": "live.test.TAMPERED"}})
    result = await audit.verify_chain()
    assert result["ok"] is False
    assert result["broken_at"] == 2


async def test_audit_chain_detects_deletion(api):
    await audit.record("u1", "a")
    await audit.record("u1", "b")
    await db.audit_log.delete_one({"seq": 2})
    result = await audit.verify_chain()
    assert result["ok"] is False


# ---------- content filter evasion (defense in depth) ----------


@pytest.mark.parametrize(
    "over",
    [
        {"subject": "PayP<b></b>al alert"},  # tag-split brand
        {"subject": "Your &#112;aypal account"},  # HTML-entity brand
        {"body_html": "year-end b&#111;nus {{.URL}}"},  # entity-encoded theme
    ],
)
async def test_content_filter_resists_simple_evasion(api, over):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    r = await api.post("/api/live/campaigns", json=_campaign(**over), headers=h)
    assert any(f["level"] == "error" for f in r.json()["preflight"]), r.json()["preflight"]


async def test_list_campaigns_omits_recipients(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    await api.post("/api/live/campaigns", json=_campaign(), headers=h)
    rows = (await api.get("/api/live/campaigns", headers=h)).json()
    assert rows and "recipients" not in rows[0] and "body_html" not in rows[0]
    assert rows[0]["recipient_count"] == 2


# ---------- phishing templates ----------


async def test_live_templates_seeded_and_listed(api):
    from services.live.launch import seed_templates

    await seed_templates()
    _, h = await make_user("trainer")
    rows = (await api.get("/api/live/templates", headers=h)).json()
    assert len(rows) >= 3
    t = rows[0]
    assert {"id", "name", "objective", "subject", "body_html", "principles"} <= set(t)
    assert "{{.URL}}" in t["body_html"] or t["objective"] == "reply"


async def test_templates_require_trainer(api):
    _, h = await make_user("user")
    assert (await api.get("/api/live/templates", headers=h)).status_code == 403


# ---------- delete campaign ----------


async def test_delete_draft_campaign_cascades(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=h)).json()["id"]
    # leave a recipient + event behind to prove the cascade
    await db.live_recipients.insert_one({"campaign_id": cid, "email": "x@acme.test"})
    await db.live_events.insert_one(
        {"campaign_id": cid, "type": "clicked", "at": datetime.now(UTC)}
    )

    r = await api.delete(f"/api/live/campaigns/{cid}", headers=h)
    assert r.status_code == 200 and r.json()["deleted"] == cid
    assert await db.live_campaigns.find_one({"id": cid}) is None
    assert await db.live_recipients.count_documents({"campaign_id": cid}) == 0
    assert await db.live_events.count_documents({"campaign_id": cid}) == 0


async def test_cannot_delete_active_campaign(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=h)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=h)  # -> pending_approval
    r = await api.delete(f"/api/live/campaigns/{cid}", headers=h)
    assert r.status_code == 409
    assert await db.live_campaigns.find_one({"id": cid}) is not None  # still there


async def test_killed_campaign_can_be_deleted(api):
    _, h = await make_user("trainer")
    await _add_sandbox_domain(api, h)
    cid = (await api.post("/api/live/campaigns", json=_campaign(), headers=h)).json()["id"]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=h)
    await api.post(f"/api/live/campaigns/{cid}/kill", headers=h)
    assert (await api.delete(f"/api/live/campaigns/{cid}", headers=h)).status_code == 200


async def test_delete_campaign_requires_staff(api):
    _, h = await make_user("user")
    assert (await api.delete("/api/live/campaigns/whatever", headers=h)).status_code == 403


# ---------- live analytics ----------


async def test_live_analytics(api):
    _, h = await make_user("admin")
    for cid, launched in [("a1", "2026-01-01T00:00:00+00:00"), ("a2", "2026-02-01T00:00:00+00:00")]:
        await db.live_campaigns.insert_one(
            {
                "id": cid,
                "organization_id": None,
                "status": "closed",
                "name": cid,
                "launched_at": launched,
                "objective": "click_link",
            }
        )
    await db.live_recipients.insert_many(
        [
            {
                "campaign_id": "a1",
                "email": "x@acme.test",
                "state": "email_opened",
                "reported": True,
            },
            {
                "campaign_id": "a1",
                "email": "repeat@acme.test",
                "state": "clicked",
                "reported": False,
            },
            {
                "campaign_id": "a2",
                "email": "repeat@acme.test",
                "state": "clicked",
                "reported": False,
            },
            {
                "campaign_id": "a2",
                "email": "y@acme.test",
                "state": "email_opened",
                "reported": True,
            },
        ]
    )
    d = (await api.get("/api/live/analytics", headers=h)).json()
    assert d["overall"]["campaigns"] == 2
    assert d["overall"]["recipients"] == 4 and d["overall"]["reported"] == 2
    assert d["overall"]["report_rate"] == 0.5
    # campaigns sorted oldest -> newest (the trend)
    assert [c["id"] for c in d["campaigns"]] == ["a1", "a2"]
    # repeat@ clicked in both campaigns -> the one repeat offender
    assert len(d["repeat_offenders"]) == 1
    assert d["repeat_offenders"][0]["email"] == "repeat@acme.test"
    assert d["repeat_offenders"][0]["count"] == 2


async def test_live_analytics_requires_staff(api):
    _, h = await make_user("user")
    assert (await api.get("/api/live/analytics", headers=h)).status_code == 403
