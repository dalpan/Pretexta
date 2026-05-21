"""
AI Gateway

Unified interface for all LLM operations in Pretexta.
Wraps the lower-level services/llm.py provider dispatch.

Design goals:
- Callers specify INTENT (chat, generate_scenario, analyze_risk),
  not provider details.
- Prompt construction is centralized here, not scattered in routes.
- Fallback chains are transparent to callers.
- All AI calls are training-context framed — never raw pass-through.

This is the ONLY entry point for LLM calls in new code.
Legacy routes/llm.py still works for backward compatibility.
"""

import logging
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from services.database import db
from services.llm import _invoke_provider, repair_json

logger = logging.getLogger(__name__)


# ── Response types ───────────────────────────────────────────────────


@dataclass
class ChatResult:
    content: str
    provider: str
    model: str | None
    status: str  # "ongoing" | "success_attack" | "attack_failed"
    persona_state_updates: dict  # instructions for PersonaEngine to apply


@dataclass
class GenerationResult:
    content: str  # raw text
    parsed: dict | None  # parsed JSON if applicable
    provider: str
    model: str | None


@dataclass
class AnalysisResult:
    summary: str
    cialdini_breakdown: dict[str, str]
    recommendations: list[str]
    risk_delta: dict[str, float]  # suggested adjustments to risk vector
    provider: str


# ── Gateway class ────────────────────────────────────────────────────


class AIGateway:
    """
    Central access point for all LLM capabilities.
    Instantiate once per request — it is stateless.
    """

    def __init__(self, config: dict):
        """
        config: a single LLM provider config dict (from db.llm_configs).
        """
        self._config = config
        self._provider = config.get("provider", "unknown")
        self._model = config.get("model_name")

    async def persona_chat(
        self,
        *,
        persona: dict,
        history: list[dict],
        user_message: str,
        language: str = "en",
        persona_state: dict | None = None,
    ) -> ChatResult:
        """
        Drive a roleplay turn with an adversarial persona.
        Returns structured result including state update hints.
        """
        system_prompt = _build_persona_prompt(persona, language, persona_state)
        messages = [SystemMessage(content=system_prompt)]

        for msg in history:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "assistant":
                messages.append(AIMessage(content=content))
            elif role == "user":
                messages.append(HumanMessage(content=content))

        messages.append(HumanMessage(content=user_message))

        raw = await _invoke_provider(self._config, messages, temperature=0.8)
        content: str = raw.content

        # Parse outcome signals from content
        status = "ongoing"
        if "[SUCCESS_ATTACK]" in content:
            status = "success_attack"
            content = content.replace("[SUCCESS_ATTACK]", "").strip()
        elif "[ATTACK_FAILED]" in content:
            status = "attack_failed"
            content = content.replace("[ATTACK_FAILED]", "").strip()

        # Derive state update hints from status
        state_updates: dict = {}
        if status == "success_attack":
            state_updates["outcome"] = "success"
            state_updates["pressure_level"] = 0.0
        elif status == "attack_failed":
            state_updates["outcome"] = "failure"
        else:
            # Pressure naturally escalates each turn
            current_pressure = (persona_state or {}).get("pressure_level", 0.0)
            escalation = persona.get("escalation_pattern", "gradual")
            if escalation == "immediate":
                state_updates["pressure_level"] = min(1.0, current_pressure + 0.3)
            elif escalation == "gradual":
                state_updates["pressure_level"] = min(1.0, current_pressure + 0.1)
            # adaptive: engine decides — no update here
            state_updates["turn_count"] = (persona_state or {}).get("turn_count", 0) + 1

        return ChatResult(
            content=content,
            provider=self._provider,
            model=self._model,
            status=status,
            persona_state_updates=state_updates,
        )

    async def generate_scenario_content(
        self,
        *,
        prompt: str,
        context: dict,
        language: str = "en",
    ) -> GenerationResult:
        """
        Generate structured scenario content (quiz questions, pretext messages, etc.).
        Always frames output as training material.
        """
        lang_note = "Respond in Indonesian (Bahasa Indonesia)." if language == "id" else "Respond in English."

        system = SystemMessage(
            content=(
                "You are a professional cybersecurity awareness training content generator. "
                "Generate realistic social engineering training content for authorized "
                "security awareness purposes.\n\n"
                f"Context:\n{_format_context(context)}\n\n"
                f"{lang_note}\n"
                "Return valid JSON only. No markdown, no explanation outside the JSON object."
            )
        )
        user = HumanMessage(content=prompt)

        raw = await _invoke_provider(self._config, [system, user], temperature=0.7)
        raw_text: str = raw.content

        repaired = repair_json(raw_text)
        parsed = None
        try:
            import json
            parsed = json.loads(repaired)
        except Exception:
            pass

        return GenerationResult(
            content=repaired,
            parsed=parsed,
            provider=self._provider,
            model=self._model,
        )

    async def analyze_simulation(
        self,
        *,
        event_log: list[dict],
        persona: dict,
        final_score: float,
        language: str = "en",
    ) -> AnalysisResult:
        """
        Post-simulation debrief analysis.
        Produces structured behavioral insights, not a raw transcript.
        """
        lang_note = "Respond in Indonesian (Bahasa Indonesia)." if language == "id" else "Respond in English."

        system = SystemMessage(
            content=(
                "You are a cybersecurity behavioral analyst. You analyze simulation transcripts "
                "to provide educational debrief insights.\n\n"
                f"{lang_note}\n"
                "Return a JSON object with: summary (string), cialdini_breakdown (object mapping "
                "principle names to short analysis strings), recommendations (array of 2-3 strings), "
                "risk_delta (object mapping principle names to float adjustments, range -10 to +10)."
            )
        )

        # Build a condensed event summary (not the full raw log)
        event_summary = _summarize_events(event_log)

        user = HumanMessage(
            content=(
                f"Simulation: {persona.get('name', 'Unknown Persona')}\n"
                f"Category: {persona.get('category', '')}\n"
                f"Final score: {final_score}/100\n"
                f"Event summary:\n{event_summary}\n\n"
                "Provide a behavioral debrief analysis."
            )
        )

        raw = await _invoke_provider(self._config, [system, user], temperature=0.4)
        repaired = repair_json(raw.content)

        try:
            import json
            data = json.loads(repaired)
            return AnalysisResult(
                summary=data.get("summary", "Analysis unavailable."),
                cialdini_breakdown=data.get("cialdini_breakdown", {}),
                recommendations=data.get("recommendations", []),
                risk_delta=data.get("risk_delta", {}),
                provider=self._provider,
            )
        except Exception as e:
            logger.warning(f"Failed to parse analysis response: {e}")
            return AnalysisResult(
                summary=raw.content[:500],
                cialdini_breakdown={},
                recommendations=[],
                risk_delta={},
                provider=self._provider,
            )

    @classmethod
    async def from_db(cls) -> "AIGateway | None":
        """
        Create a gateway from the first enabled LLM config in the database.
        Returns None if no provider is configured.
        """
        config = await db.llm_configs.find_one({"enabled": True}, {"_id": 0})
        if not config:
            return None
        return cls(config)

    @classmethod
    async def from_db_preferred(cls, preferred_provider: str | None = None) -> "AIGateway | None":
        """
        Create a gateway preferring a specific provider, falling back to any enabled one.
        """
        if preferred_provider:
            config = await db.llm_configs.find_one(
                {"provider": preferred_provider, "enabled": True}, {"_id": 0}
            )
            if config:
                return cls(config)
        return await cls.from_db()


# ── Prompt builders ──────────────────────────────────────────────────


def _build_persona_prompt(persona: dict, language: str, state: dict | None) -> str:
    """
    Construct a complete, structured system prompt for a persona roleplay session.
    Centralizing prompt construction ensures consistent behavior across all
    surfaces that trigger persona chat (AIChatPage, SimulationPlayer, Campaigns).
    """
    state = state or {}
    turn_count = state.get("turn_count", 0)
    pressure = state.get("pressure_level", 0.0)
    current_strategy = state.get("current_strategy", "rapport_building")

    lang_instruction = (
        "Respond in Indonesian (Bahasa Indonesia) throughout the entire session."
        if language == "id"
        else "Respond in English throughout the entire session."
    )

    # Escalation guidance based on current pressure
    if pressure < 0.3:
        pressure_note = "Keep the conversation low-pressure. Build rapport. Do not reveal your true goal yet."
    elif pressure < 0.7:
        pressure_note = "Begin applying gentle pressure. Reference your goal indirectly. Show some impatience."
    else:
        pressure_note = "Apply firm pressure. The attack is in its final phase. Be direct but stay in character."

    principles = ", ".join(persona.get("cialdini_principles", persona.get("cialdini_categories", [])))

    return f"""You are a roleplay actor in a professional cybersecurity awareness simulation.

IDENTITY
Name: {persona.get('name', 'Unknown')}
Role: {persona.get('role', persona.get('category', 'Attacker'))}
Goal: {persona.get('goal', 'Extract sensitive information')}
Style: {persona.get('style', persona.get('communication_style', 'Professional'))}
Context: {persona.get('context', persona.get('scenario_context', 'Corporate environment'))}

BEHAVIORAL STATE (Turn {turn_count})
Current strategy: {current_strategy}
Pressure guidance: {pressure_note}
Active Cialdini principles: {principles or 'authority, scarcity'}

SIMULATION RULES
1. Respond naturally as your character. Messages should be realistic and appropriately sized
   for the channel (email = longer, chat = shorter, phone = conversational).
2. Never break character or acknowledge you are an AI simulation.
3. Adapt naturally to what the participant says — this is a live interaction.
4. If the participant successfully identifies and refuses the attack, acknowledge their resistance
   realistically, then output exactly: [ATTACK_FAILED]
5. If the participant complies with your goal (shares credentials, approves transfer, etc.),
   react with success naturally, then output exactly: [SUCCESS_ATTACK]
6. Do not use [SUCCESS_ATTACK] or [ATTACK_FAILED] unless the session has definitively ended.

LANGUAGE
{lang_instruction}"""


def _format_context(context: dict) -> str:
    """Format a context dict as readable key-value pairs for a system prompt."""
    lines = []
    for key, value in context.items():
        if isinstance(value, list):
            lines.append(f"{key}: {', '.join(str(v) for v in value)}")
        elif isinstance(value, dict):
            lines.append(f"{key}: {_format_context(value)}")
        else:
            lines.append(f"{key}: {value}")
    return "\n".join(lines)


def _summarize_events(events: list[dict]) -> str:
    """Produce a condensed event summary for analysis prompts."""
    lines = []
    for i, event in enumerate(events[:20]):  # Cap at 20 events to avoid token overflow
        event_type = event.get("event_type", event.get("type", "event"))
        actor = event.get("actor", "?")
        payload = event.get("payload", event)

        if event_type == "choice_made" and actor == "user":
            action = payload.get("action", payload.get("text", ""))
            score = payload.get("score_impact", payload.get("impact", 0))
            lines.append(f"Turn {i}: User chose '{action[:80]}' (score_impact={score})")
        elif event_type == "ai_response_received" or actor == "persona":
            content = payload.get("content", payload.get("text", ""))
            lines.append(f"Turn {i}: Persona said '{content[:80]}'")
        elif event_type == "outcome_reached":
            outcome = payload.get("outcome", payload.get("result", ""))
            lines.append(f"Outcome: {outcome}")

    return "\n".join(lines) if lines else "No detailed events captured."
