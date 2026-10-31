"""Inbox triage: signal-detection scoring, answer labels not leaked."""

from services import triage
from services.database import db
from tests.conftest import make_user

SET = {
    "id": "t1",
    "title": "Test Inbox",
    "difficulty": "medium",
    "items": [
        {
            "id": "a",
            "from": "hr@acme.com",
            "subject": "Timesheet",
            "body": "..",
            "is_pretext": False,
        },
        {"id": "b", "from": "cal@acme.com", "subject": "Invite", "body": "..", "is_pretext": False},
        {"id": "c", "from": "news@x.com", "subject": "Digest", "body": "..", "is_pretext": False},
        {
            "id": "d",
            "from": "box@dropbox.com",
            "subject": "Shared",
            "body": "..",
            "is_pretext": False,
        },
        {
            "id": "e",
            "from": "it@acme-support.net",
            "subject": "Verify now",
            "body": "..",
            "is_pretext": True,
            "principle": "scarcity",
            "explanation": "look-alike domain",
        },
        {
            "id": "f",
            "from": "ceo@acme.corp-mail.com",
            "subject": "Gift cards",
            "body": "..",
            "is_pretext": True,
            "principle": "authority",
            "explanation": "BEC",
        },
    ],
}


async def _seed():
    await db.triage_sets.insert_one(dict(SET))


def test_signal_detection_rewards_discrimination():
    good = triage.signal_detection(hits=2, pretexts=2, false_alarms=0, legits=4)
    flag_all = triage.signal_detection(hits=2, pretexts=2, false_alarms=4, legits=4)
    assert good["d_prime"] > flag_all["d_prime"]  # over-flagging is not rewarded
    assert good["d_prime"] > 1.5


async def test_get_set_strips_labels(api):
    _, h = await make_user("user")
    await _seed()
    s = (await api.get("/api/triage/t1", headers=h)).json()
    for item in s["items"]:
        assert "is_pretext" not in item
        assert "explanation" not in item
        assert "principle" not in item


async def test_perfect_triage(api):
    _, h = await make_user("user")
    await _seed()
    r = await api.post(
        "/api/triage/t1/submit",
        json={"marks": {"e": "flag", "f": "flag"}, "duration_seconds": 42},
        headers=h,
    )
    body = r.json()
    assert body["metrics"]["hits"] == 2
    assert body["metrics"]["false_alarms"] == 0
    assert body["score"] == 100
    sim = await db.simulations.find_one({"id": body["simulation_id"]})
    assert sim["simulation_type"] == "triage" and sim["score"] == 100


async def test_flag_everything_is_penalized(api):
    _, h = await make_user("user")
    await _seed()
    r = await api.post(
        "/api/triage/t1/submit",
        json={"marks": {k: "flag" for k in "abcdef"}},
        headers=h,
    )
    body = r.json()
    assert body["metrics"]["false_alarms"] == 4
    # 2 hits + 0 correct rejections = 2/6 correct, minus 4*5 false-alarm penalty
    assert body["score"] < 50
    assert body["metrics"]["d_prime"] < 1.0


async def test_leave_everything_misses_pretexts(api):
    _, h = await make_user("user")
    await _seed()
    r = await api.post("/api/triage/t1/submit", json={"marks": {}}, headers=h)
    body = r.json()
    assert body["metrics"]["misses"] == 2 and body["metrics"]["hits"] == 0


async def test_results_reveal_labels_after_submit(api):
    _, h = await make_user("user")
    await _seed()
    r = await api.post("/api/triage/t1/submit", json={"marks": {"e": "flag"}}, headers=h)
    results = {x["id"]: x for x in r.json()["results"]}
    assert results["e"]["outcome"] == "hit" and results["e"]["explanation"]
    assert results["f"]["outcome"] == "miss"


async def test_client_cannot_post_triage_simulation(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/simulations",
        json={"simulation_type": "triage", "status": "completed", "score": 100},
        headers=h,
    )
    assert r.status_code == 409


async def test_list_sets(api):
    _, h = await make_user("user")
    await _seed()
    rows = (await api.get("/api/triage", headers=h)).json()
    assert rows and rows[0]["item_count"] == 6 and "items" not in rows[0]


async def test_seed_adds_both_languages_once(api):
    await triage.seed_default_set()
    await triage.seed_default_set()
    rows = await db.triage_sets.find({}, {"_id": 0, "id": 1, "language": 1}).to_list(10)
    assert sorted((r["id"], r["language"]) for r in rows) == [
        ("triage-inbox-01", "en"),
        ("triage-inbox-01-id", "id"),
    ]


async def test_seed_fills_missing_set_without_touching_edited_one(api):
    # An existing database from before the Indonesian set was added, edited by an admin.
    await db.triage_sets.insert_one({"id": "triage-inbox-01", "title": "Edited", "items": []})
    await triage.seed_default_set()
    assert (await db.triage_sets.find_one({"id": "triage-inbox-01"}))["title"] == "Edited"
    assert await db.triage_sets.find_one({"id": "triage-inbox-01-id"})


def _set_payload(**over):
    items = [
        {
            "channel": "whatsapp",
            "from": "Atasan (nomor baru)",
            "subject": "Tolong transfer dulu",
            "body": "..",
            "is_pretext": True,
            "principle": "authority",
            "explanation": "nomor baru",
        },
        {"from": "hr@acme.com", "subject": "Timesheet", "body": "..", "is_pretext": False},
        {"from": "cal@acme.com", "subject": "Invite", "body": "..", "is_pretext": False},
        {
            "channel": "whatsapp",
            "from": "Grup Kantor",
            "subject": "Rapat jam 9",
            "body": "..",
            "is_pretext": False,
        },
    ]
    return {"id": "pack-1", "title": "Pack", "language": "id", "items": items, **over}


async def test_trainer_can_add_a_set_with_chat_items(api):
    _, h = await make_user("trainer")
    r = await api.post("/api/triage", json=_set_payload(), headers=h)
    assert r.status_code == 201, r.text
    taker, th = await make_user("user")
    got = (await api.get("/api/triage/pack-1", headers=th)).json()
    assert got["items"][0]["channel"] == "whatsapp"
    assert "is_pretext" not in got["items"][0]  # labels stay on the server
    assert (await api.post("/api/triage", json=_set_payload(), headers=h)).status_code == 409


async def test_set_authoring_rules(api):
    _, uh = await make_user("user")
    assert (await api.post("/api/triage", json=_set_payload(), headers=uh)).status_code == 403
    _, h = await make_user("trainer")
    only_legit = _set_payload()
    only_legit["items"] = [dict(i, is_pretext=False) for i in only_legit["items"]]
    assert (await api.post("/api/triage", json=only_legit, headers=h)).status_code == 422
    unexplained = _set_payload()
    unexplained["items"][0].pop("explanation")
    assert (await api.post("/api/triage", json=unexplained, headers=h)).status_code == 422
