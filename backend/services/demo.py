"""
Demo data — one complete, believable loop for a booth, a judge or a first look.

Seeds a fictional organization on the sandbox domain `demo.test` whose story
shows what Pretexta is for: report rate climbs across three campaigns, the
people who clicked are automatically given practice for the principle that
caught them, most pass, and most pass the retest. Lab results and risk
profiles fill in the rest of the Readiness screen.

Everything written here carries `demo: True` (or `seeded: True` on map nodes,
tracked in `demo_state`) so `clear()` removes exactly the demo and nothing a
real user created. Seeding is deterministic: the same numbers every time.
"""

import random
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from models.schemas import LiveCampaign, User
from services import attack_surface
from services.auth import hash_password
from services.database import db

DEMO_ORG = "org-demo"
DEMO_DOMAIN = "demo.test"
PRINCIPLES = ("reciprocity", "scarcity", "authority", "commitment", "liking", "social_proof")

PEOPLE = [
    ("andi", "Andi Pratama"),
    ("sari", "Sari Wulandari"),
    ("budi", "Budi Santoso"),
    ("dewi", "Dewi Lestari"),
    ("rizky", "Rizky Hidayat"),
    ("maya", "Maya Anggraini"),
    ("fajar", "Fajar Nugroho"),
    ("intan", "Intan Permata"),
    ("yoga", "Yoga Saputra"),
    ("nadia", "Nadia Rahma"),
    ("hendra", "Hendra Wijaya"),
    ("putri", "Putri Ayu"),
]

# Three campaigns, oldest first. Indexes refer to PEOPLE. The arc: report rate
# 25% -> 50% -> 75%, click rate 42% -> 25% -> 8%, and reports arrive faster.
CAMPAIGNS = [
    {
        "days_ago": 75,
        "name": "Baseline — mailbox quota",
        "principles": ["authority", "scarcity"],
        "sender": ("IT Helpdesk", "helpdesk"),
        "subject": "Mailbox almost full — verify within 24 hours",
        "clicked": [0, 1, 2, 3, 4],
        "reported": [8, 9, 10],
        "report_minutes": [95, 180, 240],
    },
    {
        "days_ago": 45,
        "name": "Payroll update",
        "principles": ["authority", "commitment"],
        "sender": ("Payroll", "payroll"),
        "subject": "Action needed: confirm your payroll details",
        "clicked": [0, 1, 5],
        "reported": [2, 3, 4, 8, 9, 10],
        "report_minutes": [25, 40, 60, 75, 110, 150],
    },
    {
        "days_ago": 15,
        "name": "Executive request",
        "principles": ["authority", "liking"],
        "sender": ("Office of the Director", "director"),
        "subject": "Quick favour — are you at your desk?",
        "clicked": [6],
        "reported": [0, 1, 2, 3, 4, 5, 8, 9, 10],
        "report_minutes": [6, 9, 12, 15, 18, 22, 30, 41, 55],
    },
]

# Which remediations and retests have been passed by now (by campaign index).
REMEDIATION_PASSED = {0: True, 1: True, 2: False}
RETEST_PASSED_FROM = {0: True, 1: False}  # campaign-0 clickers already passed the retest


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _pick_content(principle: str) -> tuple[str, str, str]:
    """A real exercise for the principle, so the assignment opens something."""
    doc = await db.challenges.find_one(
        {"cialdini_categories": principle}, {"_id": 0, "id": 1, "title": 1}
    )
    if doc:
        return "challenge", doc["id"], doc["title"]
    return "challenge", "demo", principle.replace("_", " ").title()


async def seed(admin_id: str, map_workspace: str) -> dict:
    """Replace any previous demo data with a fresh copy of the story."""
    await clear()
    rng = random.Random(42)  # noqa: S311 — deterministic demo numbers, not security
    now = datetime.now(UTC)

    users = []
    for key, name in PEOPLE:
        user = User(
            username=f"demo-{key}",
            # Demo people never log in; their password is random and discarded.
            password_hash=hash_password(secrets.token_urlsafe(24)),
            email=f"{key}@{DEMO_DOMAIN}",
            display_name=name,
            role="user",
            organization_id=DEMO_ORG,
        )
        doc = user.model_dump()
        doc["created_at"] = _iso(now - timedelta(days=90))
        doc["demo"] = True
        await db.users.insert_one(doc)
        users.append(doc)

    await db.verified_domains.insert_one(
        {
            "id": str(uuid.uuid4()),
            "organization_id": DEMO_ORG,
            "domain": DEMO_DOMAIN,
            "token": secrets.token_urlsafe(12),
            "sandbox": True,
            "verified_at": _iso(now - timedelta(days=90)),
            "created_by": admin_id,
            "created_at": _iso(now - timedelta(days=90)),
            "demo": True,
        }
    )

    assignments = 0
    for ci, spec in enumerate(CAMPAIGNS):
        launched = now - timedelta(days=spec["days_ago"])
        campaign = LiveCampaign(
            name=spec["name"],
            objective="click_link",
            principles=spec["principles"],
            sender_name=spec["sender"][0],
            sender_email=f"{spec['sender'][1]}@{DEMO_DOMAIN}",
            subject=spec["subject"],
            body_html='<p>Please confirm here: <a href="{{.URL}}">verify</a></p>',
            recipients=[u["email"] for u in users],
            starts_at=launched,
            ends_at=launched + timedelta(days=5),
            max_turns=0,
            organization_id=DEMO_ORG,
            created_by=admin_id,
            approved_by=admin_id,
            status="closed",
        )
        doc = campaign.model_dump()
        doc.update(
            {
                "starts_at": _iso(launched),
                "ends_at": _iso(launched + timedelta(days=5)),
                "created_at": _iso(launched - timedelta(days=2)),
                "launched_at": _iso(launched),
                "recipient_count": len(users),
                "demo": True,
            }
        )
        await db.live_campaigns.insert_one(doc)

        for i, u in enumerate(users):
            state = "clicked" if i in spec["clicked"] else rng.choice(["sent", "opened"])
            await db.live_recipients.insert_one(
                {
                    "campaign_id": campaign.id,
                    "email": u["email"],
                    "state": state,
                    "reported": i in spec["reported"],
                    "updated_at": _iso(launched + timedelta(hours=6)),
                    "demo": True,
                }
            )
        for i, minutes in zip(spec["reported"], spec["report_minutes"], strict=True):
            await db.live_events.insert_one(
                {
                    "campaign_id": campaign.id,
                    "organization_id": DEMO_ORG,
                    "email": users[i]["email"],
                    "type": "reported",
                    # BSON date, like the real events (TTL index, G14).
                    "at": launched + timedelta(minutes=minutes),
                    "demo": True,
                }
            )

        # The remediation loop for everyone who clicked.
        principle = spec["principles"][0]
        content_type, content_id, title = await _pick_content(principle)
        for i in spec["clicked"]:
            remediation_id = str(uuid.uuid4())
            assigned = launched + timedelta(days=1)
            passed = REMEDIATION_PASSED[ci]
            await db.assignments.insert_one(
                _assignment(
                    remediation_id,
                    users[i]["id"],
                    "remediation",
                    principle,
                    content_type,
                    content_id,
                    title,
                    assigned,
                    passed,
                    reason=f"Clicked the link in the live simulation '{spec['name']}'.",
                )
            )
            assignments += 1
            if passed:
                await db.assignments.insert_one(
                    _assignment(
                        str(uuid.uuid4()),
                        users[i]["id"],
                        "retest",
                        principle,
                        content_type,
                        content_id,
                        title,
                        assigned + timedelta(days=14),
                        RETEST_PASSED_FROM[ci],
                        reason="Scheduled retest — a different exercise to confirm the lesson stuck.",
                        retest_of=remediation_id,
                    )
                )
                assignments += 1

    # Lab results and risk profiles: authority is the cohort's weak spot.
    for u in users:
        for run in range(2):
            d_prime = round(rng.uniform(0.9, 1.6) + run * rng.uniform(0.3, 0.9), 2)
            score = min(100, round(55 + d_prime * 15 + rng.uniform(-5, 5)))
            completed = now - timedelta(days=60 - run * 40 - rng.randint(0, 5))
            await db.simulations.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": u["id"],
                    "simulation_type": "triage",
                    "status": "completed",
                    "score": score,
                    "title": "Inbox Senin Pagi",
                    "events": [{"event_type": "triage_graded", "payload": {"d_prime": d_prime}}],
                    "started_at": _iso(completed - timedelta(minutes=4)),
                    "completed_at": _iso(completed),
                    "demo": True,
                }
            )
        vector = {p: float(rng.randint(62, 86)) for p in PRINCIPLES}
        vector["authority"] = float(rng.randint(34, 58))
        await db.risk_profiles.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": u["id"],
                "current_vector": vector,
                "baseline_vector": {p: 50.0 for p in PRINCIPLES},
                "demo": True,
            }
        )

    # Attack Surface Map: the demo org, plus the admin's own workspace if it is
    # empty (that is the map the admin's Readiness screen reads).
    map_orgs = [DEMO_ORG]
    if map_workspace != DEMO_ORG and not await db.org_nodes.find_one({"org_id": map_workspace}):
        map_orgs.append(map_workspace)
    for org in map_orgs:
        await attack_surface.seed_demo_org(org)
    await db.demo_state.update_one(
        {"id": "demo"},
        {"$set": {"id": "demo", "map_orgs": map_orgs, "seeded_at": _iso(now)}},
        upsert=True,
    )

    return {
        "people": len(users),
        "campaigns": len(CAMPAIGNS),
        "assignments": assignments,
        "map_orgs": map_orgs,
    }


def _assignment(
    aid,
    trainee_id,
    source,
    principle,
    content_type,
    content_id,
    title,
    created,
    passed,
    *,
    reason,
    retest_of=None,
):
    return {
        "id": aid,
        "instructor_id": "system",
        "trainee_id": trainee_id,
        "content_type": content_type,
        "content_id": content_id,
        "title": f"{'Retest' if source == 'retest' else 'Remediation'}: {title}",
        "instructions": reason,
        "reason": reason,
        "principle": principle,
        "source": source,
        "retest_of": retest_of,
        "status": "completed" if passed else "active",
        "passing_score": 70.0,
        "max_attempts": 3,
        "due_date": _iso(created + timedelta(days=7)),
        "created_at": _iso(created),
        "demo": True,
    }


async def status() -> dict:
    state = await db.demo_state.find_one({"id": "demo"}, {"_id": 0})
    return {
        "loaded": bool(await db.users.find_one({"demo": True}, {"_id": 1})),
        "seeded_at": (state or {}).get("seeded_at"),
    }


async def clear() -> dict:
    """Remove every demo record, and the map nodes the demo seeded."""
    removed = 0
    for name in (
        "users",
        "verified_domains",
        "live_campaigns",
        "live_recipients",
        "live_events",
        "assignments",
        "simulations",
        "risk_profiles",
    ):
        removed += (await db[name].delete_many({"demo": True})).deleted_count

    state = await db.demo_state.find_one({"id": "demo"}, {"_id": 0}) or {}
    for org in state.get("map_orgs", []):
        removed += (await db.org_nodes.delete_many({"org_id": org, "seeded": True})).deleted_count
        removed += (await db.trust_edges.delete_many({"org_id": org, "seeded": True})).deleted_count
    await db.demo_state.delete_one({"id": "demo"})
    return {"removed": removed}
