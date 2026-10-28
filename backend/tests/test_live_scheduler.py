"""Recurring campaign schedules: materialisation, the due loop, and the API."""

from datetime import UTC, datetime, timedelta

from services.database import db
from services.live import scheduler
from tests.conftest import make_user

TEMPLATE = {
    "name": "Monthly helpdesk drill",
    "objective": "click_link",
    "principles": ["authority"],
    "sender_name": "IT Helpdesk",
    "sender_email": "helpdesk@acme.test",
    "subject": "Password reset required",
    "body_html": "<p>Reset: {{.URL}}</p>",
    "recipients": ["alice@acme.test", "bob@acme.test"],
    "max_turns": 0,
    "language": "en",
}


async def _schedule(**over):
    doc = {
        "id": over.get("id", "sch-1"),
        "organization_id": None,
        "name": "sched",
        "interval_days": 30,
        "window_days": 5,
        "next_run": datetime.now(UTC).isoformat(),
        "active": True,
        "template": TEMPLATE,
        "created_by": "sys",
    }
    doc.update(over)
    await db.campaign_schedules.insert_one(doc)
    return doc


# ---------- materialisation ----------


async def test_materialize_creates_pending_approval_campaign(api):
    s = await _schedule()
    cid = await scheduler.materialize(s)
    camp = await db.live_campaigns.find_one({"id": cid}, {"_id": 0})
    assert camp["status"] == "pending_approval"  # never auto-sent (G2)
    assert camp["objective"] == "click_link"
    assert camp["scheduled_from"] == "sch-1"
    assert camp["recipients"] == ["alice@acme.test", "bob@acme.test"]


async def test_materialize_bad_template_returns_none(api):
    s = await _schedule(id="bad", template={"name": "x"})  # missing required fields
    assert await scheduler.materialize(s) is None


# ---------- the due loop ----------


async def test_run_due_materialises_and_advances(api):
    await _schedule(next_run=(datetime.now(UTC) - timedelta(minutes=1)).isoformat())
    created = await scheduler.run_due()
    assert len(created) == 1
    s = await db.campaign_schedules.find_one({"id": "sch-1"}, {"_id": 0})
    # next_run advanced ~interval_days into the future
    assert datetime.fromisoformat(s["next_run"]) > datetime.now(UTC) + timedelta(days=29)
    assert s["last_campaign_id"] == created[0]


async def test_run_due_skips_future_and_inactive(api):
    await _schedule(id="future", next_run=(datetime.now(UTC) + timedelta(days=10)).isoformat())
    await _schedule(
        id="off", active=False, next_run=(datetime.now(UTC) - timedelta(days=1)).isoformat()
    )
    created = await scheduler.run_due()
    assert created == []


# ---------- API ----------


async def test_schedule_crud(api):
    _, h = await make_user("trainer", organization_id="acme")
    body = {
        "name": "Monthly",
        "interval_days": 30,
        "window_days": 5,
        "start_in_days": 0,
        "template": TEMPLATE,
    }
    created = (await api.post("/api/live/schedules", json=body, headers=h)).json()
    sid = created["id"]
    assert created["active"] is True and created["interval_days"] == 30

    listed = (await api.get("/api/live/schedules", headers=h)).json()
    assert len(listed) == 1

    # run-now materialises a pending_approval campaign
    run = await api.post(f"/api/live/schedules/{sid}/run-now", headers=h)
    assert run.status_code == 200
    cid = run.json()["created_campaign"]
    assert (await db.live_campaigns.find_one({"id": cid}))["status"] == "pending_approval"

    # pause it
    await api.patch(f"/api/live/schedules/{sid}", json={"active": False}, headers=h)
    assert (await db.campaign_schedules.find_one({"id": sid}))["active"] is False

    # delete
    assert (await api.delete(f"/api/live/schedules/{sid}", headers=h)).status_code == 200
    assert await db.campaign_schedules.count_documents({"id": sid}) == 0


async def test_schedules_require_staff(api):
    _, h = await make_user("user")
    assert (await api.get("/api/live/schedules", headers=h)).status_code == 403
    assert (await api.post("/api/live/schedules", json={}, headers=h)).status_code == 403
