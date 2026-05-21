import logging

from services.database import db

logger = logging.getLogger(__name__)

# Difficulty scaling rules
DIFFICULTY_ORDER = ["easy", "medium", "hard"]


async def get_recommended_difficulty(user_id: str) -> str:
    """Calculate recommended difficulty based on user performance."""
    sims = (
        await db.simulations.find(
            {"user_id": user_id, "status": "completed"},
            {"_id": 0, "score": 1, "difficulty": 1, "started_at": 1},
        )
        .sort("started_at", -1)
        .to_list(10)
    )

    if not sims or len(sims) < 3:
        return "easy"

    # Look at last 5 simulations
    recent = sims[:5]
    recent_scores = [s.get("score", 50) or 50 for s in recent]
    avg_score = sum(recent_scores) / len(recent_scores)

    current_difficulty = recent[0].get("difficulty", "medium")
    current_idx = (
        DIFFICULTY_ORDER.index(current_difficulty) if current_difficulty in DIFFICULTY_ORDER else 1
    )

    # Escalate if consistently scoring high
    if avg_score >= 85 and current_idx < len(DIFFICULTY_ORDER) - 1:
        return DIFFICULTY_ORDER[current_idx + 1]
    # De-escalate if struggling
    elif avg_score < 40 and current_idx > 0:
        return DIFFICULTY_ORDER[current_idx - 1]

    return current_difficulty


async def get_recommended_categories(user_id: str) -> list:
    """Suggest Cialdini categories the user needs to practice."""
    sims = await db.simulations.find(
        {"user_id": user_id, "status": "completed"},
        {"_id": 0, "score": 1, "challenge_data": 1},
    ).to_list(100)

    category_scores = {}
    category_counts = {}

    for sim in sims:
        categories = sim.get("challenge_data", {}).get("cialdini_categories", [])
        score = sim.get("score", 50) or 50
        for cat in categories:
            category_scores.setdefault(cat, []).append(score)
            category_counts[cat] = category_counts.get(cat, 0) + 1

    # Find weak areas (lowest avg scores) and unexplored areas
    all_categories = [
        "reciprocity",
        "scarcity",
        "authority",
        "commitment",
        "liking",
        "social_proof",
    ]
    recommendations = []

    for cat in all_categories:
        if cat not in category_scores:
            recommendations.append(
                {
                    "category": cat,
                    "reason": "not_attempted",
                    "avg_score": 0,
                }
            )
        else:
            avg = sum(category_scores[cat]) / len(category_scores[cat])
            if avg < 70:
                recommendations.append(
                    {
                        "category": cat,
                        "reason": "needs_improvement",
                        "avg_score": round(avg, 1),
                    }
                )

    # Sort: not_attempted first, then lowest scores
    recommendations.sort(key=lambda x: (x["reason"] != "not_attempted", x["avg_score"]))

    return recommendations[:3]


async def get_adaptive_persona_params(user_id: str) -> dict:
    """Get adaptive parameters for AI chat persona based on user skill."""
    difficulty = await get_recommended_difficulty(user_id)

    params = {
        "easy": {
            "aggressiveness": 0.3,
            "persistence": 2,
            "technique_complexity": "basic",
            "hints_enabled": True,
            "instruction": (
                "Be somewhat obvious in your manipulation. "
                "Use simple techniques. "
                "Give the user clear red flags to catch."
            ),
        },
        "medium": {
            "aggressiveness": 0.6,
            "persistence": 4,
            "technique_complexity": "intermediate",
            "hints_enabled": False,
            "instruction": (
                "Use moderately sophisticated manipulation. Mix techniques. Don't be too obvious."
            ),
        },
        "hard": {
            "aggressiveness": 0.9,
            "persistence": 6,
            "technique_complexity": "advanced",
            "hints_enabled": False,
            "instruction": (
                "Use highly sophisticated, multi-layered "
                "manipulation. Combine Cialdini principles. "
                "Be very convincing and persistent. "
                "Adapt your approach when resisted."
            ),
        },
    }

    return {
        "recommended_difficulty": difficulty,
        "params": params.get(difficulty, params["medium"]),
    }
