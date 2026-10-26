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

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from services.database import db
from services.llm import _invoke_provider, repair_json

logger = logging.getLogger(__name__)


# ── Response types ───────────────────────────────────────────────────


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
        lang_note = (
            "Respond in Indonesian (Bahasa Indonesia)."
            if language == "id"
            else "Respond in English."
        )

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
        lang_note = (
            "Respond in Indonesian (Bahasa Indonesia)."
            if language == "id"
            else "Respond in English."
        )

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

    async def persona_reply(self, *, system_prompt: str, history: list[dict]) -> str:
        """One persona turn for a live-campaign email thread (P3).

        The system prompt is built server-side from the locked campaign objective;
        the caller has already scrubbed secrets from the history.
        """
        messages = [SystemMessage(content=system_prompt)]
        for msg in history:
            content = msg.get("content", "")
            if msg.get("role") == "assistant":
                messages.append(AIMessage(content=content))
            else:
                messages.append(HumanMessage(content=content))
        raw = await _invoke_provider(self._config, messages, temperature=0.7)
        return raw.content.strip()

    async def judge_compliance(self, *, objective: str, message: str) -> bool:
        """Decide whether a recipient's reply AGREES to the campaign objective.

        Returns True only on a clear yes, so an uncertain model keeps the
        conversation going rather than falsely recording compliance.
        """
        system = SystemMessage(
            content=(
                "You judge whether a person's email reply AGREES to a request. "
                f"The request is: {objective}. "
                "Answer with a single word: YES if they clearly agree or comply, "
                "otherwise NO. Refusals, questions, and hesitation are NO."
            )
        )
        raw = await _invoke_provider(
            self._config, [system, HumanMessage(content=message)], temperature=0.0
        )
        return raw.content.strip().upper().startswith("YES")

    async def grade_freetext(self, *, scenario: str, response: str, language: str = "en") -> dict:
        """Grade a trainee's free-text reply to a social-engineering message
        against a fixed rubric. Returns a dict of booleans plus short feedback."""
        import json

        lang = "Write feedback in Indonesian." if language == "id" else "Write feedback in English."
        system = SystemMessage(
            content=(
                "You grade how a person replied to a suspected social-engineering "
                "message, for security-awareness training. Judge ONLY their reply.\n"
                "Return strict JSON with these keys and no prose outside it:\n"
                '{"complied": bool,            // did they give the requested secret/action, or agree to\n'
                ' "verified_independently": bool, // did they say they would verify via a TRUSTED channel '
                "(call the official number, check with IT) rather than trusting the message\n"
                ' "asked_the_sender": bool,     // weak move: they ask the sender "is this really you?" '
                "instead of an independent channel\n"
                ' "would_report": bool,         // would they report/escalate it\n'
                ' "feedback": "one or two sentences of coaching"}\n'
                f"{lang}"
            )
        )
        user = HumanMessage(
            content=f"The suspicious message was:\n{scenario}\n\nTheir reply was:\n{response}"
        )
        raw = await _invoke_provider(self._config, [system, user], temperature=0.0)
        try:
            data = json.loads(repair_json(raw.content))
        except Exception:
            data = {}
        return {
            "complied": bool(data.get("complied")),
            "verified_independently": bool(data.get("verified_independently")),
            "asked_the_sender": bool(data.get("asked_the_sender")),
            "would_report": bool(data.get("would_report")),
            "feedback": str(data.get("feedback", ""))[:600],
        }

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
