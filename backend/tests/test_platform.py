"""Non-authz regressions: secrets, rate limiting, URL helpers."""

import jwt

from tests.conftest import make_user


def test_default_jwt_secret_is_never_used(monkeypatch):
    from services import auth

    monkeypatch.setenv("JWT_SECRET", "change-this-secret-key-in-production")
    secret = auth._resolve_jwt_secret()
    assert secret != "change-this-secret-key-in-production"
    assert len(secret) >= 32

    monkeypatch.delenv("JWT_SECRET")
    assert auth._resolve_jwt_secret() != ""


def test_ollama_base_url_strips_suffix_not_characters():
    from services.llm import ollama_root

    assert ollama_root("http://localhost:11434/v1") == "http://localhost:11434"
    assert ollama_root("http://gpu-box:1111/v1") == "http://gpu-box:1111"
    assert ollama_root("http://host.dev1/v1/") == "http://host.dev1"
    assert ollama_root("http://host:11434") == "http://host:11434"


async def test_llm_rate_limit_is_per_user_and_returns_429(api):
    from middleware.rate_limit import RATE_LIMIT_RULES

    max_calls, _ = RATE_LIMIT_RULES[("POST", "/api/llm/chat")]
    _, h1 = await make_user("user")
    _, h2 = await make_user("user")

    statuses = [
        (await api.post("/api/llm/chat", json={"message": "hi"}, headers=h1)).status_code
        for _ in range(max_calls + 1)
    ]
    assert statuses[-1] == 429
    assert 429 not in statuses[:-1]

    # Another user must not share the first user's bucket
    r = await api.post("/api/llm/chat", json={"message": "hi"}, headers=h2)
    assert r.status_code != 429


async def test_login_rate_limit_returns_429(api):
    codes = [
        (await api.post("/api/auth/login", json={"username": "x", "password": "y"})).status_code
        for _ in range(11)
    ]
    assert codes[-1] == 429


def test_tokens_from_other_secret_rejected():
    from services import auth

    forged = jwt.encode({"user_id": "x"}, "change-this-secret-key-in-production", "HS256")
    try:
        jwt.decode(forged, auth.JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidSignatureError:
        return
    raise AssertionError("token signed with the public default secret was accepted")


async def test_llm_chat_rejects_oversized_input(api):
    _, h = await make_user("user")
    r = await api.post("/api/llm/chat", json={"message": "x" * 5000}, headers=h)
    assert r.status_code == 413
    r = await api.post(
        "/api/llm/chat",
        json={"message": "hi", "history": [{"role": "user", "content": "a"}] * 41},
        headers=h,
    )
    assert r.status_code == 413
