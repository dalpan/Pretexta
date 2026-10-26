"""
Thin async client for the GoPhish REST API.

Pretexta is the source of truth; GoPhish is only a sending and click-tracking
backend. See the verified contract in docs/design/live-campaigns.md, Appendix A.
"""

from typing import Any

import httpx


class GophishError(RuntimeError):
    pass


class GophishClient:
    def __init__(
        self, base_url: str, api_key: str, verify_tls: bool = False, timeout: float = 15.0
    ):
        if not base_url or not api_key:
            raise GophishError("GoPhish base_url and api_key are required")
        self._base = base_url.rstrip("/")
        self._key = api_key
        # Self-signed admin cert is the GoPhish default; operators can opt into verification.
        self._client = httpx.AsyncClient(
            base_url=self._base,
            headers={"Authorization": f"Bearer {api_key}"},
            verify=verify_tls,
            timeout=timeout,
        )

    async def __aenter__(self) -> "GophishClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, payload: dict | None = None) -> Any:
        try:
            resp = await self._client.request(method, path, json=payload)
        except httpx.HTTPError as exc:
            raise GophishError(f"GoPhish unreachable: {exc}") from exc
        if resp.status_code >= 400:
            raise GophishError(f"GoPhish {method} {path} -> {resp.status_code}: {resp.text[:200]}")
        if not resp.content:
            return None
        return resp.json()

    async def ping(self) -> bool:
        await self._request("GET", "/api/campaigns/summary")
        return True

    async def create_group(self, name: str, targets: list[dict]) -> dict:
        return await self._request("POST", "/api/groups/", {"name": name, "targets": targets})

    async def create_template(self, name: str, subject: str, html: str, text: str = "") -> dict:
        return await self._request(
            "POST",
            "/api/templates/",
            {"name": name, "subject": subject, "html": html, "text": text},
        )

    async def create_page(self, name: str, html: str, redirect_url: str = "") -> dict:
        """Create a landing page that never captures input (G5)."""
        page = await self._request(
            "POST",
            "/api/pages/",
            {
                "name": name,
                "html": html,
                "capture_credentials": False,
                "capture_passwords": False,
                "redirect_url": redirect_url,
            },
        )
        if page.get("capture_credentials") or page.get("capture_passwords"):
            raise GophishError("GoPhish returned a page that captures input; refusing (G5)")
        return page

    async def create_smtp(
        self,
        name: str,
        host: str,
        from_address: str,
        username: str = "",
        password: str = "",
        headers: list[dict[str, str]] | None = None,
    ) -> dict:
        # GoPhish requires a bare email in from_address; a display name is carried
        # as a From header instead (verified against gophish:latest).
        payload = {
            "name": name,
            "interface_type": "SMTP",
            "host": host,
            "from_address": from_address,
            "ignore_cert_errors": True,
        }
        if headers:
            payload["headers"] = headers
        if username:
            payload["username"] = username
        if password:
            payload["password"] = password
        return await self._request("POST", "/api/smtp/", payload)

    async def launch_campaign(
        self, name: str, template: str, page: str, smtp: str, url: str, groups: list[str]
    ) -> dict:
        return await self._request(
            "POST",
            "/api/campaigns/",
            {
                "name": name,
                "template": {"name": template},
                "page": {"name": page},
                "smtp": {"name": smtp},
                "url": url,
                "groups": [{"name": g} for g in groups],
            },
        )

    async def campaign_results(self, campaign_id: int) -> dict:
        return await self._request("GET", f"/api/campaigns/{campaign_id}/results")

    async def delete_campaign(self, campaign_id: int) -> None:
        await self._request("DELETE", f"/api/campaigns/{campaign_id}")


# GoPhish per-recipient status → Pretexta event type (docs/design Appendix A).
STATUS_TO_EVENT = {
    "Email Sent": "sent",
    "Email Opened": "opened",
    "Clicked Link": "clicked",
    "Submitted Data": "submitted",
    "Error": "send_error",
    "Error Sending Email": "send_error",
}

# Ordered by progression, so we only ever advance a recipient's furthest state.
EVENT_RANK = {
    "send_error": 0,
    "sent": 1,
    "opened": 2,
    "clicked": 3,
    "submitted": 4,
}
