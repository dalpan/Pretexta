"""Authorization and data-integrity regression tests.

Each test pins down a hole found in the October 2026 review.
"""

import uuid

from services.database import db
from tests.conftest import make_user


async def insert_sim(owner_id: str | None, **extra):
    sim = {"id": str(uuid.uuid4()), "status": "completed", "score": 90, "events": [], **extra}
    if owner_id is not None:
        sim["user_id"] = owner_id
    await db.simulations.insert_one(dict(sim))
    return sim


# ---------- privilege escalation ----------


async def test_creating_org_does_not_grant_global_admin(api):
    user, h = await make_user("user")
    r = await api.post("/api/organizations", json={"name": "Acme"}, headers=h)
    assert r.status_code == 200
    doc = await db.users.find_one({"id": user.id})
    assert doc["role"] == "user"
    org = await db.organizations.find_one({"id": r.json()["id"]})
    assert org["owner_id"] == user.id


# ---------- global config is admin-only ----------


async def test_user_cannot_write_llm_config(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/llm/config",
        json={"provider": "local", "base_url": "http://attacker.example/v1", "enabled": True},
        headers=h,
    )
    assert r.status_code == 403
    assert await db.llm_configs.count_documents({}) == 0


async def test_admin_can_write_llm_config(api):
    _, h = await make_user("admin")
    r = await api.post(
        "/api/llm/config",
        json={"provider": "groq", "api_key": "gsk_x", "model_name": "m", "enabled": True},
        headers=h,
    )
    assert r.status_code == 200


async def test_user_cannot_probe_urls_via_model_refresh(api):
    _, h = await make_user("user")
    r = await api.get(
        "/api/llm/models/local/refresh", params={"base_url": "http://mongodb:27017"}, headers=h
    )
    assert r.status_code == 403


async def test_user_cannot_write_settings(api):
    _, h = await make_user("user")
    r = await api.put("/api/settings", json={"llm_enabled": True}, headers=h)
    assert r.status_code == 403


async def test_settings_rejects_unknown_fields(api):
    _, h = await make_user("admin")
    r = await api.put("/api/settings", json={"id": "hijack", "$where": "1"}, headers=h)
    assert r.status_code == 422


async def test_user_cannot_import_yaml(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/import/yaml",
        json={"type": "challenge", "data": {"title": "x", "description": "y"}},
        headers=h,
    )
    assert r.status_code == 403


async def test_user_cannot_publish_scenario_to_global_catalog(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/scenario-builder/templates",
        json={"title": "t", "nodes": [{"id": "a"}, {"id": "b"}]},
        headers=h,
    )
    tid = r.json()["id"]
    r = await api.post(f"/api/scenario-builder/templates/{tid}/publish", headers=h)
    assert r.status_code == 403
    assert await db.challenges.count_documents({}) == 0


async def test_template_update_cannot_change_owner(api):
    user, h = await make_user("user")
    r = await api.post("/api/scenario-builder/templates", json={"title": "t"}, headers=h)
    tid = r.json()["id"]
    await api.put(
        f"/api/scenario-builder/templates/{tid}",
        json={"title": "t2", "created_by": "someone-else"},
        headers=h,
    )
    doc = await db.scenario_templates.find_one({"id": tid})
    assert doc["created_by"] == user.id
    assert doc["title"] == "t2"


# ---------- simulation ownership / integrity ----------


async def test_simulation_update_cannot_reassign_owner(api):
    user, h = await make_user("user")
    sim = await insert_sim(user.id, status="running")
    await api.put(
        f"/api/simulations/{sim['id']}",
        json={"user_id": "victim", "id": "new-id", "notes": "x"},
        headers=h,
    )
    doc = await db.simulations.find_one({"id": sim["id"]})
    assert doc is not None
    assert doc["user_id"] == user.id


async def test_orphan_simulation_not_readable_by_users(api):
    _, h = await make_user("user")
    sim = await insert_sim(None)
    r = await api.get(f"/api/simulations/{sim['id']}", headers=h)
    assert r.status_code in (403, 404)


async def test_debrief_requires_ownership(api):
    owner, _ = await make_user("user")
    _, h = await make_user("user")
    sim = await insert_sim(owner.id)
    r = await api.get(f"/api/debrief/{sim['id']}", headers=h)
    assert r.status_code in (403, 404)


async def test_report_requires_ownership(api):
    owner, _ = await make_user("user")
    _, h = await make_user("user")
    sim = await insert_sim(owner.id)
    r = await api.get(f"/api/reports/{sim['id']}/json", headers=h)
    assert r.status_code in (403, 404)


async def test_certificate_requires_ownership(api):
    owner, _ = await make_user("user")
    _, h = await make_user("user")
    sim = await insert_sim(owner.id)
    r = await api.get(f"/api/certificates/{sim['id']}", headers=h)
    assert r.status_code in (403, 404)


async def test_trainer_can_read_trainee_report(api):
    owner, _ = await make_user("user")
    _, h = await make_user("trainer")
    sim = await insert_sim(owner.id)
    r = await api.get(f"/api/reports/{sim['id']}/json", headers=h)
    assert r.status_code == 200


async def test_assignment_submit_ignores_client_score(api):
    trainee, h = await make_user("user")
    await db.assignments.insert_one(
        {"id": "a1", "trainee_id": trainee.id, "status": "active", "passing_score": 70}
    )
    sim = await insert_sim(trainee.id, score=20)
    r = await api.post(
        "/api/assignments/a1/submit",
        json={"score": 100, "simulation_id": sim["id"]},
        headers=h,
    )
    assert r.status_code == 200
    assert r.json()["passed"] is False
    assert r.json()["score"] == 20


async def test_assignment_submit_requires_own_simulation(api):
    trainee, h = await make_user("user")
    other, _ = await make_user("user")
    await db.assignments.insert_one(
        {"id": "a1", "trainee_id": trainee.id, "status": "active", "passing_score": 70}
    )
    sim = await insert_sim(other.id, score=100)
    r = await api.post("/api/assignments/a1/submit", json={"simulation_id": sim["id"]}, headers=h)
    assert r.status_code in (403, 404)


# ---------- webhooks ----------


async def test_webhook_delete_is_org_scoped(api):
    _, h = await make_user("trainer", organization_id="org-a")
    await db.webhooks.insert_one({"id": "w1", "organization_id": "org-b", "name": "n"})
    r = await api.delete("/api/webhooks/w1", headers=h)
    assert r.status_code == 404
    assert await db.webhooks.count_documents({"id": "w1"}) == 1


async def test_webhook_rejects_internal_targets(api):
    _, h = await make_user("admin")
    for url in (
        "http://127.0.0.1:8001/x",
        "http://169.254.169.254/latest/meta-data",
        "http://mongodb:27017",
        "http://10.0.0.5/hook",
        "http://localhost/hook",
    ):
        r = await api.post("/api/webhooks", json={"name": "n", "url": url}, headers=h)
        assert r.status_code == 400, url


# ---------- misc ----------


async def test_challenge_search_treats_input_literally(api):
    _, h = await make_user("user")
    r = await api.get("/api/challenges", params={"search": "(unclosed"}, headers=h)
    assert r.status_code == 200
