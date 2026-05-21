import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User
from services.auth import get_current_user
from services.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/debrief", tags=["debrief"])

CIALDINI_DESCRIPTIONS = {
    "reciprocity": (
        "The attacker gave you something (a favor, information) to create a sense of obligation."
    ),
    "scarcity": (
        "Urgency or limited availability was used to pressure you into acting without thinking."
    ),
    "authority": (
        "The attacker impersonated someone in a position of power to override your judgment."
    ),
    "commitment": ("Small initial compliance was used to build toward larger, riskier requests."),
    "liking": ("The attacker built rapport or familiarity to lower your defenses."),
    "social_proof": ("References to what 'others are doing' were used to normalize the request."),
}


@router.get("/{simulation_id}")
async def get_debrief(simulation_id: str, current_user: User = Depends(get_current_user)):
    """Get or generate post-simulation debrief analysis."""
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Return cached debrief if exists
    if sim.get("debrief"):
        return sim["debrief"]

    # Generate debrief
    debrief = await _generate_debrief(sim)

    # Cache it
    await db.simulations.update_one(
        {"id": simulation_id},
        {"$set": {"debrief": debrief}},
    )

    return debrief


async def _generate_debrief(sim: dict[str, Any]) -> dict[str, Any]:
    """Generate a detailed debrief analysis."""
    events = sim.get("events", [])
    score = sim.get("score", 0) or 0
    categories = sim.get("challenge_data", {}).get("cialdini_categories", [])

    # Key moments analysis
    key_moments = []
    for i, event in enumerate(events):
        if event.get("action") in ("complied", "clicked", "shared_info", "refused", "reported"):
            key_moments.append(
                {
                    "index": i,
                    "action": event.get("action"),
                    "was_correct": event.get("action") in ("refused", "reported"),
                    "description": event.get("description", ""),
                    "tip": _get_tip_for_action(event.get("action", "")),
                }
            )

    # Cialdini analysis
    cialdini_analysis = []
    for cat in categories:
        cialdini_analysis.append(
            {
                "principle": cat,
                "description": CIALDINI_DESCRIPTIONS.get(cat, ""),
                "was_used": True,
            }
        )

    # Performance rating
    if score >= 90:
        rating = "excellent"
        summary = (
            "You demonstrated strong awareness and successfully identified the attack vectors."
        )
    elif score >= 70:
        rating = "good"
        summary = "Good performance. You caught most red flags but had some vulnerable moments."
    elif score >= 50:
        rating = "fair"
        summary = (
            "Mixed results. You fell for some manipulation "
            "techniques. Review the key moments below."
        )
    else:
        rating = "needs_improvement"
        summary = (
            "The attacker was able to exploit psychological "
            "vulnerabilities. Focus on the tips below."
        )

    # Recommendations
    recommendations = []
    if score < 70:
        recommendations.append(
            "Always verify identity through a separate, "
            "trusted channel before complying with requests."
        )
    if "authority" in categories:
        recommendations.append(
            "Question authority-based requests. Legitimate "
            "leaders rarely bypass established procedures."
        )
    if "scarcity" in categories:
        recommendations.append(
            "Be suspicious of artificial urgency. Take time to verify before acting."
        )
    if "reciprocity" in categories:
        recommendations.append(
            "Unsolicited favors may be manipulation. Don't feel obligated to reciprocate."
        )
    if score >= 80:
        recommendations.append("Great defense! Try harder difficulty scenarios to keep improving.")

    return {
        "simulation_id": sim.get("id"),
        "title": sim.get("title", "Untitled"),
        "score": score,
        "rating": rating,
        "summary": summary,
        "cialdini_analysis": cialdini_analysis,
        "key_moments": key_moments,
        "recommendations": recommendations,
        "total_events": len(events),
        "correct_actions": sum(1 for m in key_moments if m.get("was_correct")),
        "incorrect_actions": sum(1 for m in key_moments if not m.get("was_correct")),
    }


def _get_tip_for_action(action: str) -> str:
    tips = {
        "complied": (
            "You complied with a suspicious request. Always verify through official channels."
        ),
        "clicked": (
            "You clicked a potentially malicious link. Hover over links to check URLs first."
        ),
        "shared_info": (
            "You shared sensitive information. Never share credentials over unverified channels."
        ),
        "refused": ("Good call! Refusing suspicious requests is the right approach."),
        "reported": (
            "Excellent! Reporting suspicious activity helps protect the entire organization."
        ),
    }
    return tips.get(action, "")


@router.post("/{simulation_id}/ai-analysis")
async def get_ai_debrief(simulation_id: str, current_user: User = Depends(get_current_user)):
    """Generate AI-powered deep behavioral analysis (requires LLM config)."""
    from services.ai_gateway import AIGateway

    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    gateway = await AIGateway.from_db()
    if not gateway:
        raise HTTPException(status_code=400, detail="LLM not configured. Add an API key in Settings.")

    # Build a minimal persona dict from simulation data
    persona = {
        "name": sim.get("title", "Unknown Attacker"),
        "category": sim.get("challenge_data", {}).get("cialdini_categories", ["general"])[0] if sim.get("challenge_data") else "general",
    }

    try:
        result = await gateway.analyze_simulation(
            event_log=sim.get("events", []),
            persona=persona,
            final_score=sim.get("score", 0),
        )
        analysis_text = (
            f"**Summary:** {result.summary}\n\n"
            f"**Cialdini Analysis:**\n"
            + "\n".join(f"- **{k}:** {v}" for k, v in result.cialdini_breakdown.items())
            + f"\n\n**Recommendations:**\n"
            + "\n".join(f"- {r}" for r in result.recommendations)
        ) if not isinstance(result.summary, dict) else result.summary

        return {
            "ai_analysis": analysis_text,
            "simulation_id": simulation_id,
            "provider": result.provider,
        }
    except Exception as e:
        logger.error(f"AI debrief failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)[:100]}")
