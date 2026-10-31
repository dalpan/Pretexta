"""G13 (cohort privacy) and G15 (live results never feed gamification)."""

from services import report_inbox
from services.database import db
from services.privacy import MIN_COHORT
from tests.conftest import make_user
from tests.test_live_gophish import _approved_campaign, _set_config, fake_gophish  # noqa: F401


async def _org(org_id, size, owner_role="user"):
    """An organization with `size` members; returns (owner headers, member ids)."""
    owner, owner_h = await make_user(owner_role, organization_id=org_id)
    ids = [owner.id]
    for _ in range(size - 1):
        u, _ = await make_user("user", organization_id=org_id)
        ids.append(u.id)
    await db.organizations.insert_one(
        {"id": org_id, "name": org_id, "owner_id": owner.id, "member_ids": ids}
    )
    for i, uid in enumerate(ids):
        await db.simulations.insert_one(
            {"id": f"s-{uid}", "user_id": uid, "status": "completed", "score": 40 + i}
        )
        await db.risk_profiles.insert_one(
            {"user_id": uid, "current_vector": {"authority": 30.0 + i}}
        )
    return owner_h, ids


# ---------- G13: team analytics ----------


async def test_member_cannot_see_individual_stats(api):
    h, _ = await _org("big", MIN_COHORT)
    body = (await api.get("/api/analytics/team", headers=h)).json()
    assert "member_stats" not in body
    assert body["team_avg_score"] is not None


async def test_member_of_small_org_gets_no_aggregates(api):
    h, _ = await _org("tiny", MIN_COHORT - 1)
    body = (await api.get("/api/analytics/team", headers=h)).json()
    assert body["suppressed"] is True
    assert "team_avg_score" not in body and "member_stats" not in body


async def test_staff_see_individual_stats_even_in_small_org(api):
    _, ids = await _org("tiny", 2)
    _, h = await make_user("trainer", organization_id="tiny")
    body = (await api.get("/api/analytics/team", headers=h)).json()
    assert {m["user_id"] for m in body["member_stats"]} == set(ids)


# ---------- G13: org risk map ----------


async def test_non_staff_owner_of_small_org_gets_suppressed_risk_map(api):
    h, _ = await _org("tiny", MIN_COHORT - 1)
    body = (await api.get("/api/risk-profile/org/tiny", headers=h)).json()
    assert body["suppressed"] is True and "dimensions" not in body


async def test_non_staff_owner_of_large_org_gets_aggregates(api):
    h, _ = await _org("big", MIN_COHORT)
    body = (await api.get("/api/risk-profile/org/big", headers=h)).json()
    assert "suppressed" not in body and "authority" in body["dimensions"]


async def test_admin_sees_small_org_risk_map(api):
    await _org("tiny", 2)
    _, h = await make_user("admin")
    body = (await api.get("/api/risk-profile/org/tiny", headers=h)).json()
    assert "dimensions" in body


# ---------- G15: live outcomes never touch XP, badges or lab results ----------


async def _gamification_state(user_id):
    user = await db.users.find_one({"id": user_id})
    sims = await db.simulations.count_documents({"user_id": user_id})
    return user.get("xp", 0), user.get("level", 1), user.get("badges", []), sims


async def test_live_click_and_report_do_not_feed_gamification(api, fake_gophish):  # noqa: F811
    alice, _ = await make_user("user", username="alice")
    bob, bob_h = await make_user("user", username="bob")
    await db.users.update_one({"id": alice.id}, {"$set": {"email": "alice@acme.test"}})
    await db.users.update_one({"id": bob.id}, {"$set": {"email": "bob@acme.test"}})
    before = {u: await _gamification_state(u) for u in (alice.id, bob.id)}

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
    await api.post(f"/api/live/campaigns/{cid}/sync", headers=creator)
    campaign = await db.live_campaigns.find_one({"id": cid})
    await report_inbox.ingest_report(
        campaign.get("organization_id"), "bob@acme.test", f"Fwd: {campaign['subject']}"
    )

    for uid, state in before.items():
        assert await _gamification_state(uid) == state

    board = (await api.get("/api/leaderboard", headers=bob_h)).json()
    assert all(row["xp"] == 0 for row in board)
