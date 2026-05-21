import logging
from datetime import UTC, datetime

from services.database import db

logger = logging.getLogger(__name__)

# XP thresholds per level
LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000]

# Badge definitions
BADGE_DEFINITIONS = [
    {
        "id": "first_blood",
        "name": "First Blood",
        "description": "Complete your first simulation",
        "icon": "Sword",
        "condition": "complete_1_simulation",
        "xp_reward": 50,
    },
    {
        "id": "phishing_detector",
        "name": "Phishing Detector",
        "description": "Score 80%+ on 3 phishing scenarios",
        "icon": "Shield",
        "condition": "phishing_score_80_x3",
        "xp_reward": 100,
    },
    {
        "id": "social_proof_immune",
        "name": "Social Proof Immune",
        "description": "Resist all social proof attacks",
        "icon": "Users",
        "condition": "resist_social_proof_x3",
        "xp_reward": 100,
    },
    {
        "id": "authority_challenger",
        "name": "Authority Challenger",
        "description": "Score 90%+ on authority-based attacks",
        "icon": "Crown",
        "condition": "authority_score_90",
        "xp_reward": 150,
    },
    {
        "id": "streak_3",
        "name": "On Fire",
        "description": "Maintain a 3-day streak",
        "icon": "Flame",
        "condition": "streak_3",
        "xp_reward": 75,
    },
    {
        "id": "streak_7",
        "name": "Unstoppable",
        "description": "Maintain a 7-day streak",
        "icon": "Zap",
        "condition": "streak_7",
        "xp_reward": 150,
    },
    {
        "id": "streak_30",
        "name": "Iron Will",
        "description": "Maintain a 30-day streak",
        "icon": "Trophy",
        "condition": "streak_30",
        "xp_reward": 500,
    },
    {
        "id": "quiz_master",
        "name": "Quiz Master",
        "description": "Score 100% on 5 quizzes",
        "icon": "BookCheck",
        "condition": "quiz_perfect_x5",
        "xp_reward": 200,
    },
    {
        "id": "all_categories",
        "name": "Cialdini Scholar",
        "description": "Complete scenarios in all 6 categories",
        "icon": "Brain",
        "condition": "all_cialdini_categories",
        "xp_reward": 300,
    },
    {
        "id": "campaign_hero",
        "name": "Campaign Hero",
        "description": "Complete a campaign with 80%+ avg score",
        "icon": "Flag",
        "condition": "campaign_complete_80",
        "xp_reward": 250,
    },
    {
        "id": "team_player",
        "name": "Team Player",
        "description": "Join an organization",
        "icon": "Users2",
        "condition": "join_organization",
        "xp_reward": 50,
    },
    {
        "id": "scenario_creator",
        "name": "Scenario Creator",
        "description": "Publish a custom scenario",
        "icon": "Pencil",
        "condition": "publish_scenario",
        "xp_reward": 200,
    },
]


def calculate_level(xp: int) -> int:
    """Calculate level from XP."""
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if xp >= LEVEL_THRESHOLDS[i]:
            return i + 1
    return 1


def xp_for_next_level(current_xp: int) -> dict:
    """Get XP progress to next level."""
    level = calculate_level(current_xp)
    if level >= len(LEVEL_THRESHOLDS):
        return {"current": current_xp, "next_level_xp": current_xp, "progress": 100}

    current_threshold = LEVEL_THRESHOLDS[level - 1]
    next_threshold = LEVEL_THRESHOLDS[level] if level < len(LEVEL_THRESHOLDS) else current_xp
    progress = ((current_xp - current_threshold) / (next_threshold - current_threshold)) * 100

    return {
        "current_xp": current_xp,
        "level": level,
        "current_threshold": current_threshold,
        "next_threshold": next_threshold,
        "progress": round(min(progress, 100), 1),
    }


async def award_xp(user_id: str, xp_amount: int, check_streak: bool = False) -> dict:
    """Award XP to user and check for level ups and badges."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return {}

    now = datetime.now(UTC)
    updates = {}
    new_badges = []

    # Streak logic
    if check_streak:
        last_active = user.get("last_active")
        streak = user.get("streak_days", 0)

        if last_active:
            if isinstance(last_active, str):
                last_active = datetime.fromisoformat(last_active.replace("Z", "+00:00"))
            days_diff = (now.date() - last_active.date()).days

            if days_diff == 1:
                streak += 1
            elif days_diff > 1:
                streak = 1
            # Same day = no change
        else:
            streak = 1

        updates["streak_days"] = streak
        updates["last_active"] = now.isoformat()

        # Streak badges
        if streak >= 3 and "streak_3" not in user.get("badges", []):
            new_badges.append("streak_3")
            xp_amount += 75
        if streak >= 7 and "streak_7" not in user.get("badges", []):
            new_badges.append("streak_7")
            xp_amount += 150
        if streak >= 30 and "streak_30" not in user.get("badges", []):
            new_badges.append("streak_30")
            xp_amount += 500

    # Update XP
    new_xp = user.get("xp", 0) + xp_amount
    new_level = calculate_level(new_xp)
    updates["xp"] = new_xp
    updates["level"] = new_level

    # Apply badge updates
    if new_badges:
        await db.users.update_one(
            {"id": user_id},
            {"$addToSet": {"badges": {"$each": new_badges}}},
        )

    await db.users.update_one({"id": user_id}, {"$set": updates})

    # Create notifications for new badges
    for badge_id in new_badges:
        badge_def = next((b for b in BADGE_DEFINITIONS if b["id"] == badge_id), None)
        if badge_def:
            await db.notifications.insert_one(
                {
                    "id": str(__import__("uuid").uuid4()),
                    "user_id": user_id,
                    "title": f"Badge Earned: {badge_def['name']}",
                    "message": badge_def["description"],
                    "type": "achievement",
                    "read": False,
                    "created_at": now.isoformat(),
                }
            )

    leveled_up = new_level > user.get("level", 1)
    if leveled_up:
        await db.notifications.insert_one(
            {
                "id": str(__import__("uuid").uuid4()),
                "user_id": user_id,
                "title": f"Level Up! You're now Level {new_level}",
                "message": f"Keep training to reach Level {new_level + 1}!",
                "type": "achievement",
                "read": False,
                "created_at": now.isoformat(),
            }
        )

    return {
        "xp_earned": xp_amount,
        "total_xp": new_xp,
        "level": new_level,
        "leveled_up": leveled_up,
        "new_badges": new_badges,
    }


async def check_simulation_badges(user_id: str):
    """Check and award badges based on simulation history."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return

    existing_badges = user.get("badges", [])
    sims = await db.simulations.find(
        {"user_id": user_id, "status": "completed"}, {"_id": 0}
    ).to_list(1000)

    new_badges = []
    total_xp = 0

    # First Blood
    if "first_blood" not in existing_badges and len(sims) >= 1:
        new_badges.append("first_blood")
        total_xp += 50

    # Quiz Master: 5 perfect quiz scores
    quiz_sims = [s for s in sims if s.get("simulation_type") == "quiz" and s.get("score", 0) == 100]
    if "quiz_master" not in existing_badges and len(quiz_sims) >= 5:
        new_badges.append("quiz_master")
        total_xp += 200

    # All Cialdini categories
    all_categories = set()
    for s in sims:
        cats = s.get("challenge_data", {}).get("cialdini_categories", [])
        all_categories.update(cats)
    cialdini_6 = {"reciprocity", "scarcity", "authority", "commitment", "liking", "social_proof"}
    if "all_categories" not in existing_badges and cialdini_6.issubset(all_categories):
        new_badges.append("all_categories")
        total_xp += 300

    if new_badges:
        await db.users.update_one(
            {"id": user_id},
            {"$addToSet": {"badges": {"$each": new_badges}}},
        )
        if total_xp > 0:
            await award_xp(user_id, total_xp)
