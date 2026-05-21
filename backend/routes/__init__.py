from routes.adaptive import router as adaptive_router
from routes.glossary import router as glossary_router
from routes.analytics import router as analytics_router
from routes.auth import router as auth_router
from routes.campaigns import router as campaigns_router
from routes.certificates import router as certificates_router
from routes.challenges import router as challenges_router
from routes.debrief import router as debrief_router
from routes.imports import router as imports_router
from routes.leaderboard import router as leaderboard_router
from routes.llm import router as llm_router
from routes.notifications import router as notifications_router
from routes.organizations import router as organizations_router
from routes.assignments import router as assignments_router
from routes.instructor import router as instructor_router
from routes.personas import router as personas_router
from routes.quizzes import router as quizzes_router
from routes.reports import router as reports_router
from routes.risk_profile import router as risk_profile_router
from routes.scenario_builder import router as scenario_builder_router
from routes.settings import router as settings_router
from routes.simulations import router as simulations_router
from routes.webhooks import router as webhooks_router

__all__ = [
    "auth_router",
    "challenges_router",
    "quizzes_router",
    "simulations_router",
    "llm_router",
    "settings_router",
    "imports_router",
    "reports_router",
    "leaderboard_router",
    "analytics_router",
    "organizations_router",
    "campaigns_router",
    "notifications_router",
    "webhooks_router",
    "scenario_builder_router",
    "debrief_router",
    "certificates_router",
    "adaptive_router",
    # v3 platform services
    "personas_router",
    "risk_profile_router",
    "instructor_router",
    "assignments_router",
    "glossary_router",
]
