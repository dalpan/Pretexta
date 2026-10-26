"""
IMAP poller for live-campaign replies (P3 plumbing).

A recipient's reply arrives at the Reply-To address
`<reply_local>+<campaign_token>@<reply_domain>`. The poller reads the mailbox,
maps the token to a campaign, matches the recipient by the reply's From address,
strips quoted history, and hands the fresh text to the conversation engine.

Pure parsing (token, body, sender) is separated from IMAP I/O so it can be
tested without a server.
"""

import asyncio
import imaplib
import logging
import re
from email import message_from_bytes
from email.message import Message
from email.utils import parseaddr

from services.ai_gateway import AIGateway
from services.database import db
from services.live import conversation

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"\+([A-Za-z0-9_-]{6,64})@")

# Lines that mark the start of quoted history in a reply.
_QUOTE_MARKERS = (
    re.compile(r"^\s*On .*wrote:\s*$", re.IGNORECASE),
    re.compile(r"^\s*-+\s*Original Message\s*-+\s*$", re.IGNORECASE),
    re.compile(r"^\s*(From|Pada|Dari):\s", re.IGNORECASE),
    re.compile(r"^\s*_{5,}\s*$"),
)


def parse_token(*header_values: str | None) -> str | None:
    """Extract the campaign token from any plus-addressed recipient header."""
    for value in header_values:
        if not value:
            continue
        match = _TOKEN_RE.search(value)
        if match:
            return match.group(1)
    return None


def sender_address(from_header: str | None) -> str | None:
    name, addr = parseaddr(from_header or "")
    addr = addr.strip().lower()
    return addr or None


def strip_quoted(text: str) -> str:
    """Return just the recipient's new text, dropping quoted history and signatures."""
    lines: list[str] = []
    for line in text.splitlines():
        if line.lstrip().startswith(">"):
            break
        if any(marker.match(line) for marker in _QUOTE_MARKERS):
            break
        lines.append(line)
    cleaned = "\n".join(lines).strip()
    return cleaned or text.strip()


def extract_body(msg: Message) -> str:
    """Plain-text body of an email, preferring text/plain parts."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(
                part.get("Content-Disposition", "")
            ):
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", "replace")
        return ""
    payload = msg.get_payload(decode=True)
    if payload is None:
        return ""
    return payload.decode(msg.get_content_charset() or "utf-8", "replace")


async def route_message(raw: bytes, gateway=None) -> dict:
    """Parse one raw RFC822 message and dispatch it to the conversation engine."""
    msg = message_from_bytes(raw)
    token = parse_token(
        msg.get("To"), msg.get("Delivered-To"), msg.get("Envelope-To"), msg.get("X-Original-To")
    )
    if not token:
        return {"status": "no_token"}
    campaign = await db.live_campaigns.find_one({"reply_token": token}, {"_id": 0})
    if not campaign:
        return {"status": "unknown_campaign"}
    sender = sender_address(msg.get("From"))
    if not sender:
        return {"status": "no_sender"}

    body = strip_quoted(extract_body(msg))
    if not body:
        return {"status": "empty_body"}
    return await conversation.process_inbound(campaign, sender, body, gateway=gateway)


# ── IMAP I/O ─────────────────────────────────────────────────────────


def _fetch_unseen(config: dict) -> list[bytes]:
    """Blocking IMAP fetch of UNSEEN messages; marks them Seen. Runs in a thread."""
    host, _, port = config["imap_host"].partition(":")
    conn = (
        imaplib.IMAP4_SSL(host, int(port))
        if config.get("imap_ssl", True)
        else imaplib.IMAP4(host, int(port or 143))
    )
    try:
        conn.login(config["imap_user"], config.get("imap_password", ""))
        conn.select("INBOX")
        _, data = conn.search(None, "UNSEEN")
        raws = []
        for num in data[0].split():
            _, msg_data = conn.fetch(num, "(RFC822)")
            if msg_data and msg_data[0]:
                raws.append(msg_data[0][1])
            conn.store(num, "+FLAGS", "\\Seen")
        return raws
    finally:
        try:
            conn.logout()
        except Exception:
            pass


async def poll_once() -> dict:
    """Fetch and route all unseen replies once."""
    config = await db.live_config.find_one({"id": "live_config"}, {"_id": 0})
    if not config or not config.get("imap_host"):
        return {"polled": 0, "reason": "imap_not_configured"}
    try:
        raws = await asyncio.to_thread(_fetch_unseen, config)
    except Exception as exc:
        logger.warning(f"IMAP poll failed: {exc}")
        return {"polled": 0, "error": str(exc)}

    gateway = await AIGateway.from_db()
    outcomes: dict[str, int] = {}
    for raw in raws:
        result = await route_message(raw, gateway=gateway)
        outcomes[result["status"]] = outcomes.get(result["status"], 0) + 1
    return {"polled": len(raws), "outcomes": outcomes}


async def run_poller(interval_seconds: int = 30) -> None:
    """Background loop. Started from the app lifespan when IMAP is configured."""
    logger.info("Live reply poller started")
    while True:
        try:
            await poll_once()
        except Exception as exc:
            logger.warning(f"poller iteration error: {exc}")
        await asyncio.sleep(interval_seconds)
