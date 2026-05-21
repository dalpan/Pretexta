import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from models.schemas import LLMConfig, User
from services.auth import get_current_user
from services.database import db
from services.llm import (
    LOCAL_DEFAULTS,
    PROVIDER_MODELS,
    fetch_local_models,
    fetch_openrouter_models,
    get_llm_chat_model,
    get_llm_generate_model,
    get_provider_models,
    repair_json,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])

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
    current_user: User = Depends(get_current_user),
):
    """Force refresh model list (for local/openrouter)."""
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
async def save_llm_config(config: LLMConfig, current_user: User = Depends(get_current_user)):
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


@router.post("/chat")
async def chat_interaction(request: dict[str, Any], current_user: User = Depends(get_current_user)):
    """
    Real-time persona chat for roleplay simulations.
    Routes through AIGateway for centralized prompt construction.
    """
    from services.ai_gateway import AIGateway

    history = request.get("history", [])
    persona = request.get("persona", {})
    user_message = request.get("message", "")
    language = request.get("language", "en")
    persona_state = request.get("persona_state")

    gateway = await AIGateway.from_db()
    if not gateway:
        raise HTTPException(
            status_code=400,
            detail="LLM config missing. Configure a provider in Settings.",
        )

    try:
        result = await gateway.persona_chat(
            persona=persona,
            history=history,
            user_message=user_message,
            language=language,
            persona_state=persona_state,
        )

        # Map gateway status to legacy API format for frontend compatibility
        # Legacy: "ongoing" | "failed" (attack succeeded) | "completed" (attack blocked)
        legacy_status = {
            "ongoing":       "ongoing",
            "success_attack": "failed",
            "attack_failed":  "completed",
        }.get(result.status, "ongoing")

        return {
            "role": "assistant",
            "content": result.content,
            "status": legacy_status,
            "provider": result.provider,
            "model": result.model,
            "persona_state_updates": result.persona_state_updates,
        }

    except Exception as e:
        logger.error(f"Chat error: {e}")
        error_msg = str(e)
        provider = (await db.llm_configs.find_one({"enabled": True}, {"_id": 0}) or {}).get("provider", "unknown")
        if "401" in error_msg:
            error_msg = f"Unauthorized. Please check your API Key for {provider}."
        elif "404" in error_msg:
            error_msg = f"Model Not Found. Provider: {provider}."
        elif "429" in error_msg:
            error_msg = f"Rate Limit Exceeded. Please try again later."
        elif "connect" in error_msg.lower():
            error_msg = f"Connection failed for {provider}. Is the server running?"
        raise HTTPException(status_code=500, detail=error_msg)
