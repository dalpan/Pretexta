import time
from collections import deque

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Per-endpoint rate limit rules: (max_calls, window_seconds)
RATE_LIMIT_RULES: dict[tuple[str, str], tuple[int, int]] = {
    ("POST", "/api/auth/login"): (10, 300),  # 10 attempts per 5 min per IP
    ("POST", "/api/auth/register"): (5, 300),  # 5 registrations per 5 min per IP
    ("POST", "/api/llm/generate"): (20, 60),  # 20 generations per minute per user
    ("POST", "/api/llm/chat/turn"): (30, 60),  # 30 chat messages per minute per user
    ("POST", "/api/llm/chat/start"): (20, 300),  # 20 new chat sessions per 5 min per user
}

# Keyed by (method, path, identifier) -> timestamps inside the window
_buckets: dict[tuple[str, str, str], deque[float]] = {}
_last_sweep = 0.0
_SWEEP_INTERVAL = 60.0


def reset_rate_limits() -> None:
    _buckets.clear()


def _sweep(now: float) -> None:
    """Drop buckets whose newest hit is older than their window, bounding memory."""
    global _last_sweep
    if now - _last_sweep < _SWEEP_INTERVAL:
        return
    _last_sweep = now
    for key in list(_buckets):
        window = RATE_LIMIT_RULES[(key[0], key[1])][1]
        if not _buckets[key] or now - _buckets[key][-1] >= window:
            del _buckets[key]


def _get_identifier(request: Request, path: str) -> str:
    """Verified user id for LLM routes, client IP otherwise.

    Note: behind a reverse proxy every client shares the proxy's IP; run uvicorn
    with --proxy-headers and --forwarded-allow-ips in that setup.
    """
    if path.startswith("/api/llm"):
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            from services.auth import JWT_ALGORITHM, JWT_SECRET

            try:
                payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                return f"user:{payload['user_id']}"
            except (jwt.PyJWTError, KeyError):
                pass
    return f"ip:{request.client.host if request.client else 'unknown'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding-window rate limiter for auth and LLM endpoints.

    State is per process: it resets on restart and is not shared between
    workers. Replace with Redis for multi-worker deployments.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        rule = RATE_LIMIT_RULES.get((request.method, path))

        if rule:
            max_calls, window = rule
            now = time.monotonic()
            _sweep(now)

            key = (request.method, path, _get_identifier(request, path))
            hits = _buckets.setdefault(key, deque())
            while hits and now - hits[0] >= window:
                hits.popleft()

            if len(hits) >= max_calls:
                retry_after = int(window - (now - hits[0])) + 1
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Rate limit exceeded. Max {max_calls} requests per {window}s."
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

        return await call_next(request)
