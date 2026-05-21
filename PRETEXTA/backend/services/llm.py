import asyncio
import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# ==================== MODEL CATALOG ====================
# Provider -> list of { id, name, context, free? }

PROVIDER_MODELS = {
    "groq": [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "context": 128000},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B Instant", "context": 128000},
        {"id": "llama3-70b-8192", "name": "Llama 3 70B", "context": 8192},
        {"id": "llama3-8b-8192", "name": "Llama 3 8B", "context": 8192},
        {"id": "gemma2-9b-it", "name": "Gemma 2 9B", "context": 8192},
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "context": 32768},
    ],
    "gemini": [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "context": 1000000},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "context": 1000000},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "context": 2000000},
        {"id": "gemini-pro", "name": "Gemini Pro (Legacy)", "context": 32000},
    ],
    "claude": [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "context": 200000},
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "context": 200000},
        {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "context": 200000},
        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "context": 200000},
    ],
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o", "context": 128000},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "context": 128000},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "context": 128000},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "context": 16385},
    ],
    "openrouter": [
        {
            "id": "meta-llama/llama-3.3-70b-instruct",
            "name": "Llama 3.3 70B Instruct",
            "context": 128000,
        },
        {
            "id": "meta-llama/llama-3.1-405b-instruct",
            "name": "Llama 3.1 405B Instruct",
            "context": 128000,
        },
        {
            "id": "meta-llama/llama-3.1-8b-instruct:free",
            "name": "Llama 3.1 8B (Free)",
            "context": 128000,
            "free": True,
        },
        {
            "id": "google/gemini-2.0-flash-exp:free",
            "name": "Gemini 2.0 Flash (Free)",
            "context": 1000000,
            "free": True,
        },
        {"id": "google/gemini-pro-1.5", "name": "Gemini Pro 1.5", "context": 2000000},
        {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "context": 200000},
        {"id": "anthropic/claude-3.5-haiku", "name": "Claude 3.5 Haiku", "context": 200000},
        {"id": "openai/gpt-4o", "name": "GPT-4o", "context": 128000},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "context": 128000},
        {"id": "mistralai/mistral-large-latest", "name": "Mistral Large", "context": 128000},
        {"id": "mistralai/mixtral-8x22b-instruct", "name": "Mixtral 8x22B", "context": 65536},
        {"id": "qwen/qwen-2.5-72b-instruct", "name": "Qwen 2.5 72B", "context": 128000},
        {"id": "deepseek/deepseek-chat", "name": "DeepSeek V3", "context": 128000},
        {"id": "deepseek/deepseek-r1", "name": "DeepSeek R1", "context": 64000},
        {"id": "nousresearch/hermes-3-llama-3.1-405b", "name": "Hermes 3 405B", "context": 128000},
        {
            "id": "microsoft/phi-3-medium-128k-instruct",
            "name": "Phi 3 Medium 128K",
            "context": 128000,
        },
    ],
    "local": [
        {"id": "custom", "name": "Custom Model (enter below)", "context": 0},
    ],
}

MODEL_DEFAULTS = {
    "groq": "llama-3.3-70b-versatile",
    "gemini": "gemini-2.0-flash",
    "claude": "claude-3-5-sonnet-20241022",
    "openai": "gpt-4o-mini",
    "openrouter": "meta-llama/llama-3.1-8b-instruct:free",
    "local": "llama3",
}

GEMINI_FALLBACK_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "models/gemini-1.5-flash",
    "gemini-pro",
]

# OpenRouter base URL
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Default local endpoints
LOCAL_DEFAULTS = {
    "ollama": "http://localhost:11434/v1",
    "lm_studio": "http://localhost:1234/v1",
    "llamacpp": "http://localhost:8080/v1",
}


def sanitize_llm_output(text: str) -> str:
    """Remove markdown code blocks and training markers from LLM output."""
    text = re.sub(r"```(?:json)?", "", text)
    text = text.replace("```", "")
    text = text.replace("[TRAINING]", "").replace("[TRAINING MATERIAL]", "")
    return text.strip()


def repair_json(text: str) -> str:
    """Attempt to repair and extract valid JSON from LLM output."""
    text = sanitize_llm_output(text)

    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1:
        text = text[start : end + 1]

    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    return text


def get_provider_models(provider: str) -> list:
    """Return the model catalog for a given provider."""
    return PROVIDER_MODELS.get(provider, [])


# ==================== PROVIDER INVOCATIONS ====================


async def _invoke_openai_compatible(
    api_key: str,
    model_name: str,
    messages: list,
    base_url: str = None,
    temperature: float = 0.7,
    extra_headers: dict = None,
):
    """Generic OpenAI-compatible invocation (works for OpenAI, OpenRouter, Local LLMs)."""
    from langchain_openai import ChatOpenAI

    kwargs = {
        "api_key": api_key or "not-needed",
        "model": model_name,
        "temperature": temperature,
    }
    if base_url:
        kwargs["base_url"] = base_url
    if extra_headers:
        kwargs["default_headers"] = extra_headers

    chat = ChatOpenAI(**kwargs)
    return await asyncio.wait_for(chat.ainvoke(messages), timeout=30.0)


async def _invoke_gemini(api_key: str, model_name: str, messages: list, temperature: float = 0.7):
    """Invoke Gemini with fallback model strategy."""
    from langchain_google_genai import ChatGoogleGenerativeAI

    model_candidates = [model_name] + GEMINI_FALLBACK_MODELS
    model_candidates = list(dict.fromkeys(model_candidates))

    last_error = None
    for candidate in model_candidates:
        try:
            logger.info(f"Attempting Gemini with model: {candidate}")
            convert_system = "1.5" not in candidate and "2.0" not in candidate
            chat = ChatGoogleGenerativeAI(
                google_api_key=api_key,
                model=candidate,
                temperature=temperature,
                convert_system_message_to_human=convert_system,
            )
            response = await asyncio.wait_for(chat.ainvoke(messages), timeout=15.0)
            if response:
                logger.info(f"Success with model: {candidate}")
                return response
        except TimeoutError:
            logger.warning(f"Timeout with model {candidate}")
            last_error = Exception(f"Request timed out for {candidate}")
        except Exception as e:
            logger.warning(f"Failed with model {candidate}: {e}")
            last_error = e

    raise last_error or Exception("All Gemini models failed")


async def _invoke_provider(config: dict[str, Any], messages: list, temperature: float = 0.7):
    """Route to the correct provider invocation."""
    provider = config["provider"]
    api_key = config.get("api_key", "")
    model_name = config.get("model_name") or MODEL_DEFAULTS.get(provider)
    base_url = config.get("base_url")

    if provider == "groq":
        from langchain_groq import ChatGroq

        chat = ChatGroq(api_key=api_key, model_name=model_name, temperature=temperature)
        return await asyncio.wait_for(chat.ainvoke(messages), timeout=15.0)

    elif provider == "gemini":
        return await _invoke_gemini(api_key, model_name, messages, temperature)

    elif provider == "claude":
        from langchain_anthropic import ChatAnthropic

        chat = ChatAnthropic(api_key=api_key, model=model_name, temperature=temperature)
        return await asyncio.wait_for(chat.ainvoke(messages), timeout=30.0)

    elif provider == "openai":
        return await _invoke_openai_compatible(
            api_key,
            model_name,
            messages,
            temperature=temperature,
        )

    elif provider == "openrouter":
        return await _invoke_openai_compatible(
            api_key=api_key,
            model_name=model_name,
            messages=messages,
            base_url=OPENROUTER_BASE_URL,
            temperature=temperature,
            extra_headers={
                "HTTP-Referer": "https://github.com/fdciabdul/Pretexta",
                "X-Title": "Pretexta",
            },
        )

    elif provider == "local":
        # Local LLM: Ollama, LM Studio, llama.cpp, etc.
        endpoint = base_url or LOCAL_DEFAULTS["ollama"]
        return await _invoke_openai_compatible(
            api_key=api_key or "not-needed",
            model_name=model_name or "llama3",
            messages=messages,
            base_url=endpoint,
            temperature=temperature,
        )

    else:
        raise ValueError(f"Unsupported provider: {provider}")


# ==================== PUBLIC API ====================


async def get_llm_generate_model(config: dict[str, Any], prompt: str, context: dict[str, Any]):
    """Generate pretext content using configured LLM provider."""
    context_str = json.dumps(context, indent=2) if isinstance(context, dict) else str(context)
    system_message = SystemMessage(
        content=(
            "You are a social engineering pretext generator. Generate realistic, "
            "ethically-sound pretexts for security awareness training. Always mark "
            "outputs as training material.\n\nContext: " + context_str + "\n\n"
        )
    )
    user_message = HumanMessage(content=prompt)
    messages = [system_message, user_message]

    return await _invoke_provider(config, messages)


async def get_llm_chat_model(config: dict[str, Any], messages: list):
    """Chat interaction using configured LLM provider."""
    return await _invoke_provider(config, messages, temperature=0.8)


async def fetch_local_models(base_url: str) -> list:
    """Fetch available models from a local Ollama/LM Studio instance."""
    import httpx

    # Try Ollama API format
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            # Ollama native API
            response = await client.get(f"{base_url.rstrip('/v1').rstrip('/')}/api/tags")
            if response.status_code == 200:
                data = response.json()
                return [
                    {"id": m["name"], "name": m["name"], "context": 0, "local": True}
                    for m in data.get("models", [])
                ]
    except Exception:
        pass

    # Try OpenAI-compatible /models endpoint
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{base_url.rstrip('/')}/models")
            if response.status_code == 200:
                data = response.json()
                return [
                    {"id": m["id"], "name": m.get("id", "unknown"), "context": 0, "local": True}
                    for m in data.get("data", [])
                ]
    except Exception:
        pass

    return []


async def fetch_openrouter_models(api_key: str) -> list:
    """Fetch available models from OpenRouter API."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            )
            if response.status_code == 200:
                data = response.json()
                models = []
                for m in data.get("data", []):
                    models.append(
                        {
                            "id": m["id"],
                            "name": m.get("name", m["id"]),
                            "context": m.get("context_length", 0),
                            "pricing": m.get("pricing", {}),
                        }
                    )
                # Sort: free models first, then by name
                models.sort(
                    key=lambda x: (
                        not (x.get("pricing", {}).get("prompt", "1") == "0"),
                        x["name"],
                    )
                )
                return models
    except Exception as e:
        logger.warning(f"Failed to fetch OpenRouter models: {e}")

    return []
