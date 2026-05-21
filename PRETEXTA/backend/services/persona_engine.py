"""
Persona Engine

Manages the behavioral state of a persona within a simulation session.

A persona has two distinct parts:
  PersonaProfile — static definition (who the persona is, what they want)
  PersonaState   — mutable state within a simulation (how far along the attack is,
                   what the persona knows, how much pressure has been applied)

The engine is responsible for:
  1. Initializing persona state at simulation start
  2. Updating state based on simulation events
  3. Providing the AI Gateway with the state context it needs for coherent responses
  4. Detecting and recording defense demonstrations by the user
  5. Storing persona profiles in the backend (bridging from frontend JS data)

Design note: PersonaState is stored as part of the Simulation document, not as a
separate collection. This keeps simulation snapshots self-contained for replay.
"""

import logging
from datetime import UTC, datetime

from models.schemas import (
    PersonaMemoryEntry,
    PersonaProfile,
    PersonaState,
)
from services.database import db

logger = logging.getLogger(__name__)


# Defense keywords — if the user says these, record it as a demonstrated defense
DEFENSE_SIGNALS = {
    "authority": [
        "verify", "call you back", "official number", "confirm identity",
        "check with IT", "this is suspicious", "how do I know",
    ],
    "scarcity": [
        "take my time", "not urgent", "I'll check first", "no rush",
        "why the deadline", "seems rushed",
    ],
    "reciprocity": [
        "I didn't ask for this", "this feels like a setup", "why would you help",
        "what do you want in return",
    ],
    "liking": [
        "I don't know you well enough", "this feels too personal",
        "why are you being so friendly",
    ],
    "commitment": [
        "I'm reconsidering", "I shouldn't have agreed", "I need to cancel",
        "I'm not comfortable continuing",
    ],
    "social_proof": [
        "just because others did", "I'll decide for myself",
        "I don't care what others did",
    ],
}


class PersonaEngine:
    """
    Manages persona state transitions during a simulation.
    One instance per active simulation session.
    """

    def __init__(self, persona_profile: dict, simulation_id: str):
        self._profile = persona_profile
        self._simulation_id = simulation_id

    def initialize_state(self) -> PersonaState:
        """Create the initial PersonaState for a new simulation."""
        return PersonaState(
            persona_id=self._profile.get("id", "unknown"),
            simulation_id=self._simulation_id,
            pressure_level=0.0,
            current_strategy=self._initial_strategy(),
            turn_count=0,
            memory=[],
            outcome=None,
            defenses_demonstrated=[],
        )

    def update_state(
        self,
        state: PersonaState,
        user_message: str,
        ai_response_status: str,
        ai_state_updates: dict,
    ) -> PersonaState:
        """
        Update persona state based on what happened in a turn.

        user_message: what the user said
        ai_response_status: "ongoing" | "success_attack" | "attack_failed"
        ai_state_updates: hints from the AI Gateway
        """
        # Apply AI Gateway state hints
        if "outcome" in ai_state_updates:
            state.outcome = ai_state_updates["outcome"]
        if "pressure_level" in ai_state_updates:
            state.pressure_level = ai_state_updates["pressure_level"]
        if "turn_count" in ai_state_updates:
            state.turn_count = ai_state_updates["turn_count"]
        else:
            state.turn_count += 1

        # Apply outcome from status
        if ai_response_status == "success_attack" and not state.outcome:
            state.outcome = "success"
        elif ai_response_status == "attack_failed" and not state.outcome:
            state.outcome = "failure"

        # Update strategy based on pressure level
        state.current_strategy = self._resolve_strategy(state.pressure_level)

        # Detect defense demonstrations from user message
        defenses = _detect_defenses(user_message)
        for defense in defenses:
            if defense not in state.defenses_demonstrated:
                state.defenses_demonstrated.append(defense)
                logger.debug(f"Defense demonstrated: {defense} in simulation {self._simulation_id}")

        # Extract memory entries from user message
        new_memories = _extract_memory_hints(user_message, state.turn_count)
        state.memory.extend(new_memories)

        return state

    def _initial_strategy(self) -> str:
        escalation = self._profile.get("escalation_pattern", "gradual")
        if escalation == "immediate":
            return "direct_attack"
        elif escalation == "patience":
            return "deep_rapport"
        return "rapport_building"

    def _resolve_strategy(self, pressure: float) -> str:
        escalation = self._profile.get("escalation_pattern", "gradual")
        if escalation == "immediate":
            return "direct_attack"
        if escalation == "patience":
            return "deep_rapport" if pressure < 0.6 else "soft_ask"
        # gradual / adaptive
        if pressure < 0.25:
            return "rapport_building"
        elif pressure < 0.5:
            return "soft_probe"
        elif pressure < 0.75:
            return "direct_ask"
        else:
            return "high_pressure"

    def state_to_context(self, state: PersonaState) -> dict:
        """Export state as context dict suitable for the AI Gateway prompt."""
        return {
            "pressure_level": state.pressure_level,
            "current_strategy": state.current_strategy,
            "turn_count": state.turn_count,
            "memory": [m.model_dump() for m in state.memory[:5]],  # last 5 facts
            "defenses_seen": state.defenses_demonstrated,
        }


# ── Persona catalog ────────────────────────────────────────────────


async def get_persona_catalog() -> list[dict]:
    """
    Return all persona profiles.
    First tries the database; if empty, seeds from the frontend JS data
    (backward-compatible bootstrap).
    """
    personas = await db.personas.find({}, {"_id": 0}).to_list(100)
    if personas:
        return personas

    # Bootstrap from static data — only on first call
    seeded = await _seed_persona_catalog()
    return seeded


async def _seed_persona_catalog() -> list[dict]:
    """
    Seed the persona catalog from the static frontend data.
    Called once on first access. Returns the seeded list.

    In the future, personas will be managed entirely via backend CRUD.
    For now, the frontend aiPersonas.js is the source of truth.
    """
    # Import static data — this is intentionally coupling to avoid duplication until
    # a proper backend persona management API is built.
    # When persona CRUD is implemented, delete this function and the static JS file.
    STATIC_PERSONAS = _get_static_personas()

    if not STATIC_PERSONAS:
        return []

    # Insert all, ignore duplicates
    for persona in STATIC_PERSONAS:
        await db.personas.update_one(
            {"id": persona["id"]},
            {"$setOnInsert": persona},
            upsert=True,
        )

    logger.info(f"Seeded {len(STATIC_PERSONAS)} personas into database")
    return STATIC_PERSONAS


def _get_static_personas() -> list[dict]:
    """
    Static persona definitions — mirrors frontend aiPersonas.js.
    This is the bootstrap source until backend persona management exists.
    """
    return [
        {
            "id": "ceo_urgent",
            "name": "The Urgent CEO",
            "role": "Executive Impersonator",
            "category": "Business Email Compromise (BEC)",
            "difficulty": "hard",
            "channel": "chat",
            "goal": "Force wire transfer via authority and urgency",
            "communication_style": "Authoritative, impatient, slightly rude",
            "scenario_context": "Late Friday, needs urgent confidential payment",
            "description": "Impersonates a high-level executive demanding urgent action to bypass standard procedures.",
            "opening_line": "Hey, are you at your desk? I need a favor ASAP. It's confidential.",
            "cialdini_principles": ["authority", "scarcity"],
            "escalation_pattern": "immediate",
            "knowledge_bounds": {"knows_company": True, "knows_target_name": False},
        },
        {
            "id": "it_support",
            "name": "IT Support (Fake)",
            "role": "Tech Support Impersonator",
            "category": "Tech Support Scam",
            "difficulty": "medium",
            "channel": "chat",
            "goal": "Get remote access or password under guise of security fix",
            "communication_style": "Helpful, technical, pushy about policy",
            "scenario_context": "Claiming account is compromised and needs immediate update",
            "description": "Impersonates IT staff claiming a security breach to trick into granting access.",
            "opening_line": "Hello, this is IT Security. We detected unusual login attempts on your account.",
            "cialdini_principles": ["authority", "commitment"],
            "escalation_pattern": "gradual",
            "knowledge_bounds": {"knows_it_systems": True, "knows_target_name": False},
        },
        {
            "id": "hr_recruiter",
            "name": "Headhunter",
            "role": "Phishing Recruiter",
            "category": "Phishing",
            "difficulty": "easy",
            "channel": "email",
            "goal": "Get target to open malicious document",
            "communication_style": "Professional, flattering, promising",
            "scenario_context": "Offering dream job, sends malicious PDF",
            "description": "Lures with a lucrative job offer to deliver malware via a document.",
            "opening_line": "Hi! I saw your profile on LinkedIn and I'm incredibly impressed. We have a VP Role opening that pays double your current salary.",
            "cialdini_principles": ["liking", "scarcity"],
            "escalation_pattern": "gradual",
            "knowledge_bounds": {"knows_linkedin": True, "knows_target_name": True},
        },
        {
            "id": "vendor_invoice",
            "name": "Angry Vendor",
            "role": "Finance Fraud Actor",
            "category": "Finance Fraud",
            "difficulty": "medium",
            "channel": "email",
            "goal": "Get target to pay fake overdue invoice",
            "communication_style": "Aggressive, threatening legal action",
            "scenario_context": "Claims payment 90 days overdue, threatening service cutoff",
            "description": "Uses fear of service disruption to force a fraudulent payment.",
            "opening_line": "THIS IS THE THIRD NOTICE. Your account is 90 days overdue. We are cutting off services in 1 hour.",
            "cialdini_principles": ["scarcity", "social_proof"],
            "escalation_pattern": "immediate",
            "knowledge_bounds": {"knows_company": True, "knows_finances": False},
        },
        {
            "id": "colleague_emergency",
            "name": "Colleague in Distress",
            "role": "Social Engineer",
            "category": "Social Engineering",
            "difficulty": "medium",
            "channel": "chat",
            "goal": "Get 2FA code or login token",
            "communication_style": "Panic-stricken, desperate, rushed",
            "scenario_context": "Locked out before big presentation, needs forwarded code",
            "description": "Exploits willingness to help a coworker in an emergency.",
            "opening_line": "Omg, I'm so sorry to bother you! I'm locked out and I have the board presentation in 5 mins!",
            "cialdini_principles": ["liking", "reciprocity"],
            "escalation_pattern": "immediate",
            "knowledge_bounds": {"knows_target": True, "knows_company_context": True},
        },
        {
            "id": "deepfake_ceo_video",
            "name": "CEO Video Call (Deepfake)",
            "role": "AI-Assisted Attacker",
            "category": "Deepfake / AI-Assisted Attack",
            "difficulty": "hard",
            "channel": "chat",
            "goal": "Authorize emergency fund transfer via simulated video call",
            "communication_style": "Warm, familiar, slightly glitchy",
            "scenario_context": "Late evening M&A deal, urgent wire transfer before midnight",
            "description": "Simulates a deepfake video call from the CEO demanding emergency action.",
            "opening_line": "Hey, glad I caught you online. Listen, I know it's late but remember that acquisition we discussed last Thursday?",
            "cialdini_principles": ["authority", "liking"],
            "escalation_pattern": "gradual",
            "knowledge_bounds": {"knows_company": True, "knows_recent_events": True},
        },
        {
            "id": "mfa_fatigue",
            "name": "Persistent Hacker",
            "role": "Account Takeover Actor",
            "category": "MFA Fatigue / Account Takeover",
            "difficulty": "hard",
            "channel": "chat",
            "goal": "Get MFA approval by overwhelming with notifications",
            "communication_style": "Rapid, alternating IT impersonation and social pressure",
            "scenario_context": "Phone buzzing with MFA requests, fake IT calls to approve one",
            "description": "Simulates MFA fatigue attack combined with social engineering.",
            "opening_line": "URGENT: Security Operations Center here. We've detected brute-force on your MFA. Approve the NEXT push — that's us locking your account.",
            "cialdini_principles": ["authority", "scarcity"],
            "escalation_pattern": "immediate",
            "knowledge_bounds": {"knows_mfa_system": True, "knows_target": False},
        },
        {
            "id": "romance_recon",
            "name": "Conference Contact",
            "role": "Intelligence Gatherer",
            "category": "Reconnaissance / Pretexting",
            "difficulty": "medium",
            "channel": "chat",
            "goal": "Extract org chart, tech stack, and executive travel schedules",
            "communication_style": "Charming, intellectually curious, builds rapport slowly",
            "scenario_context": "Claims to have met at industry conference, building rapport before intel gathering",
            "description": "Slow-burn intelligence gathering through rapport and curiosity.",
            "opening_line": "Hey! We met briefly at the CyberSec Summit — you were at the Zero Trust panel, right?",
            "cialdini_principles": ["liking", "reciprocity"],
            "escalation_pattern": "patience",
            "knowledge_bounds": {"knows_industry": True, "knows_target_profile": True},
        },
    ]


# ── Defense detection ─────────────────────────────────────────────


def _detect_defenses(user_message: str) -> list[str]:
    """
    Scan a user message for demonstrated security awareness behaviors.
    Returns list of Cialdini dimension names where defense was shown.
    """
    message_lower = user_message.lower()
    detected = []
    for principle, signals in DEFENSE_SIGNALS.items():
        if any(signal in message_lower for signal in signals):
            detected.append(principle)
    return detected


def _extract_memory_hints(user_message: str, turn: int) -> list[PersonaMemoryEntry]:
    """
    Extract potentially useful facts from what the user said.
    Very lightweight — just name/role hints for now.
    Full NLP extraction is a future feature.
    """
    hints = []
    lower = user_message.lower()

    # Role hint patterns
    for role_kw in ["manager", "director", "admin", "engineer", "analyst", "cto", "cfo"]:
        if role_kw in lower:
            hints.append(
                PersonaMemoryEntry(
                    fact_type="role_hint",
                    value=role_kw,
                    confidence=0.6,
                    turn_extracted=turn,
                )
            )
            break

    return hints
