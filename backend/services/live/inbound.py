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
    sender = sender_address(msg.get("From"))
    if not sender:
        return {"status": "no_sender"}

    # Preferred: the campaign token in the plus-addressed Reply-To.
    token = parse_token(
        msg.get("To"), msg.get("Delivered-To"), msg.get("Envelope-To"), msg.get("X-Original-To")
    )
    campaign = None
    if token:
        campaign = await db.live_campaigns.find_one({"reply_token": token}, {"_id": 0})

    # Fallback: many recipients reply to the sender (From) address, not Reply-To,
    # so there is no token. A recipient is in at most one active campaign
    # (enforced at pre-flight), so match by their address.
    if not campaign:
        running = await db.live_campaigns.find({"status": "running"}, {"id": 1, "_id": 0}).to_list(
            1000
        )
        running_ids = [c["id"] for c in running]
        if running_ids:
            recipient = await db.live_recipients.find_one(
                {"email": sender, "campaign_id": {"$in": running_ids}}, {"_id": 0}
            )
            if recipient:
                campaign = await db.live_campaigns.find_one(
                    {"id": recipient["campaign_id"]}, {"_id": 0}
                )
    if not campaign:
        return {"status": "unknown_campaign"}

    body = strip_quoted(extract_body(msg))
    if not body:
        return {"status": "empty_body"}
    return await conversation.process_inbound(campaign, sender, body, gateway=gateway)


# ── IMAP I/O ─────────────────────────────────────────────────────────


def _fetch_new(config: dict, last_uid: int, last_uidvalidity: int) -> tuple[list[bytes], int, int]:
    """Blocking IMAP fetch of messages with UID greater than the watermark.
    Returns (raw messages, current UIDVALIDITY, highest UID fetched). Runs in a thread."""
    host, _, port = config["imap_host"].partition(":")
    conn = (
        imaplib.IMAP4_SSL(host, int(port))
        if config.get("imap_ssl", True)
        else imaplib.IMAP4(host, int(port or 143))
    )
    try:
        conn.login(config["imap_user"], config.get("imap_password", ""))
        conn.select("INBOX")
        # Track by UID, not the \Seen flag: a human reading the mailbox (e.g. in
        # Thunderbird) marks replies seen, which an UNSEEN search would then skip.
        uidvalidity = _uidvalidity(conn)
        start = last_uid + 1 if uidvalidity == last_uidvalidity else 1
        _, data = conn.uid("SEARCH", None, f"UID {start}:*")
        raws: list[bytes] = []
        max_uid = last_uid if uidvalidity == last_uidvalidity else 0
        for raw_uid in data[0].split():
            uid = int(raw_uid)
            if uid < start:  # the "n:*" range can return the last message even if its uid < n
                continue
            _, msg_data = conn.uid("FETCH", raw_uid, "(RFC822)")
            if msg_data and msg_data[0]:
                raws.append(msg_data[0][1])
            max_uid = max(max_uid, uid)
        return raws, uidvalidity, max_uid
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def _uidvalidity(conn: imaplib.IMAP4) -> int:
    _, resp = conn.status("INBOX", "(UIDVALIDITY)")
    match = re.search(rb"UIDVALIDITY (\d+)", resp[0] or b"")
    return int(match.group(1)) if match else 0


async def poll_once() -> dict:
    """Fetch and route replies that arrived since the last poll."""
    config = await db.live_config.find_one({"id": "live_config"}, {"_id": 0})
    if not config or not config.get("imap_host"):
        return {"polled": 0, "reason": "imap_not_configured"}

    state = await db.live_state.find_one({"id": "imap_watermark"}, {"_id": 0}) or {}
    try:
        raws, uidvalidity, max_uid = await asyncio.to_thread(
            _fetch_new, config, int(state.get("last_uid", 0)), int(state.get("uidvalidity", 0))
        )
    except Exception as exc:
        logger.warning(f"IMAP poll failed: {exc}")
        return {"polled": 0, "error": str(exc)}

    gateway = await AIGateway.from_db()
    outcomes: dict[str, int] = {}
    for raw in raws:
        # One bad message (e.g. the LLM fails to draft a reply) must not abort the
        # batch or block the watermark — that would re-ingest everything next tick.
        try:
            result = await route_message(raw, gateway=gateway)
            status = result["status"]
        except Exception as exc:
            logger.warning(f"routing a reply failed: {exc}")
            status = "route_error"
        outcomes[status] = outcomes.get(status, 0) + 1

    # Always advance the watermark to what we fetched, so nothing is processed twice.
    await db.live_state.update_one(
        {"id": "imap_watermark"},
        {"$set": {"last_uid": max_uid, "uidvalidity": uidvalidity}},
        upsert=True,
    )
    return {"polled": len(raws), "outcomes": outcomes}


async def run_poller(interval_seconds: int = 30) -> None:
    """Background loop, always running. poll_once is a no-op until IMAP is
    configured, so saving the config in Settings takes effect on the next tick
    without a restart."""
    logger.info("Live reply poller started")
    while True:
        try:
            await poll_once()
        except Exception as exc:
            logger.warning(f"poller iteration error: {exc}")
        await asyncio.sleep(interval_seconds)
