import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ==================== AUTH & USERS ====================


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    email: str | None = None
    display_name: str | None = None
    role: str = "user"  # admin, trainer, user
    organization_id: str | None = None
    avatar_url: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_active: bool = True
    # Gamification
    xp: int = 0
    level: int = 1
    streak_days: int = 0
    last_active: datetime | None = None
    badges: list[str] = Field(default_factory=list)
    # Preferences
    theme: str = "dark"
    notifications_enabled: bool = True


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None
    display_name: str | None = None
    invite_code: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    theme: str | None = None
    notifications_enabled: bool | None = None


# ==================== CONTENT ====================


class Challenge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    difficulty: str = "medium"
    cialdini_categories: list[str] = Field(default_factory=list)
    estimated_time: int = 15
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    content_en: dict[str, Any] | None = None
    content_id: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Quiz(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    difficulty: str = "medium"
    cialdini_categories: list[str] = Field(default_factory=list)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    content_en: dict[str, Any] | None = None
    content_id: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ==================== SIMULATIONS ====================


class Simulation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str | None = None
    challenge_id: str | None = None
    quiz_id: str | None = None
    simulation_type: str  # challenge, quiz, ai_challenge, campaign
    status: str  # running, completed, paused
    events: list[dict[str, Any]] = Field(default_factory=list)
    score: float | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    participant_name: str | None = None
    title: str | None = None

    # AI Challenge specific fields
    type: str | None = None
    challenge_type: str | None = None
    category: str | None = None
    difficulty: str | None = None
    total_questions: int | None = None
    correct_answers: int | None = None
    answers: dict[str, Any] | None = None
    challenge_data: dict[str, Any] | None = None

    # Campaign tracking
    campaign_id: str | None = None
    stage_index: int | None = None

    # Assignment tracking
    assignment_id: str | None = None

    # Debrief data
    debrief: dict[str, Any] | None = None


# ==================== CAMPAIGNS ====================


class CampaignStage(BaseModel):
    stage_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    channel: str = "narrator"
    persona_id: str | None = None
    challenge_id: str | None = None
    challenge_title: str | None = None  # Resolved at runtime if challenge_id is missing
    quiz_id: str | None = None
    quiz_title: str | None = None
    order: int = 0
    unlock_condition: str = "complete_previous"


class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    difficulty: str
    stages: list[CampaignStage] = Field(default_factory=list)
    cialdini_categories: list[str] = Field(default_factory=list)
    estimated_time: int = 30
    created_by: str | None = None
    is_published: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CampaignProgress(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    campaign_id: str
    user_id: str
    current_stage: int = 0
    stage_results: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "in_progress"  # in_progress, completed, abandoned
    overall_score: float | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None


# ==================== ORGANIZATIONS ====================


class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str | None = None
    invite_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    owner_id: str
    member_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    settings: dict[str, Any] = Field(default_factory=dict)


# ==================== GAMIFICATION ====================


class Badge(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    condition: str  # e.g. "complete_5_scenarios", "streak_7"
    xp_reward: int = 50


class LeaderboardEntry(BaseModel):
    user_id: str
    username: str
    display_name: str | None = None
    xp: int = 0
    level: int = 1
    badges_count: int = 0
    simulations_completed: int = 0
    avg_score: float = 0.0
    streak_days: int = 0


# ==================== NOTIFICATIONS ====================


class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    message: str
    type: str = "info"  # info, achievement, reminder, alert
    read: bool = False
    link: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ==================== WEBHOOKS ====================


class WebhookConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    events: list[str] = Field(default_factory=list)  # simulation_complete, badge_earned, etc
    secret: str | None = None
    enabled: bool = True
    organization_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ==================== SCENARIO BUILDER ====================


class ScenarioTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    difficulty: str = "medium"
    cialdini_categories: list[str] = Field(default_factory=list)
    channel: str = "email_inbox"  # email_inbox, chat, phone, sms, social_media
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    content_en: dict[str, Any] | None = None
    content_id: dict[str, Any] | None = None
    created_by: str | None = None
    is_draft: bool = True
    is_published: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ==================== CONFIG ====================


class LLMConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: str  # groq, gemini, claude, openai, openrouter, local
    api_key: str = ""
    model_name: str | None = None
    base_url: str | None = None  # For OpenRouter / local LLM (Ollama, LM Studio, etc)
    enabled: bool = False
    rate_limit: int = 100
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "settings"
    language: str = "en"
    theme: str = "dark"
    first_run_completed: bool = False
    llm_enabled: bool = False
    reduce_motion: bool = False


# ==================== INSTRUCTOR / TRAINING ====================


class TrainingGroup(BaseModel):
    """
    A cohort of trainees assigned to an instructor.
    Corresponds to a military unit, class, or exercise group.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g. "Alpha Platoon", "Intel Unit 3", "OSINT Class 2025"
    description: str | None = None
    instructor_id: str  # user with role=instructor or admin
    organization_id: str | None = None
    trainee_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)  # e.g. ["ranger", "signals", "intel"]
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class Assignment(BaseModel):
    """
    An instructor assigns a specific scenario/campaign to a trainee or group.
    Controls what content the trainee sees and any deadline/scoring parameters.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    instructor_id: str
    group_id: str | None = None   # assigned to whole group
    trainee_id: str | None = None  # or to individual trainee

    # What is being assigned
    content_type: str  # "challenge" | "campaign" | "quiz" | "ai_persona"
    content_id: str    # id of the challenge/campaign/quiz/persona

    title: str  # human-readable label for the assignment
    instructions: str | None = None  # instructor notes for trainees
    due_date: str | None = None
    passing_score: float = 70.0  # minimum score to pass
    max_attempts: int = 3

    # Status tracking
    status: str = "active"  # active | completed | expired | cancelled

    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class AssignmentResult(BaseModel):
    """Records a trainee's completion of an assignment."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    assignment_id: str
    trainee_id: str
    simulation_id: str | None = None  # linked simulation
    score: float | None = None
    passed: bool = False
    attempts: int = 1
    instructor_feedback: str | None = None
    completed_at: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


# ==================== SIMULATION RUNTIME (v3) ====================


class SimulationEvent(BaseModel):
    """
    A single typed event in the simulation event log.
    Simulations are reconstituted entirely from their event stream — this is
    the canonical record of what happened, when, and in what order.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    simulation_id: str
    sequence: int  # monotonically increasing per simulation
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())

    # Who produced this event
    actor: str  # "user" | "persona" | "system"

    # What happened
    event_type: str
    # node_entered | choice_made | ai_response_received | outcome_reached
    # timeout | hint_requested | simulation_paused | simulation_resumed

    # Event-specific data (schema varies by event_type)
    payload: dict[str, Any] = Field(default_factory=dict)

    # Lightweight state snapshot at this point in the simulation
    # Enables replay without re-running the full event chain
    state_snapshot: dict[str, Any] = Field(default_factory=dict)


# ==================== RISK ENGINE ====================


class RiskVector(BaseModel):
    """
    Multi-dimensional susceptibility profile across the 6 Cialdini principles.
    Scale: 0 = fully susceptible, 100 = fully resistant.
    Not a judgment — a training baseline to improve from.
    """

    reciprocity: float = 50.0
    scarcity: float = 50.0
    authority: float = 50.0
    commitment: float = 50.0
    liking: float = 50.0
    social_proof: float = 50.0

    def as_dict(self) -> dict[str, float]:
        return {
            "reciprocity": self.reciprocity,
            "scarcity": self.scarcity,
            "authority": self.authority,
            "commitment": self.commitment,
            "liking": self.liking,
            "social_proof": self.social_proof,
        }

    def average(self) -> float:
        values = list(self.as_dict().values())
        return round(sum(values) / len(values), 1)

    def weakest_dimension(self) -> str:
        return min(self.as_dict(), key=self.as_dict().get)

    def strongest_dimension(self) -> str:
        return max(self.as_dict(), key=self.as_dict().get)


class ChannelRiskProfile(BaseModel):
    """Susceptibility variation by communication channel."""

    email: float = 50.0
    phone: float = 50.0
    chat: float = 50.0
    social_media: float = 50.0
    in_person: float = 50.0


class RiskProfile(BaseModel):
    """
    Longitudinal behavioral risk profile for a user.
    Updated after each completed simulation. Never decremented automatically —
    only improves through demonstrated awareness.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str

    current_vector: RiskVector = Field(default_factory=RiskVector)
    baseline_vector: RiskVector = Field(default_factory=RiskVector)
    channel_profile: ChannelRiskProfile = Field(default_factory=ChannelRiskProfile)

    total_simulations: int = 0
    total_events: int = 0

    # "improving" | "declining" | "stable" per dimension
    trend: dict[str, str] = Field(default_factory=dict)

    # Behavioral patterns extracted from event logs
    avg_decision_time_seconds: float | None = None
    high_risk_dimensions: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)

    last_updated: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


# ==================== PERSONA ENGINE ====================


class PersonaProfile(BaseModel):
    """
    Static definition of an adversarial persona.
    Stored in the backend so it can be versioned, extended, and
    referenced by simulations and campaigns.
    """

    model_config = ConfigDict(extra="ignore")

    id: str  # matches frontend aiPersonas.js id for backward compat
    name: str
    role: str  # e.g. "Executive Impersonator", "IT Helpdesk Faker"
    category: str  # attack category
    difficulty: str  # easy | medium | hard
    description: str
    opening_line: str

    # Behavioral definition
    goal: str
    communication_style: str
    scenario_context: str
    channel: str = "chat"  # primary channel: email | phone | chat | social_media

    # Which Cialdini principles this persona exploits (ordered by priority)
    cialdini_principles: list[str] = Field(default_factory=list)

    # How the persona escalates pressure over turns
    escalation_pattern: str = "gradual"  # gradual | immediate | adaptive | patience

    # What information the persona already knows (for realistic pretext)
    knowledge_bounds: dict[str, Any] = Field(default_factory=dict)

    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class PersonaMemoryEntry(BaseModel):
    """A fact the persona has extracted or inferred from the conversation."""

    fact_type: str  # name | role | credential_hint | schedule | relationship
    value: str
    confidence: float = 1.0  # 0-1
    turn_extracted: int


class PersonaState(BaseModel):
    """
    Mutable behavioral state of a persona within a single simulation session.
    Reset for each simulation. Not persisted between sessions.
    Stored in simulation document for replay.
    """

    persona_id: str
    simulation_id: str

    # Escalation state (0.0 = minimal pressure, 1.0 = maximum)
    pressure_level: float = 0.0

    # Current attack vector name (can shift adaptively)
    current_strategy: str = "rapport_building"

    # Turn counter
    turn_count: int = 0

    # Facts the persona has extracted from the conversation
    memory: list[PersonaMemoryEntry] = Field(default_factory=list)

    # Outcome signal
    outcome: str | None = None  # None | "success" | "failure" | "abandoned"

    # Whether the user has triggered any Cialdini defenses
    defenses_demonstrated: list[str] = Field(default_factory=list)


# ==================== ORGANIZATION GRAPH ====================


class OrgNode(BaseModel):
    """
    A node in the organizational trust graph.
    Can represent a real registered user or a synthetic simulated employee
    used as a target/context in scenarios.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str

    # Optional link to a real registered user
    user_id: str | None = None

    # Identity
    name: str
    role: str  # job title
    department: str
    hierarchy_level: int = 0  # 0 = individual contributor, higher = more authority

    # Risk
    risk_profile_id: str | None = None

    # Training coverage
    simulations_completed: int = 0
    last_training: str | None = None

    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class TrustEdge(BaseModel):
    """
    A directed trust relationship between two OrgNodes.
    Direction: source trusts/interacts with target.
    Edges are used to generate realistic pretext (e.g., impersonating a manager).
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str

    source_id: str  # the node that initiates contact
    target_id: str  # the node being contacted

    # Relationship type governs pretext realism
    relationship: str  # reports_to | peer | vendor | customer | external | it_support

    # 0.0 = strangers, 1.0 = high-trust daily collaborators
    trust_weight: float = 0.5

    # Preferred communication channels for this relationship
    channels: list[str] = Field(default_factory=lambda: ["email"])

    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
