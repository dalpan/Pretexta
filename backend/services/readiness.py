"""
Readiness overview — the first screen a commander or trainer sees.

One read-only aggregate that tells the Pretexta story on a single page:
measure (live report rate, lab discrimination) -> remediate (targeted
practice for the principle someone fell for) -> retest. Everything here is
cohort-level; no individual is named (G13), and live results never feed
gamification (G15).
"""

from statistics import mean
from typing import Any

from services import attack_surface
from services.database import db
from services.live import launch as launch_svc

PRINCIPLES = ("reciprocity", "scarcity", "authority", "commitment", "liking", "social_proof")

# How much each component contributes to the readiness index. Report rate leads:
# it is the defensive behaviour we are training for. Components without data are
# left out and the remaining weights renormalised, so an org that has only run
# lab exercises still gets a meaningful number.
WEIGHTS = {"report_rate": 0.4, "no_click": 0.2, "principles": 0.2, "triage": 0.2}

# The trend uses this many most-recent launched campaigns.
TREND_CAMPAIGNS = 8


async def _live(scope: dict) -> dict[str, Any]:
    campaigns = (
        await db.live_campaigns.find(
            {**scope, "launched_at": {"$ne": None}},
            {"_id": 0, "id": 1, "name": 1, "launched_at": 1},
        )
        .sort("launched_at", -1)
        .to_list(TREND_CAMPAIGNS)
    )
    campaigns.reverse()  # oldest -> newest for the trend line

    trend, recipients, reported, clicked = [], 0, 0, 0
    for c in campaigns:
        m = await launch_svc.report_rate(c["id"])
        trend.append(
            {
                "name": c["name"],
                "launched_at": c["launched_at"],
                "report_rate": m["report_rate"],
                "click_rate": m["click_rate"],
                "median_time_to_report_min": m["median_time_to_report_min"],
            }
        )
        recipients += m["recipients"]
        reported += m["reported"]
        clicked += m["clicked"]

    rates = [t["report_rate"] for t in trend if t["report_rate"] is not None]
    return {
        "campaigns": len(campaigns),
        "recipients": recipients,
        "reported": reported,
        "clicked": clicked,
        "report_rate": round(reported / recipients, 3) if recipients else None,
        "click_rate": round(clicked / recipients, 3) if recipients else None,
        # Change between the first and the latest campaign in the window.
        "report_rate_delta": round(rates[-1] - rates[0], 3) if len(rates) >= 2 else None,
        "trend": trend,
    }


async def _principles(user_ids: list[str]) -> dict[str, float | None]:
    profiles = await db.risk_profiles.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "current_vector": 1}
    ).to_list(5000)
    out: dict[str, float | None] = {}
    for p in PRINCIPLES:
        values = [
            prof["current_vector"][p]
            for prof in profiles
            if isinstance(prof.get("current_vector"), dict) and p in prof["current_vector"]
        ]
        out[p] = round(mean(values), 1) if values else None
    return out


async def _lab(user_ids: list[str]) -> dict[str, Any]:
    sims = await db.simulations.find(
        {"user_id": {"$in": user_ids}, "simulation_type": "triage", "status": "completed"},
        {"_id": 0, "score": 1, "events": 1},
    ).to_list(5000)
    d_primes = [
        e["payload"]["d_prime"]
        for s in sims
        for e in s.get("events") or []
        if e.get("event_type") == "triage_graded" and "d_prime" in (e.get("payload") or {})
    ]
    scores = [s["score"] for s in sims if s.get("score") is not None]
    return {
        "triage_runs": len(sims),
        "avg_triage_score": round(mean(scores), 1) if scores else None,
        "avg_d_prime": round(mean(d_primes), 2) if d_primes else None,
    }


async def _loop(user_ids: list[str]) -> dict[str, Any]:
    base = {"trainee_id": {"$in": user_ids}}

    async def count(extra: dict) -> int:
        return await db.assignments.count_documents({**base, **extra})

    loop = {
        "remediation_assigned": await count({"source": "remediation"}),
        "remediation_passed": await count({"source": "remediation", "status": "completed"}),
        "retest_assigned": await count({"source": "retest"}),
        "retest_passed": await count({"source": "retest", "status": "completed"}),
    }
    # Anonymous activity feed: what the loop did, never who it did it to.
    recent = (
        await db.assignments.find(
            {**base, "source": {"$in": ["remediation", "retest"]}},
            {"_id": 0, "source": 1, "principle": 1, "status": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(8)
    )
    loop["recent"] = recent
    return loop


def _index(live: dict, principles: dict, lab: dict) -> dict[str, Any]:
    known = [v for v in principles.values() if v is not None]
    components = {
        "report_rate": None if live["report_rate"] is None else live["report_rate"] * 100,
        "no_click": None if live["click_rate"] is None else (1 - live["click_rate"]) * 100,
        "principles": mean(known) if known else None,
        "triage": lab["avg_triage_score"],
    }
    available = {k: v for k, v in components.items() if v is not None}
    weight = sum(WEIGHTS[k] for k in available)
    score = round(sum(WEIGHTS[k] * v for k, v in available.items()) / weight) if weight else None
    return {
        "score": score,
        "components": {k: None if v is None else round(v) for k, v in components.items()},
        "weights": WEIGHTS,
    }


async def overview(*, user_scope: dict, campaign_scope: dict, org_id: str) -> dict[str, Any]:
    users = await db.users.find({**user_scope, "role": "user"}, {"_id": 0, "id": 1}).to_list(10000)
    user_ids = [u["id"] for u in users]

    live = await _live(campaign_scope)
    principles = await _principles(user_ids)
    lab = await _lab(user_ids)
    loop = await _loop(user_ids)

    known = {k: v for k, v in principles.items() if v is not None}
    weakest = sorted(known, key=known.get)[:2]

    surface = None
    graph = await attack_surface.build_graph(org_id, refresh=False)
    if any(n.get("is_asset") for n in graph.get("nodes", [])):
        analysis = await attack_surface.analyze(org_id)
        top = (analysis.get("attack_paths") or [None])[0]
        surface = {
            "posture": analysis.get("posture"),
            "counts": analysis.get("counts"),
            # Asset and probability only — the entry person stays on the staff-only map.
            "top_path": top and {"asset": top["asset_name"], "probability": top["probability"]},
        }

    return {
        "index": _index(live, principles, lab),
        "people": len(user_ids),
        "live": live,
        "principles": principles,
        "weakest_principles": weakest,
        "lab": lab,
        "loop": loop,
        "attack_surface": surface,
    }
