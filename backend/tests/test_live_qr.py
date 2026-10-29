"""Quishing: the QR image endpoint and QR injection into the launch body."""

from services.live.launch import _body_with_qr
from tests.conftest import make_user


async def test_qr_endpoint_returns_png(api):
    # Public endpoint (a mail client loads it), so no auth header.
    r = await api.get("/api/live/qr", params={"data": "http://phish.test/track?rid=abc"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic


async def test_qr_endpoint_rejects_empty(api):
    assert (await api.get("/api/live/qr", params={"data": ""})).status_code == 422


def test_body_with_qr_injects_tracked_url():
    body = _body_with_qr(
        {"id": "c1", "body_html": "<p>hi {{.URL}}</p>", "use_qr": True},
        {"public_base_url": "http://host:9442/"},
    )
    # The literal GoPhish token is preserved so it is substituted per recipient.
    assert "http://host:9442/api/live/qr?data={{.URL}}" in body
    assert "<p>hi {{.URL}}</p>" in body  # original body kept


def test_body_with_qr_noop_without_flag_or_base():
    assert _body_with_qr({"id": "c", "body_html": "x", "use_qr": False}, {}) == "x"
    assert (
        _body_with_qr({"id": "c", "body_html": "x", "use_qr": True}, {"public_base_url": ""}) == "x"
    )


async def test_create_campaign_accepts_use_qr(api):
    from datetime import UTC, datetime, timedelta

    _, h = await make_user("trainer")
    await api.post("/api/live/domains", json={"domain": "acme.test"}, headers=h)
    now = datetime.now(UTC)
    payload = {
        "name": "QR drill",
        "objective": "click_link",
        "principles": ["authority"],
        "sender_name": "IT",
        "sender_email": "it@acme.test",
        "subject": "Scan to verify",
        "body_html": "<p>Scan: {{.URL}}</p>",
        "recipients": ["a@acme.test"],
        "starts_at": (now + timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(days=2)).isoformat(),
        "use_qr": True,
    }
    r = await api.post("/api/live/campaigns", json=payload, headers=h)
    assert r.status_code == 200
    from services.database import db

    camp = await db.live_campaigns.find_one({"id": r.json()["id"]})
    assert camp["use_qr"] is True
