import secrets
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


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: str | None = None
    theme: str | None = None
    first_run_completed: bool | None = None
    llm_enabled: bool | None = None
    reduce_motion: bool | None = None


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
    group_id: str | None = None  # assigned to whole group
    trainee_id: str | None = None  # or to individual trainee

    # What is being assigned
    content_type: str  # "challenge" | "campaign" | "quiz" | "ai_persona"
    content_id: str  # id of the challenge/campaign/quiz/persona

    title: str  # human-readable label for the assignment
    instructions: str | None = None  # instructor notes for trainees
    due_date: str | None = None
    passing_score: float = 70.0  # minimum score to pass
    max_attempts: int = 3

    # Status tracking
    status: str = "active"  # active | completed | expired | cancelled

    # Remediation loop: why this was assigned, and what it targets
    source: str = "manual"  # manual | remediation | retest
    reason: str | None = None  # human-readable explanation shown to the trainee
    principle: str | None = None  # the Cialdini principle being remediated
    retest_of: str | None = None  # the remediation assignment this re-tests
    # Translatable form of `reason` for system assignments: the client renders
    # remediation.<reason_key> with these params; `reason` stays as the fallback.
    reason_key: str | None = None
    reason_params: dict[str, Any] | None = None

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
    email: str | None = None  # planning address; used to target a campaign at this person
    role: str  # job title
    department: str
    hierarchy_level: int = 0  # 0 = individual contributor, higher = more authority

    # Risk
    risk_profile_id: str | None = None

    # Training coverage
    simulations_completed: int = 0
    last_training: str | None = None

    # Human Attack Surface Map (docs/roadmap.md #4)
    # An asset node is a "crown jewel" (money, admin, data) — the goal of an
    # attack path, not a person who can be phished.
    is_asset: bool = False
    asset_kind: str | None = None  # money | admin | data | credentials
    # Cached susceptibility 0-100 (100 = most likely to be social-engineered).
    # None until computed; always None for asset nodes.
    susceptibility: float | None = None

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


# Edge semantics: source_id can credibly influence / reach target_id, so if the
# source is compromised an attacker can pivot to the target. `approves`,
# `has_access` and `admin_of` point a person at an asset node.
TRUST_RELATIONSHIPS = (
    "reports_to",  # target is source's manager — authority pressure flows down
    "peer",  # trusted colleague
    "it_support",  # help-desk relationship (very phishable)
    "vendor",  # external supplier
    "customer",
    "external",
    "approves",  # source approves transactions on the asset
    "has_access",  # source can read/use the asset
    "admin_of",  # source administers the asset
)
ASSET_KINDS = ("money", "admin", "data", "credentials")


# ==================== LIVE CAMPAIGNS ====================
# See docs/design/live-campaigns.md. Guardrail ids (G1..G15) refer to §6 there.

LIVE_OBJECTIVES = (
    "click_link",
    "reply",
    "agree_to_share_otp",
    "agree_to_approve_payment",
    "agree_to_install_tool",
)
CIALDINI_PRINCIPLES = (
    "reciprocity",
    "scarcity",
    "authority",
    "commitment",
    "liking",
    "social_proof",
)
LIVE_CAMPAIGN_STATUSES = (
    "draft",
    "pending_approval",
    "approved",
    "launching",
    "running",
    "closed",
    "killed",
)


class VerifiedDomain(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str | None = None
    domain: str
    token: str
    sandbox: bool = False  # reserved test TLD: verified without DNS, can never reach real people
    verified_at: str | None = None
    last_checked_at: str | None = None
    created_by: str
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


# Report-Phish mailbox (abuse inbox) — the defensive mirror of a campaign.
# A reporter forwarding a lure is the behaviour we actually want to see.
REPORT_VERDICTS = (
    "simulation",  # it was one of our own simulated lures -> credit the reporter
    "needs_review",  # not ours; a human should decide if it is a real threat
    "threat",  # triaged as a genuine malicious email
    "benign",  # legitimate mail reported by mistake
)


class PhishReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str | None = None
    reporter_email: str
    reporter_user_id: str | None = None
    subject: str = ""
    from_address: str = ""  # the claimed sender of the reported message
    verdict: str = "needs_review"
    campaign_id: str | None = None  # set when verdict == "simulation"
    body_excerpt: str = ""  # secret-scrubbed, truncated
    credited: bool = False  # reporter was matched to a campaign recipient and credited
    triaged_by: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class LiveCampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    objective: str
    principles: list[str] = Field(min_length=1)
    sender_name: str = Field(min_length=1, max_length=80)
    sender_email: str = Field(min_length=3, max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    body_html: str = Field(min_length=1, max_length=20000)
    recipients: list[str] = Field(min_length=1, max_length=5000)
    starts_at: datetime
    ends_at: datetime
    max_turns: int = Field(default=4, ge=0, le=6)
    language: str = "en"
    use_qr: bool = False  # quishing: the lure is a QR code encoding the tracked URL
    brand_override_reason: str | None = Field(default=None, max_length=1000)


class LiveCampaign(LiveCampaignCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str | None = None
    created_by: str
    approved_by: str | None = None
    status: str = "draft"
    killed: bool = False
    preflight: list[dict[str, Any]] = Field(default_factory=list)
    gophish_campaign_id: int | None = None
    # Opaque token in the Reply-To address, used to match inbound replies (P3).
    reply_token: str = Field(default_factory=lambda: secrets.token_urlsafe(12))
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class CampaignTemplate(BaseModel):
    """The content of a campaign, without the per-run time window. Used as the
    body that a schedule materialises into a fresh campaign each cycle."""

    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    objective: str
    principles: list[str] = Field(min_length=1)
    sender_name: str = Field(min_length=1, max_length=80)
    sender_email: str = Field(min_length=3, max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    body_html: str = Field(min_length=1, max_length=20000)
    recipients: list[str] = Field(min_length=1, max_length=5000)
    max_turns: int = Field(default=4, ge=0, le=6)
    language: str = "en"
    use_qr: bool = False


class CampaignSchedule(BaseModel):
    """A recurring campaign. Each cycle it materialises a fresh campaign in
    `pending_approval` — never auto-sent, so the two-person approval guardrail
    (G2) still holds; the schedule only automates the drafting cadence."""

    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    interval_days: int = Field(ge=1, le=365)
    window_days: int = Field(default=5, ge=1, le=30)  # active window of each run
    next_run: str  # ISO timestamp of the next materialisation
    active: bool = True
    template: dict  # a CampaignTemplate
    created_by: str
    last_run_at: str | None = None
    last_campaign_id: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
