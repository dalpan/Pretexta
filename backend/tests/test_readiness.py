"""Readiness overview: cohort aggregate, org scoping, no individual names."""

from datetime import UTC, datetime

from services.database import db
from tests.conftest import make_user


async def _campaign(org, cid, recipients, launched="2026-10-01T00:00:00+00:00"):
    await db.live_campaigns.insert_one(
        {"id": cid, "name": cid, "organization_id": org, "launched_at": launched}
    )
    for i, (state, reported) in enumerate(recipients):
        await db.live_recipients.insert_one(
            {
                "campaign_id": cid,
                "email": f"{cid}-{i}@acme.test",
                "state": state,
                "reported": reported,
            }
        )


async def test_requires_staff(api):
    _, h = await make_user("user")
    assert (await api.get("/api/readiness", headers=h)).status_code == 403


async def test_empty_org_has_no_index(api):
    _, h = await make_user("trainer", organization_id="org-a")
    body = (await api.get("/api/readiness", headers=h)).json()
    assert body["index"]["score"] is None
    assert body["live"]["campaigns"] == 0
    assert body["attack_surface"] is None


async def test_index_and_loop(api):
    trainee, _ = await make_user("user", organization_id="org-a")
    _, h = await make_user("trainer", organization_id="org-a")

    # Two campaigns: report rate goes 25% -> 75%; one click in each.
    await _campaign(
        "org-a",
        "c1",
        [("clicked", False), ("sent", True), ("sent", False), ("sent", False)],
        launched="2026-09-01T00:00:00+00:00",
    )
    await _campaign(
        "org-a",
        "c2",
        [("clicked", False), ("sent", True), ("sent", True), ("sent", True)],
        launched="2026-10-01T00:00:00+00:00",
    )
    vector = dict.fromkeys(
        ("reciprocity", "scarcity", "commitment", "liking", "social_proof"), 80.0
    )
    await db.risk_profiles.insert_one(
        {"user_id": trainee.id, "current_vector": {**vector, "authority": 20.0}}
    )
    await db.simulations.insert_one(
        {
            "user_id": trainee.id,
            "simulation_type": "triage",
            "status": "completed",
            "score": 90,
            "events": [{"event_type": "triage_graded", "payload": {"d_prime": 2.0}}],
        }
    )
    now = datetime.now(UTC).isoformat()
    for source, status in (
        ("remediation", "completed"),
        ("remediation", "active"),
        ("retest", "completed"),
    ):
        await db.assignments.insert_one(
            {
                "trainee_id": trainee.id,
                "source": source,
                "status": status,
                "principle": "authority",
                "reason": "secret detail about the person",
                "created_at": now,
            }
        )

    body = (await api.get("/api/readiness", headers=h)).json()

    live = body["live"]
    assert live["report_rate"] == 0.5 and live["click_rate"] == 0.25
    assert live["report_rate_delta"] == 0.5
    assert [t["name"] for t in live["trend"]] == ["c1", "c2"]

    assert body["weakest_principles"][0] == "authority"
    assert body["lab"] == {"triage_runs": 1, "avg_triage_score": 90.0, "avg_d_prime": 2.0}

    comps = body["index"]["components"]
    assert comps == {"report_rate": 50, "no_click": 75, "principles": 70, "triage": 90}
    # 0.4*50 + 0.2*75 + 0.2*70 + 0.2*90 = 67
    assert body["index"]["score"] == 67

    loop = body["loop"]
    assert (loop["remediation_assigned"], loop["remediation_passed"]) == (2, 1)
    assert (loop["retest_assigned"], loop["retest_passed"]) == (1, 1)
    # The feed is anonymous: no person, no free-text reason.
    for item in loop["recent"]:
        assert set(item) <= {"source", "principle", "status", "created_at"}


async def test_trainer_sees_only_own_org(api):
    await _campaign("org-b", "other", [("clicked", False), ("sent", False)])
    _, h = await make_user("trainer", organization_id="org-a")
    body = (await api.get("/api/readiness", headers=h)).json()
    assert body["live"]["campaigns"] == 0

    _, admin_h = await make_user("admin")
    assert (await api.get("/api/readiness", headers=admin_h)).json()["live"]["campaigns"] == 1


async def test_weights_renormalise_without_live_data(api):
    trainee, _ = await make_user("user", organization_id="org-a")
    _, h = await make_user("trainer", organization_id="org-a")
    await db.simulations.insert_one(
        {"user_id": trainee.id, "simulation_type": "triage", "status": "completed", "score": 60}
    )
    index = (await api.get("/api/readiness", headers=h)).json()["index"]
    assert index["components"]["report_rate"] is None
    assert index["score"] == 60  # triage is the only component with data
