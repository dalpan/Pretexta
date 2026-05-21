from fastapi import APIRouter, Depends

from models.schemas import User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/personal")
async def get_personal_analytics(current_user: User = Depends(get_current_user)):
    """Get personal analytics for the current user."""
    sims = await db.simulations.find(
        {"user_id": current_user.id, "status": "completed"}, {"_id": 0}
    ).to_list(1000)

    if not sims:
        return {
            "total_simulations": 0,
            "avg_score": 0,
            "category_breakdown": {},
            "difficulty_breakdown": {},
            "score_over_time": [],
            "cialdini_radar": {},
            "type_distribution": {},
            "improvement_rate": 0,
        }

    # Average score
    scores = [s.get("score", 0) for s in sims if s.get("score") is not None]
    avg_score = sum(scores) / len(scores) if scores else 0

    # Category breakdown (Cialdini)
    cialdini_scores = {}
    cialdini_counts = {}
    for sim in sims:
        categories = sim.get("challenge_data", {}).get("cialdini_categories", [])
        score = sim.get("score", 0) or 0
        for cat in categories:
            cialdini_scores.setdefault(cat, []).append(score)
            cialdini_counts[cat] = cialdini_counts.get(cat, 0) + 1

    cialdini_radar = {}
    for cat, cat_scores in cialdini_scores.items():
        cialdini_radar[cat] = round(sum(cat_scores) / len(cat_scores), 1) if cat_scores else 0

    # Difficulty breakdown
    difficulty_counts = {}
    difficulty_scores = {}
    for sim in sims:
        diff = sim.get("difficulty", "medium")
        difficulty_counts[diff] = difficulty_counts.get(diff, 0) + 1
        score = sim.get("score", 0) or 0
        difficulty_scores.setdefault(diff, []).append(score)

    difficulty_breakdown = {}
    for diff, d_scores in difficulty_scores.items():
        difficulty_breakdown[diff] = {
            "count": difficulty_counts.get(diff, 0),
            "avg_score": round(sum(d_scores) / len(d_scores), 1) if d_scores else 0,
        }

    # Score over time
    score_over_time = []
    for sim in sorted(sims, key=lambda s: s.get("started_at", "")):
        score_over_time.append(
            {
                "date": sim.get("completed_at", sim.get("started_at", "")),
                "score": sim.get("score", 0) or 0,
                "type": sim.get("simulation_type", "unknown"),
                "title": sim.get("title", "Untitled"),
            }
        )

    # Type distribution
    type_dist = {}
    for sim in sims:
        sim_type = sim.get("simulation_type", "unknown")
        type_dist[sim_type] = type_dist.get(sim_type, 0) + 1

    # Improvement rate (compare first half vs second half)
    improvement_rate = 0
    if len(scores) >= 4:
        mid = len(scores) // 2
        first_half_avg = sum(scores[:mid]) / mid
        second_half_avg = sum(scores[mid:]) / (len(scores) - mid)
        improvement_rate = round(second_half_avg - first_half_avg, 1)

    return {
        "total_simulations": len(sims),
        "avg_score": round(avg_score, 1),
        "category_breakdown": cialdini_counts,
        "difficulty_breakdown": difficulty_breakdown,
        "score_over_time": score_over_time,
        "cialdini_radar": cialdini_radar,
        "type_distribution": type_dist,
        "improvement_rate": improvement_rate,
    }


@router.get("/team")
async def get_team_analytics(current_user: User = Depends(get_current_user)):
    """Get team/organization analytics."""
    if not current_user.organization_id:
        return {"error": "Not part of an organization"}

    org = await db.organizations.find_one({"id": current_user.organization_id}, {"_id": 0})
    if not org:
        return {"error": "Organization not found"}

    member_ids = org.get("member_ids", [])
    members = await db.users.find(
        {"id": {"$in": member_ids}},
        {"_id": 0, "password_hash": 0},
    ).to_list(100)

    # Aggregate team stats
    team_stats = []
    total_sims = 0
    total_score = 0
    total_scored_sims = 0
    weakest_categories = {}

    for member in members:
        user_sims = await db.simulations.find(
            {"user_id": member["id"], "status": "completed"}, {"_id": 0}
        ).to_list(1000)

        user_scores = [s.get("score", 0) for s in user_sims if s.get("score") is not None]
        user_avg = sum(user_scores) / len(user_scores) if user_scores else 0
        total_sims += len(user_sims)
        total_score += sum(user_scores)
        total_scored_sims += len(user_scores)

        # Track per-category scores
        for sim in user_sims:
            categories = sim.get("challenge_data", {}).get("cialdini_categories", [])
            score = sim.get("score", 0) or 0
            for cat in categories:
                weakest_categories.setdefault(cat, []).append(score)

        team_stats.append(
            {
                "user_id": member["id"],
                "username": member.get("username", ""),
                "display_name": member.get("display_name", ""),
                "simulations_completed": len(user_sims),
                "avg_score": round(user_avg, 1),
                "level": member.get("level", 1),
            }
        )

    # Find weakest areas
    category_averages = {}
    for cat, cat_scores in weakest_categories.items():
        category_averages[cat] = round(sum(cat_scores) / len(cat_scores), 1)

    team_avg = round(total_score / total_scored_sims, 1) if total_scored_sims > 0 else 0

    return {
        "organization": {"id": org["id"], "name": org["name"]},
        "total_members": len(members),
        "total_simulations": total_sims,
        "team_avg_score": team_avg,
        "category_averages": category_averages,
        "member_stats": sorted(team_stats, key=lambda x: x["avg_score"], reverse=True),
    }
