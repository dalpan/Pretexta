import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from models.schemas import LLMConfig, User
from services import lab_chat
from services.ai_gateway import AIGateway
from services.auth import get_current_user, require_admin
from services.database import db
from services.llm import (
    LOCAL_DEFAULTS,
    PROVIDER_MODELS,
    fetch_local_models,
    fetch_openrouter_models,
    get_llm_generate_model,
    get_provider_models,
    repair_json,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])

# Client-supplied text reaches a paid API with the admin's key; cap its size.
MAX_MESSAGE_CHARS = 4000
MAX_PROMPT_CHARS = 8000
MAX_HISTORY_MESSAGES = 40
MAX_PERSONA_CHARS = 6000


def _check_size(value: Any, limit: int, name: str) -> None:
    if len(str(value)) > limit:
        raise HTTPException(status_code=413, detail=f"{name} exceeds {limit} characters")


# ==================== PROVIDER & MODEL INFO ====================

PROVIDER_INFO = {
    "groq": {
        "name": "Groq",
        "description": "Ultra-fast inference. Free tier available. Best for quick responses.",
        "auth": "api_key",
        "signup_url": "https://console.groq.com",
        "placeholder": "gsk_...",
    },
    "gemini": {
        "name": "Google Gemini",
        "description": "Google's multimodal AI. Free tier with generous limits.",
        "auth": "api_key",
        "signup_url": "https://aistudio.google.com/apikey",
        "placeholder": "AIza...",
    },
    "claude": {
        "name": "Anthropic Claude",
        "description": "Advanced reasoning and safety. Paid API.",
        "auth": "api_key",
        "signup_url": "https://console.anthropic.com",
        "placeholder": "sk-ant-...",
    },
    "openai": {
        "name": "OpenAI",
        "description": "GPT-4o and GPT-3.5. Industry standard. Paid API.",
        "auth": "api_key",
        "signup_url": "https://platform.openai.com/api-keys",
        "placeholder": "sk-...",
    },
    "openrouter": {
        "name": "OpenRouter",
        "description": "Access 200+ models from one API key. Free models available. Best value.",
        "auth": "api_key",
        "signup_url": "https://openrouter.ai/keys",
        "placeholder": "sk-or-v1-...",
        "recommended": True,
    },
    "local": {
        "name": "Local LLM",
        "description": (
            "Connect to Ollama, LM Studio, llama.cpp, or any "
            "OpenAI-compatible local server. No API key needed."
        ),
        "auth": "base_url",
        "placeholder": "http://localhost:11434/v1",
        "presets": LOCAL_DEFAULTS,
    },
}


@router.get("/providers")
async def get_providers(current_user: User = Depends(get_current_user)):
    """List all supported LLM providers with info."""
    return PROVIDER_INFO


@router.get("/models/{provider}")
async def get_models_for_provider(
    provider: str,
    current_user: User = Depends(get_current_user),
):
    """Get available models for a provider."""
    if provider == "local":
        # Try to fetch from configured local endpoint
        config = await db.llm_configs.find_one({"provider": "local"}, {"_id": 0})
        default_url = LOCAL_DEFAULTS["ollama"]
        base_url = config.get("base_url", default_url) if config else default_url
        models = await fetch_local_models(base_url)
        if models:
            return {"provider": provider, "models": models, "source": "live"}
        # Fallback: return empty with instruction
        return {
            "provider": provider,
            "models": [],
            "source": "none",
            "message": "No local server detected. Start Ollama or LM Studio first.",
        }

    if provider == "openrouter":
        # Try to fetch live model list
        config = await db.llm_configs.find_one({"provider": "openrouter"}, {"_id": 0})
        api_key = config.get("api_key", "") if config else ""
        models = await fetch_openrouter_models(api_key)
        if models:
            return {
                "provider": provider,
                "models": models[:100],
                "source": "live",
                "total": len(models),
            }
        # Fallback to static catalog
        return {
            "provider": provider,
            "models": PROVIDER_MODELS.get("openrouter", []),
            "source": "static",
        }

    # Static catalog for all other providers
    models = get_provider_models(provider)
    if not models:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    return {"provider": provider, "models": models, "source": "static"}


@router.get("/models/{provider}/refresh")
async def refresh_models(
    provider: str,
    base_url: str = Query(None),
    current_user: User = Depends(require_admin),
):
    """Force refresh model list (for local/openrouter). Admin-only: base_url is fetched."""
    if provider == "local":
        url = base_url or LOCAL_DEFAULTS["ollama"]
        models = await fetch_local_models(url)
        return {"provider": provider, "models": models, "base_url": url}

    if provider == "openrouter":
        config = await db.llm_configs.find_one({"provider": "openrouter"}, {"_id": 0})
        api_key = config.get("api_key", "") if config else ""
        models = await fetch_openrouter_models(api_key)
        return {"provider": provider, "models": models[:100], "total": len(models)}

    return {"provider": provider, "models": get_provider_models(provider)}


# ==================== CONFIG CRUD ====================


@router.get("/config")
async def get_llm_configs(current_user: User = Depends(get_current_user)):
    configs = await db.llm_configs.find({}, {"_id": 0}).to_list(100)
    active_configs = []
    for config in configs:
        # For local, api_key might be empty - that's OK
        if config.get("provider") != "local" and (
            not config.get("api_key") or config.get("api_key") == ""
        ):
            continue
        if config.get("api_key"):
            config["api_key"] = "***"
        config["updated_at"] = config.get("updated_at", datetime.now(UTC).isoformat())
        active_configs.append(config)
    return active_configs


@router.post("/config")
async def save_llm_config(config: LLMConfig, current_user: User = Depends(require_admin)):
    doc = config.model_dump()
    doc["updated_at"] = doc["updated_at"].isoformat()

    # For local provider, api_key is optional
    if config.provider != "local" and (not config.api_key or config.api_key == ""):
        await db.llm_configs.delete_one({"provider": config.provider})
        return {"message": "LLM config deleted"}

    await db.llm_configs.update_one(
        {"provider": config.provider},
        {"$set": doc},
        upsert=True,
    )

    return {"message": "LLM config saved", "provider": config.provider, "model": config.model_name}


# ==================== GENERATION & CHAT ====================


@router.post("/generate")
async def generate_pretext(request: dict[str, Any], current_user: User = Depends(get_current_user)):
    """Generate pretext using LLM."""
    requested_provider = request.get("provider", None)
    prompt = request.get("prompt", "")
    context = request.get("context", {})
    _check_size(prompt, MAX_PROMPT_CHARS, "prompt")
    _check_size(context, MAX_PROMPT_CHARS, "context")

    if requested_provider:
        config = await db.llm_configs.find_one(
            {"provider": requested_provider, "enabled": True}, {"_id": 0}
        )
    else:
        config = await db.llm_configs.find_one({"enabled": True}, {"_id": 0})

    if not config:
        raise HTTPException(
            status_code=400,
            detail="LLM provider not configured or not enabled. Please configure in Settings.",
        )

    try:
        response = await get_llm_generate_model(config, prompt, context)
        sanitized = repair_json(response.content)
        return {
            "generated_text": sanitized,
            "provider": config["provider"],
            "model": config.get("model_name"),
        }

    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        error_msg = str(e)
        if "NOT_FOUND" in error_msg:
            error_msg = (
                "Model not found. Your API Key might not support the selected model, "
                "or the region is restricted."
            )
        raise HTTPException(status_code=500, detail=f"LLM Generation Error: {error_msg}")


class ChatStartRequest(BaseModel):
    persona_id: str = Field(min_length=1, max_length=100)
    language: str = "en"


class ChatTurnRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


@router.post("/chat/start")
async def start_chat(data: ChatStartRequest, current_user: User = Depends(get_current_user)):
    """
    Begin a server-held lab persona chat. The server owns the conversation and
    decides the outcome, so the browser can neither forge history nor set a score.
    """
    return await lab_chat.start_session(current_user.id, data.persona_id, data.language)


@router.post("/chat/turn")
async def chat_turn(data: ChatTurnRequest, current_user: User = Depends(get_current_user)):
    """Submit one trainee message. The server appends it, replies in character,
    and on a terminal outcome records the simulation with a server-computed score."""
    gateway = await AIGateway.from_db()
    if not gateway:
        raise HTTPException(
            status_code=400, detail="LLM config missing. Configure a provider in Settings."
        )
    return await lab_chat.submit_turn(current_user.id, data.session_id, data.message, gateway)
