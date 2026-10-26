"""P2: GoPhish adapter, launch/sync orchestration, and config handling."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from services.database import db
from services.live import launch as launch_svc
from services.live.gophish import GophishClient, GophishError
from tests.conftest import make_user


def _campaign_payload(**over):
    now = datetime.now(UTC)
    base = {
        "name": "Q4 drill",
        "objective": "click_link",
        "principles": ["authority"],
        "sender_name": "IT Helpdesk",
        "sender_email": "helpdesk@acme.test",
        "subject": "Password reset",
        "body_html": "<p>Reset: {{.URL}}</p>",
        "recipients": ["alice@acme.test", "bob@acme.test"],
        "starts_at": (now + timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(days=5)).isoformat(),
        "max_turns": 2,
    }
    base.update(over)
    return base


async def _approved_campaign(api):
    _, creator = await make_user("admin")
    _, approver = await make_user("admin")
    await api.post("/api/live/domains", json={"domain": "acme.test"}, headers=creator)
    cid = (await api.post("/api/live/campaigns", json=_campaign_payload(), headers=creator)).json()[
        "id"
    ]
    await api.post(f"/api/live/campaigns/{cid}/submit", headers=creator)
    await api.post(f"/api/live/campaigns/{cid}/approve", headers=approver)
    return cid, creator, approver


async def _set_config():
    await db.live_config.update_one(
        {"id": "live_config"},
        {
            "$set": {
                "id": "live_config",
                "gophish_base_url": "https://gophish.local:3333",
                "gophish_api_key": "secret-key",
                "verify_tls": False,
                "phish_url": "http://phish.acme.test",
                "smtp_host": "mail:1025",
                "smtp_password": "smtp-secret",
            }
        },
        upsert=True,
    )


class FakeGophish:
    """Stand-in for GophishClient; records calls, returns canned results.

    results_payload and deleted are class-level because each call site builds a
    fresh client (launch and sync use different instances), yet a test needs
    them to share the canned GoPhish state.
    """

    instances: list["FakeGophish"] = []
    results_payload: dict = {"status": "In progress", "results": [], "timeline": []}
    deleted: list = []

    def __init__(self, *a, **k):
        self.created = {}
        FakeGophish.instances.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def ping(self):
        return True

    async def create_group(self, name, targets):
        self.created["group"] = {"name": name, "targets": targets}
        return {"id": 1}

    async def create_template(self, name, subject, html, text=""):
        self.created["template"] = {"subject": subject, "html": html}
        return {"id": 1}

    async def create_page(self, name, html, redirect_url=""):
        self.created["page"] = {"html": html}
        return {"id": 1, "capture_credentials": False, "capture_passwords": False}

    async def create_smtp(self, name, host, from_address, username="", password="", headers=None):
        self.created["smtp"] = {"host": host, "from_address": from_address, "headers": headers}
        return {"id": 1}

    async def launch_campaign(self, name, template, page, smtp, url, groups):
        self.created["campaign"] = {"url": url, "groups": groups}
        return {"id": 4242, "status": "In progress"}

    async def campaign_results(self, campaign_id):
        return self.results_payload

    async def delete_campaign(self, campaign_id):
        self.deleted.append(campaign_id)


@pytest.fixture
def fake_gophish(monkeypatch):
    FakeGophish.instances = []
    FakeGophish.deleted = []
    FakeGophish.results_payload = {"status": "In progress", "results": [], "timeline": []}
    monkeypatch.setattr(launch_svc, "GophishClient", FakeGophish)
    import routes.live as live_routes

    monkeypatch.setattr(live_routes, "GophishClient", FakeGophish)
    return FakeGophish


# ---------- G5: the client refuses a capturing page ----------


async def test_create_page_rejects_capture(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        # GoPhish coerces capture_credentials on when passwords are captured
        return httpx.Response(
            201, json={"id": 1, "capture_credentials": True, "capture_passwords": True}
        )

    client = GophishClient("https://gp.local", "k")
    client._client = httpx.AsyncClient(
        base_url="https://gp.local", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(GophishError, match="captures input"):
        await client.create_page("p", "<html></html>")
    await client.aclose()


async def test_create_page_accepts_non_capturing(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            201, json={"id": 1, "capture_credentials": False, "capture_passwords": False}
        )

    client = GophishClient("https://gp.local", "k")
    client._client = httpx.AsyncClient(
        base_url="https://gp.local", transport=httpx.MockTransport(handler)
    )
    page = await client.create_page("p", "<html></html>")
    assert page["id"] == 1
    await client.aclose()


# ---------- launch ----------


async def test_launch_requires_approved_status(api, fake_gophish):
    await _set_config()
    _, h = await make_user("admin")
    await api.post("/api/live/domains", json={"domain": "acme.test"}, headers=h)
    cid = (await api.post("/api/live/campaigns", json=_campaign_payload(), headers=h)).json()["id"]
    r = await api.post(f"/api/live/campaigns/{cid}/launch", headers=h)
    assert r.status_code == 409  # still a draft


async def test_launch_creates_gophish_objects_and_recipients(api, fake_gophish):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)
    r = await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    assert r.status_code == 200, r.text
    assert r.json()["gophish_campaign_id"] == 4242

    camp = await db.live_campaigns.find_one({"id": cid})
    assert camp["status"] == "running"
    assert await db.live_recipients.count_documents({"campaign_id": cid}) == 2

    fake = fake_gophish.instances[-1]
    assert fake.created["smtp"]["from_address"] == "helpdesk@acme.test"
    assert fake.created["smtp"]["headers"] == [
        {"key": "From", "value": "IT Helpdesk <helpdesk@acme.test>"}
    ]
    assert "simulated phishing test" in fake.created["page"]["html"].lower()


async def test_launch_filters_excluded_recipients(api, fake_gophish):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)
    await api.post("/api/live/exclusions", json={"emails": ["bob@acme.test"]}, headers=creator)
    r = await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    assert r.status_code == 200
    emails = {d["email"] for d in await db.live_recipients.find({"campaign_id": cid}).to_list(10)}
    assert emails == {"alice@acme.test"}


async def test_launch_blocked_by_kill_switch(api, fake_gophish):
    await _set_config()
    cid, creator, approver = await _approved_campaign(api)
    await api.post("/api/live/kill-switch", json={"engaged": True}, headers=approver)
    # The switch kills the approved campaign, so a launch attempt is refused.
    r = await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    assert r.status_code in (409, 423)
    assert not FakeGophish.instances  # nothing was ever sent


async def test_launch_failure_rolls_back_to_approved(api, fake_gophish, monkeypatch):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)

    async def boom(*a, **k):
        raise GophishError("down")

    monkeypatch.setattr(launch_svc, "launch_campaign", boom)
    r = await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    assert r.status_code == 502
    assert (await db.live_campaigns.find_one({"id": cid}))["status"] == "approved"


# ---------- sync ----------


async def test_sync_maps_statuses_and_records_events(api, fake_gophish):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)
    await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)

    fake_gophish.results_payload = {
        "status": "In progress",
        "results": [
            {"email": "alice@acme.test", "status": "Clicked Link", "reported": False},
            {"email": "bob@acme.test", "status": "Email Sent", "reported": True},
        ],
    }
    r = await api.post(f"/api/live/campaigns/{cid}/sync", headers=creator)
    assert r.json()["synced"] == 2

    alice = await db.live_recipients.find_one({"campaign_id": cid, "email": "alice@acme.test"})
    bob = await db.live_recipients.find_one({"campaign_id": cid, "email": "bob@acme.test"})
    assert alice["state"] == "clicked"
    assert bob["reported"] is True
    types = {e["type"] for e in await db.live_events.find({"campaign_id": cid}).to_list(20)}
    assert {"clicked", "sent", "reported"} <= types


async def test_sync_only_advances_state(api, fake_gophish):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)
    await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    fake_gophish.results_payload = {
        "results": [{"email": "alice@acme.test", "status": "Clicked Link"}]
    }
    await api.post(f"/api/live/campaigns/{cid}/sync", headers=creator)
    # A later poll reporting only "Email Opened" must not downgrade clicked
    fake_gophish.results_payload = {
        "results": [{"email": "alice@acme.test", "status": "Email Opened"}]
    }
    r = await api.post(f"/api/live/campaigns/{cid}/sync", headers=creator)
    assert r.json()["synced"] == 0
    alice = await db.live_recipients.find_one({"campaign_id": cid, "email": "alice@acme.test"})
    assert alice["state"] == "clicked"


async def test_results_report_rate(api, fake_gophish):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)
    await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    fake_gophish.results_payload = {
        "results": [
            {"email": "alice@acme.test", "status": "Clicked Link", "reported": True},
            {"email": "bob@acme.test", "status": "Email Sent", "reported": False},
        ]
    }
    await api.post(f"/api/live/campaigns/{cid}/sync", headers=creator)
    metrics = (await api.get(f"/api/live/campaigns/{cid}/results", headers=creator)).json()[
        "metrics"
    ]
    assert metrics["recipients"] == 2
    assert metrics["reported"] == 1
    assert metrics["report_rate"] == 0.5
    assert metrics["click_rate"] == 0.5  # alice clicked
    # One recipient reported after launch, so a median time-to-report is available.
    assert metrics["median_time_to_report_min"] is not None
    assert metrics["median_time_to_report_min"] >= 0


# ---------- kill stops GoPhish ----------


async def test_kill_stops_gophish_campaign(api, fake_gophish):
    await _set_config()
    cid, creator, _ = await _approved_campaign(api)
    await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    await api.post(f"/api/live/campaigns/{cid}/kill", headers=creator)
    assert 4242 in fake_gophish.instances[-1].deleted
    assert (await db.live_campaigns.find_one({"id": cid}))["status"] == "killed"


async def test_global_kill_switch_stops_running_gophish(api, fake_gophish):
    await _set_config()
    cid, creator, approver = await _approved_campaign(api)
    await api.post(f"/api/live/campaigns/{cid}/launch", headers=creator)
    r = await api.post("/api/live/kill-switch", json={"engaged": True}, headers=approver)
    assert r.json()["campaigns_killed"] == 1
    assert any(4242 in inst.deleted for inst in fake_gophish.instances)


# ---------- config secret handling ----------


async def test_config_masks_secrets_and_preserves_on_resubmit(api):
    _, h = await make_user("admin")
    await api.put(
        "/api/live/config",
        json={
            "gophish_base_url": "https://gp.local:3333",
            "gophish_api_key": "real-key",
            "phish_url": "http://phish.local",
            "smtp_host": "mail:25",
        },
        headers=h,
    )
    got = (await api.get("/api/live/config", headers=h)).json()
    assert got["gophish_api_key"] == "***"

    # Resubmitting the mask must keep the stored key
    await api.put(
        "/api/live/config",
        json={
            "gophish_base_url": "https://gp.local:3333",
            "gophish_api_key": "***",
            "phish_url": "http://phish.local",
            "smtp_host": "mail:25",
        },
        headers=h,
    )
    stored = await db.live_config.find_one({"id": "live_config"})
    assert stored["gophish_api_key"] == "real-key"


async def test_config_is_admin_only(api):
    _, h = await make_user("trainer")
    assert (await api.get("/api/live/config", headers=h)).status_code == 403
    r = await api.put(
        "/api/live/config",
        json={
            "gophish_base_url": "x",
            "gophish_api_key": "y",
            "phish_url": "z",
            "smtp_host": "m",
        },
        headers=h,
    )
    assert r.status_code == 403
