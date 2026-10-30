"""Demo data: tells the loop story, is admin-only, and clears without touching real data."""

from services.database import db
from tests.conftest import make_user


async def test_admin_only(api):
    _, h = await make_user("trainer")
    assert (await api.post("/api/demo", headers=h)).status_code == 403
    assert (await api.delete("/api/demo", headers=h)).status_code == 403


async def test_demo_tells_the_loop_story(api):
    _, h = await make_user("admin")
    assert (await api.post("/api/demo", headers=h)).status_code == 200

    body = (await api.get("/api/readiness", headers=h)).json()
    trend = [round(c["report_rate"], 2) for c in body["live"]["trend"]]
    assert trend == [0.25, 0.5, 0.75]
    assert body["live"]["clicked"] == 9
    loop = body["loop"]
    assert loop["remediation_assigned"] == 9 and loop["remediation_passed"] == 8
    assert loop["retest_passed"] == 5
    assert body["weakest_principles"][0] == "authority"
    assert body["lab"]["triage_runs"] == 24
    assert body["attack_surface"] is not None
    assert body["index"]["score"] is not None

    # Reports arrive faster as the loop works.
    medians = [c["median_time_to_report_min"] for c in body["live"]["trend"]]
    assert medians[0] > medians[1] > medians[2]


async def test_reload_is_idempotent(api):
    _, h = await make_user("admin")
    await api.post("/api/demo", headers=h)
    await api.post("/api/demo", headers=h)
    assert await db.users.count_documents({"demo": True}) == 12
    assert await db.live_campaigns.count_documents({"demo": True}) == 3


async def test_clear_leaves_real_data(api):
    admin, h = await make_user("admin")
    real, _ = await make_user("user")
    await db.org_nodes.insert_one({"id": "mine", "org_id": "org-real", "name": "Real node"})

    await api.post("/api/demo", headers=h)
    status = (await api.get("/api/demo", headers=h)).json()
    assert status["loaded"] is True

    await api.delete("/api/demo", headers=h)
    assert (await api.get("/api/demo", headers=h)).json()["loaded"] is False
    for name in ("users", "live_campaigns", "live_recipients", "assignments", "simulations"):
        assert await db[name].count_documents({"demo": True}) == 0, name
    assert await db.users.find_one({"id": real.id})
    assert await db.users.find_one({"id": admin.id})
    assert await db.org_nodes.find_one({"id": "mine"})
    # The map the demo seeded into the admin's empty workspace is gone too.
    assert not await db.org_nodes.find_one({"org_id": f"org-{admin.id}"})


async def test_existing_map_is_not_overwritten(api):
    admin, h = await make_user("admin")
    workspace = f"org-{admin.id}"
    await db.org_nodes.insert_one({"id": "kept", "org_id": workspace, "name": "Admin's own map"})
    result = (await api.post("/api/demo", headers=h)).json()
    assert workspace not in result["map_orgs"]
    await api.delete("/api/demo", headers=h)
    assert await db.org_nodes.find_one({"id": "kept"})
