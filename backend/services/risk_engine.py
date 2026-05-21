"""
Risk Engine

Calculates and maintains multi-dimensional behavioral risk profiles.

Design principle: risk is not punitive. It's a training baseline.
A low score in a dimension means the user needs more exposure to
scenarios that exercise that dimension — not that they failed.

The engine reads completed SimulationEvent logs and updates the user's
RiskProfile. It never decrements a dimension purely from inactivity —
only from demonstrated susceptibility in a completed scenario.
"""

import logging
from datetime import UTC, datetime

from models.schemas import (
    ChannelRiskProfile,
    RiskProfile,
    RiskVector,
)
from services.database import db

logger = logging.getLogger(__name__)

# Cialdini principle → event payload keys that indicate susceptibility
# When these payloads appear in a choice_made event, the user triggered that dimension
PRINCIPLE_TRIGGERS = {
    "reciprocity": ["reciprocity", "favor", "help_first", "gift"],
    "scarcity": ["scarcity", "urgency", "limited_time", "deadline", "now_or_never"],
    "authority": ["authority", "ceo", "executive", "it_admin", "official", "impersonation"],
    "commitment": ["commitment", "escalation", "foot_in_door", "follow_through"],
    "liking": ["liking", "rapport", "charm", "flattery", "similarity"],
    "social_proof": ["social_proof", "everyone_else", "colleagues", "most_people"],
}

# Channel labels that appear in simulation event payloads
CHANNEL_MAP = {
    "email_inbox": "email",
    "email": "email",
    "chat_ui": "chat",
    "chat": "chat",
    "phone_sim": "phone",
    "phone": "phone",
    "sms": "chat",
    "social_media": "social_media",
    "linkedin": "social_media",
    "in_person": "in_person",
}

# XP for good decisions raises the resistance score
GOOD_DECISION_BOOST = 3.0
# Bad decisions (detected susceptibility) reduces it
BAD_DECISION_PENALTY = 5.0
# Successful defense at the end of a simulation gives a bonus
SUCCESSFUL_DEFENSE_BONUS = 8.0
# Minimum score — a user is never rated at 0
FLOOR = 5.0
# Maximum score
CEILING = 95.0


def _clamp(value: float) -> float:
    return max(FLOOR, min(CEILING, value))


async def get_or_create_risk_profile(user_id: str) -> RiskProfile:
    """Fetch the user's risk profile, creating a default one if it doesn't exist."""
    doc = await db.risk_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return RiskProfile(**doc)

    profile = RiskProfile(user_id=user_id)
    await db.risk_profiles.insert_one(profile.model_dump())
    logger.info(f"Created new risk profile for user {user_id}")
    return profile


async def update_profile_from_simulation(
    user_id: str,
    simulation_id: str,
    events: list[dict],
    channel: str | None = None,
    final_outcome: str | None = None,
) -> RiskProfile:
    """
    Analyse a completed simulation's events and update the user's RiskProfile.

    Called by the simulation service when a simulation reaches a terminal state.
    """
    profile = await get_or_create_risk_profile(user_id)
    vector = profile.current_vector
    channel_profile = profile.channel_profile

    # Snapshot the vector before update for trend calculation
    before = vector.as_dict().copy()

    # Resolve communication channel
    resolved_channel = CHANNEL_MAP.get(channel or "", None)

    # Walk through event log
    for event in events:
        event_type = event.get("event_type", event.get("type", ""))
        payload = event.get("payload", event)  # some events store data flat

        if event_type == "choice_made":
            actor = event.get("actor", "user")
            if actor != "user":
                continue

            score_impact = _extract_score_impact(payload)
            cialdini_triggers = _extract_cialdini_triggers(payload)

            for principle in cialdini_triggers:
                current_val = getattr(vector, principle, 50.0)
                if score_impact < 0:
                    # User made a bad choice — susceptibility demonstrated
                    new_val = _clamp(current_val - BAD_DECISION_PENALTY)
                else:
                    # User chose correctly in a high-pressure moment
                    new_val = _clamp(current_val + GOOD_DECISION_BOOST)
                setattr(vector, principle, new_val)

    # Apply outcome bonus/penalty
    if final_outcome == "completed":  # user successfully defended
        for principle in vector.as_dict():
            current_val = getattr(vector, principle, 50.0)
            setattr(vector, principle, _clamp(current_val + SUCCESSFUL_DEFENSE_BONUS))
    elif final_outcome == "failed":  # user was compromised
        # No blanket penalty — individual choices already captured above
        pass

    # Update channel profile
    if resolved_channel:
        channel_val = getattr(channel_profile, resolved_channel, 50.0)
        if final_outcome == "completed":
            new_channel_val = _clamp(channel_val + SUCCESSFUL_DEFENSE_BONUS)
        elif final_outcome == "failed":
            new_channel_val = _clamp(channel_val - BAD_DECISION_PENALTY)
        else:
            new_channel_val = channel_val
        setattr(channel_profile, resolved_channel, new_channel_val)

    # Compute trend (improving / declining / stable per dimension)
    after = vector.as_dict()
    trend = {}
    for dim, before_val in before.items():
        delta = after[dim] - before_val
        if delta > 1.0:
            trend[dim] = "improving"
        elif delta < -1.0:
            trend[dim] = "declining"
        else:
            trend[dim] = "stable"

    # Identify high-risk dimensions (below 40)
    high_risk = [dim for dim, val in after.items() if val < 40.0]

    # Generate simple recommendations
    recommendations = _generate_recommendations(vector, high_risk)

    # Update profile
    profile.current_vector = vector
    profile.channel_profile = channel_profile
    profile.trend = trend
    profile.high_risk_dimensions = high_risk
    profile.recommendations = recommendations
    profile.total_simulations += 1
    profile.total_events += len(events)
    profile.last_updated = datetime.now(UTC).isoformat()

    # Persist
    await db.risk_profiles.update_one(
        {"user_id": user_id},
        {"$set": profile.model_dump()},
        upsert=True,
    )

    logger.info(f"Updated risk profile for user {user_id}: avg={vector.average():.1f}")
    return profile


def _extract_score_impact(payload: dict) -> float:
    """Extract the score impact value from an event payload."""
    return float(payload.get("score_impact", payload.get("impact", 0)))


def _extract_cialdini_triggers(payload: dict) -> list[str]:
    """
    Identify which Cialdini principles were active in this event.
    Checks payload keys and values against the PRINCIPLE_TRIGGERS map.
    """
    triggered = []
    payload_text = " ".join(str(v).lower() for v in payload.values())

    for principle, keywords in PRINCIPLE_TRIGGERS.items():
        if any(kw in payload_text for kw in keywords):
            triggered.append(principle)

    # Also check explicit 'cialdini_trigger' key
    explicit = payload.get("cialdini_trigger")
    if explicit and explicit in PRINCIPLE_TRIGGERS and explicit not in triggered:
        triggered.append(explicit)

    return triggered


def _generate_recommendations(vector: RiskVector, high_risk: list[str]) -> list[str]:
    """
    Generate plain-language training recommendations based on the risk vector.
    Recommendations are training-focused, not judgmental.
    """
    recs = []
    values = vector.as_dict()

    if "authority" in high_risk:
        recs.append("Practice scenarios involving executive impersonation and IT impersonation attacks.")
    if "scarcity" in high_risk:
        recs.append("Train on high-urgency scenarios — urgency is the most common manipulation trigger.")
    if "liking" in high_risk:
        recs.append("Explore reconnaissance and rapport-building scenarios to recognize charm-based approaches.")
    if "reciprocity" in high_risk:
        recs.append("Study scenarios where attackers offer unsolicited help before making requests.")
    if "commitment" in high_risk:
        recs.append("Practice recognizing foot-in-the-door escalation techniques.")
    if "social_proof" in high_risk:
        recs.append("Train on scenarios that cite peer behavior to create false social norms.")

    if not recs and values:
        # No high-risk areas — maintenance training
        weakest = vector.weakest_dimension()
        recs.append(
            f"Continue building resistance in '{weakest}' scenarios to maintain your awareness posture."
        )

    return recs[:3]  # Keep focused — max 3 recommendations


async def get_org_risk_map(org_id: str) -> dict:
    """
    Aggregate risk profiles across all members of an organization.
    Returns a department-level heatmap and org-wide summary.
    """
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        return {"error": "Organization not found"}

    member_ids = org.get("member_ids", [])
    if not member_ids:
        return {"member_count": 0, "dimensions": {}, "department_map": {}}

    profiles = await db.risk_profiles.find(
        {"user_id": {"$in": member_ids}}, {"_id": 0}
    ).to_list(len(member_ids))

    if not profiles:
        return {"member_count": len(member_ids), "coverage": 0, "dimensions": {}}

    dimensions = ["reciprocity", "scarcity", "authority", "commitment", "liking", "social_proof"]
    aggregated = {dim: [] for dim in dimensions}

    for p in profiles:
        vec = p.get("current_vector", {})
        for dim in dimensions:
            aggregated[dim].append(vec.get(dim, 50.0))

    avg_dimensions = {
        dim: round(sum(vals) / len(vals), 1) if vals else 50.0
        for dim, vals in aggregated.items()
    }

    coverage = round(len(profiles) / len(member_ids) * 100, 1)

    return {
        "member_count": len(member_ids),
        "trained_count": len(profiles),
        "coverage_pct": coverage,
        "dimensions": avg_dimensions,
        "weakest_org_dimension": min(avg_dimensions, key=avg_dimensions.get),
    }
