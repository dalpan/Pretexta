"""Human Attack Surface Map: susceptibility, pathfinding, choke points, API."""

from services import attack_surface
from services.database import db
from tests.conftest import make_user

# ---------- susceptibility ----------


async def test_susceptibility_measured_from_live_failure(api):
    user, _ = await make_user("user")
    await db.users.update_one({"id": user.id}, {"$set": {"email": "victim@acme.test"}})
    # They clicked AND submitted in a live campaign -> highly susceptible.
    await db.live_recipients.insert_one(
        {"campaign_id": "c1", "email": "victim@acme.test", "state": "submitted", "reported": False}
    )
    out = await attack_surface.compute_susceptibility({"user_id": user.id})
    assert out["data_quality"] == "measured"
    assert out["susceptibility"] >= 67 and out["band"] == "high"
    assert "live-campaign behaviour" in out["evidence"]


async def test_reporting_the_phish_lowers_susceptibility(api):
    user, _ = await make_user("user")
    await db.users.update_one({"id": user.id}, {"$set": {"email": "sharp@acme.test"}})
    await db.live_recipients.insert_one(
        {"campaign_id": "c1", "email": "sharp@acme.test", "state": "sent", "reported": True}
    )
    out = await attack_surface.compute_susceptibility({"user_id": user.id})
    assert out["band"] == "low"


async def test_seeded_estimate_used_when_no_live_data(api):
    out = await attack_surface.compute_susceptibility({"susceptibility": 80})
    assert out["data_quality"] == "estimated"
    assert out["susceptibility"] == 80 and out["band"] == "high"


async def test_no_data_defaults_to_fifty(api):
    out = await attack_surface.compute_susceptibility({})
    assert out["susceptibility"] == 50 and out["data_quality"] == "unknown"


# ---------- graph + analysis on the demo org ----------


async def test_seed_demo_and_graph(api):
    await attack_surface.seed_demo_org("org-x")
    graph = await attack_surface.build_graph("org-x")
    assert len(graph["nodes"]) == 10
    assert len(graph["edges"]) == 10
    assets = [n for n in graph["nodes"] if n["is_asset"]]
    people = [n for n in graph["nodes"] if not n["is_asset"]]
    assert len(assets) == 3 and len(people) == 7
    assert all(a["susceptibility"] is None for a in assets)
    assert all(p["susceptibility"] is not None for p in people)


async def test_analysis_finds_path_and_choke_point(api):
    await attack_surface.seed_demo_org("org-y")
    result = await attack_surface.analyze("org-y")
    # Every crown jewel is reachable from the internet.
    assert len(result["attack_paths"]) == 3
    assert all(p["probability"] > 0 for p in result["attack_paths"])
    # The easiest route reaches a real asset through at least one person.
    top = result["attack_paths"][0]
    assert top["hops"] and top["hops"][-1]["is_asset"]
    # Choke points are ranked and the top one actually reduces risk.
    assert result["choke_points"]
    assert result["choke_points"][0]["risk_reduction"] >= 0
    # Posture is a DEFCON-style condition 1..5.
    assert 1 <= result["posture"]["condition"] <= 5
    assert result["after_action"]


async def test_hardening_the_finance_officer_cuts_the_money_path(api):
    await attack_surface.seed_demo_org("org-z")
    result = await attack_surface.analyze("org-z")
    # The Finance Officer sits on the direct path to Payment Approval, so they
    # should be among the highest-leverage people to train.
    names = [c["name"] for c in result["choke_points"]]
    assert "Finance Officer" in names


# ---------- API: auth, CRUD, scope ----------


async def test_graph_requires_staff(api):
    _, user_headers = await make_user("user")
    r = await api.get("/api/attack-surface/graph", headers=user_headers)
    assert r.status_code == 403


async def test_seed_and_analysis_endpoints(api):
    _, admin = await make_user("admin")
    assert (await api.post("/api/attack-surface/seed-demo", headers=admin)).status_code == 200
    r = await api.get("/api/attack-surface/analysis", headers=admin)
    assert r.status_code == 200
    assert r.json()["counts"]["assets"] == 3


async def test_node_and_edge_crud(api):
    _, trainer = await make_user("trainer", organization_id="acme")
    a = (
        await api.post(
            "/api/attack-surface/nodes", headers=trainer, json={"name": "Alice", "role": "CFO"}
        )
    ).json()
    asset = (
        await api.post(
            "/api/attack-surface/nodes",
            headers=trainer,
            json={"name": "Vault", "is_asset": True, "asset_kind": "money"},
        )
    ).json()
    assert asset["susceptibility"] is None
    # Edge with an unknown relationship is rejected.
    bad = await api.post(
        "/api/attack-surface/edges",
        headers=trainer,
        json={"source_id": a["id"], "target_id": asset["id"], "relationship": "nonsense"},
    )
    assert bad.status_code == 422
    edge = await api.post(
        "/api/attack-surface/edges",
        headers=trainer,
        json={
            "source_id": a["id"],
            "target_id": asset["id"],
            "relationship": "approves",
            "trust_weight": 0.9,
        },
    )
    assert edge.status_code == 201
    # Deleting the node cascades to its edges.
    await api.delete(f"/api/attack-surface/nodes/{a['id']}", headers=trainer)
    assert await db.trust_edges.count_documents({"source_id": a["id"]}) == 0


async def test_map_is_scoped_per_org(api):
    _, trainer_a = await make_user("trainer", organization_id="org-a")
    _, trainer_b = await make_user("trainer", organization_id="org-b")
    await api.post("/api/attack-surface/nodes", headers=trainer_a, json={"name": "SecretPerson"})
    graph_b = (await api.get("/api/attack-surface/graph", headers=trainer_b)).json()
    assert graph_b["nodes"] == []


async def test_asset_requires_valid_kind(api):
    _, trainer = await make_user("trainer", organization_id="acme")
    r = await api.post(
        "/api/attack-surface/nodes",
        headers=trainer,
        json={"name": "X", "is_asset": True, "asset_kind": "bogus"},
    )
    assert r.status_code == 422


# ---------- launch targets ----------


async def test_targets_from_demo_ranked_by_susceptibility(api):
    await attack_surface.seed_demo_org("org-t")
    rows = await attack_surface.targets("org-t")
    # 7 people, all with sandbox emails; no assets.
    assert len(rows) == 7
    assert all(r["email"].endswith("@acme.test") for r in rows)
    # Most susceptible first (New Joiner, susceptibility 82).
    assert rows[0]["name"] == "New Joiner"
    assert rows[0]["susceptibility"] >= rows[-1]["susceptibility"]


async def test_targets_resolves_email_via_user_id(api):
    user, _ = await make_user("user", organization_id="acme")
    await db.users.update_one({"id": user.id}, {"$set": {"email": "real@acme.test"}})
    await db.org_nodes.insert_one(
        {
            "id": "n1",
            "org_id": "acme",
            "name": "Linked",
            "user_id": user.id,
            "role": "Staff",
            "department": "Ops",
            "is_asset": False,
            "susceptibility": 60,
        }
    )
    rows = await attack_surface.targets("acme")
    assert any(r["email"] == "real@acme.test" for r in rows)


async def test_targets_endpoint_requires_staff(api):
    _, h = await make_user("user")
    assert (await api.get("/api/attack-surface/targets", headers=h)).status_code == 403
