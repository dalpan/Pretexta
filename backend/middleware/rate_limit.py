import time
from collections import defaultdict

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

# Per-endpoint rate limit rules: (max_calls, window_seconds)
RATE_LIMIT_RULES: dict[tuple[str, str], tuple[int, int]] = {
    ("POST", "/api/auth/login"): (10, 300),      # 10 attempts per 5 min
    ("POST", "/api/auth/register"): (5, 300),    # 5 registrations per 5 min per IP
    ("POST", "/api/llm/generate"): (20, 60),     # 20 generations per minute per user
    ("POST", "/api/llm/chat"): (30, 60),         # 30 chat messages per minute per user
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory rate limiter for auth and LLM endpoints.

    Uses IP address for unauthenticated routes (auth) and
    Authorization header token for authenticated routes (LLM).
    Note: in-memory storage is lost on restart and doesn't scale
    horizontally — replace with Redis for multi-worker deployments.
    """

    def __init__(self, app, max_attempts: int = 10, window_seconds: int = 300):
        super().__init__(app)
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # Keyed by (method, path, identifier)
        self.attempts: dict[tuple[str, str, str], list[float]] = defaultdict(list)

    def _get_identifier(self, request: Request, route_key: tuple[str, str]) -> str:
        """Use Bearer token for LLM routes, IP for auth routes."""
        if route_key[1].startswith("/api/llm"):
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                return auth[7:32]  # Use first 25 chars of token as key
        client_ip = request.client.host if request.client else "unknown"
        return client_ip

    async def dispatch(self, request: Request, call_next):
        route_key = (request.method, request.url.path)
        rule = RATE_LIMIT_RULES.get(route_key)

        if rule:
            max_calls, window = rule
            identifier = self._get_identifier(request, route_key)
            bucket_key = (request.method, request.url.path, identifier)
            now = time.time()

            # Evict expired timestamps
            self.attempts[bucket_key] = [
                t for t in self.attempts[bucket_key] if now - t < window
            ]

            if len(self.attempts[bucket_key]) >= max_calls:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Max {max_calls} requests per {window // 60} min.",
                )

            self.attempts[bucket_key].append(now)

        return await call_next(request)
