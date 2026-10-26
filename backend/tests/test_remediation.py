"""Remediation loop: fail -> targeted assignment -> pass -> retest."""

from services import remediation
from services.database import db
from tests.conftest import make_user


async def _seed_content():
    # A scenario and a quiz, each tagged with the 'authority' principle.
    await db.challenges.insert_one(
        {"id": "ch-auth", "title": "Authority drill", "cialdini_categories": ["authority"], "nodes": []}
    )
    await db.quizzes.insert_one(
        {"id": "qz-auth", "title": "Authority quiz", "cialdini_categories": ["authority"], "questions": []}
    )


async def _active(user_id):
    return await db.assignments.find(
        {"trainee_id": user_id, "source": {"$in": ["remediation", "retest"]}}, {"_id": 0}
    ).to_list(10)


# ---------- lab trigger ----------


async def test_failed_lab_result_assigns_remediation(api):
    user, _ = await make_user("user")
    await _seed_content()
    sim = {
        "id": "s1",
        "score": 30,
        "title": "CEO wire",
        "challenge_data": {"cialdini_categories": ["authority"]},
    }
    await remediation.on_lab_result(sim, user.id)
    rows = await _active(user.id)
    assert len(rows) == 1
    a = rows[0]
    assert a["principle"] == "authority"
    assert a["source"] == "remediation"
    assert a["content_id"] == "ch-auth"  # prefers the scenario
    assert "authority" in a["reason"].lower()


async def test_passing_lab_result_assigns_nothing(api):
    user, _ = await make_user("user")
    await _seed_content()
    await remediation.on_lab_result(
        {"id": "s", "score": 85, "challenge_data": {"cialdini_categories": ["authority"]}}, user.id
    )
    assert await _active(user.id) == []


async def test_remediation_is_idempotent_per_principle(api):
    user, _ = await make_user("user")
    await _seed_content()
    sim = {"id": "s", "score": 20, "challenge_data": {"cialdini_categories": ["authority"]}}
    await remediation.on_lab_result(sim, user.id)
    await remediation.on_lab_result(sim, user.id)
    assert len(await _active(user.id)) == 1  # not assigned twice


async def test_no_content_for_principle_skips(api):
    user, _ = await make_user("user")
    # no content tagged 'liking'
    await remediation.on_lab_result(
        {"id": "s", "score": 10, "challenge_data": {"cialdini_categories": ["liking"]}}, user.id
    )
    assert await _active(user.id) == []


# ---------- live trigger ----------


async def test_live_click_assigns_remediation_to_matching_user(api):
    user, _ = await make_user("user")
    await db.users.update_one({"id": user.id}, {"$set": {"email": "victim@acme.test"}})
    await _seed_content()
    campaign = {"id": "c1", "principles": ["authority"]}
    await remediation.on_live_fail(campaign, "victim@acme.test", "clicked")
    rows = await _active(user.id)
    assert len(rows) == 1 and rows[0]["principle"] == "authority"
    assert "clicked" in rows[0]["reason"].lower()


async def test_live_fail_for_non_user_is_ignored(api):
    await _seed_content()
    # no user with this email -> nothing created, no error
    await remediation.on_live_fail({"id": "c", "principles": ["authority"]}, "stranger@x.test", "clicked")
    assert await db.assignments.count_documents({}) == 0


# ---------- retest ----------


async def test_passing_remediation_schedules_a_retest(api):
    user, _ = await make_user("user")
    await _seed_content()
    aid = await remediation.assign_remediation(user.id, "authority", "because")
    assignment = await db.assignments.find_one({"id": aid}, {"_id": 0})
    # mark it completed, then run the retest hook
    await db.assignments.update_one({"id": aid}, {"$set": {"status": "completed"}})
    await remediation.on_assignment_passed(assignment, user.id)
    retests = await db.assignments.find({"trainee_id": user.id, "source": "retest"}, {"_id": 0}).to_list(5)
    assert len(retests) == 1
    assert retests[0]["retest_of"] == aid
    assert retests[0]["principle"] == "authority"


async def test_retest_not_scheduled_for_manual_assignment(api):
    user, _ = await make_user("user")
    await _seed_content()
    await remediation.on_assignment_passed(
        {"id": "m1", "source": "manual", "principle": "authority"}, user.id
    )
    assert await db.assignments.count_documents({"source": "retest"}) == 0
