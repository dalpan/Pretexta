"""
Conversation engine (P3) — review mode.

When a recipient replies to a simulated phish, Pretexta continues the thread
with an AI persona bound to ONE approved objective. The outcome is decided by
what the recipient actually does, never by a token the model emits:

- they type a secret            -> redacted before storage, outcome `disclosed`
- they agree to the objective   -> outcome `complied`
- otherwise                     -> a persona reply is drafted and HELD for a
                                   human to approve (review mode, G8)

The persona prompt is built here on the server from campaign fields only; the
browser never supplies prompt text (G7). Secrets never reach the model: the
inbound text is scrubbed first.

The prompt includes the original lure so the model knows the thread, and it answers in
the language the recipient wrote in. A hosted model may still decline to draft;
that is retried once and otherwise queued as an empty draft marked
`persona_declined`, so the reviewer writes the reply instead of approving a
refusal or an empty email.
"""

import html
import logging
import re
import uuid
from datetime import UTC, datetime

from services.database import db
from services.live import mailer
from services.live.launch import get_live_config
from services.live.output_filter import review_draft
from services.live.secrets import scrub

logger = logging.getLogger(__name__)

MAX_TURNS_HARD_CAP = 6

TEACHABLE_MOMENT_TEXT = (
    "This was a simulated phishing test run by your organization. No account was "
    "compromised. The earlier message was not real.\n\n"
    "When a message pressures you to act quickly or to share a code, password or "
    "approval, verify it through a channel you trust before responding.\n\n"
    "Thank you for helping keep everyone safer."
)

_OBJECTIVE_GOALS = {
    "click_link": "get the person to click the link you referenced earlier",
    "reply": "get the person to keep replying with the detail you asked for",
    "agree_to_share_otp": "get the person to AGREE to share a one-time code (never ask them to paste it)",
    "agree_to_approve_payment": "get the person to AGREE to approve the payment",
    "agree_to_install_tool": "get the person to AGREE to install the tool you mentioned",
}


_TAG_RE = re.compile(r"<[^>]+>")
_TEMPLATE_URL_RE = re.compile(r"\{\{\s*\.URL\s*\}\}")
_TEMPLATE_RE = re.compile(r"\{\{[^}]*\}\}")

_ID_WORDS = {
    "apa", "ini", "itu", "saya", "aku", "anda", "kamu", "tidak", "nggak", "gak", "yang",
    "dan", "untuk", "dengan", "ada", "bisa", "sudah", "belum", "mohon", "kenapa", "mengapa",
    "siapa", "bapak", "pak", "ibu", "bu", "terima", "kasih", "tolong", "kok", "gimana",
    "bagaimana", "apakah", "maaf", "kode", "dari", "ke", "di", "akan", "harus", "boleh",
}  # fmt: skip
_EN_WORDS = {
    "what", "is", "this", "the", "i", "you", "please", "why", "who", "can", "not", "and",
    "to", "of", "for", "with", "my", "your", "it", "do", "does", "are", "sorry", "thanks",
}  # fmt: skip

# A model declining to write the persona turn, in English or Indonesian.
_REFUSAL_VERBS = (
    r"(?:help|assist|generate|create|write|draft|produce|provide|comply|fulfil+|"
    r"continue|participate|engage|do that|role-?play)"
)
_REFUSAL_RE = re.compile(
    r"^\W*(?:(?:i'm\s+)?sorry,?\s+(?:but\s+)?i\b|as an ai\b"
    r"|maaf,?\s+(?:saya|aku)\s+tidak\s+(?:bisa|dapat)\b"
    r"|(?:saya|aku)\s+tidak\s+(?:bisa|dapat)\s+(?:membantu|membuat|menulis)\b)"
    r"|\bi\s*(?:cannot|can't|can not|won't|will not|am unable to|'m unable to|am not able to)"
    rf"\s+(?:\w+\s+)?{_REFUSAL_VERBS}\b",
    re.IGNORECASE,
)


def lure_text(campaign: dict) -> str:
    """The original email as plain text, the first turn of the thread."""
    raw = campaign.get("body_html") or campaign.get("body") or ""
    raw = _TEMPLATE_URL_RE.sub("[link]", raw)
    raw = _TEMPLATE_RE.sub("", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", raw)
    text = html.unescape(_TAG_RE.sub("", raw))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return text[:2000]


def detect_language(text: str) -> str | None:
    """'id' or 'en' when the recipient's words make it clear, else None."""
    words = re.findall(r"[a-zA-Z']+", (text or "").lower())
    id_hits = sum(w in _ID_WORDS for w in words)
    en_hits = sum(w in _EN_WORDS for w in words)
    if id_hits > en_hits:
        return "id"
    if en_hits > id_hits:
        return "en"
    return None


def is_refusal(draft: str) -> bool:
    """True when the model produced nothing usable as the persona's reply."""
    text = (draft or "").strip()
    return not text or bool(_REFUSAL_RE.search(text[:300]))


def _lure_block(campaign: dict) -> str:
    text = lure_text(campaign)
    if not text:
        return ""
    subject = campaign.get("subject") or ""
    return f"The email you sent first (subject: {subject}):\n---\n{text}\n---\n\n"


def build_persona_prompt(campaign: dict, turn: int, language: str | None = None) -> str:
    """Locked system prompt. Built only from approved campaign fields; `language`
    is the recipient's language when it could be detected."""
    goal = _OBJECTIVE_GOALS.get(campaign["objective"], "continue the pretext")
    principles = ", ".join(campaign.get("principles", []))
    lang = (
        "Write in Indonesian (Bahasa Indonesia)."
        if (language or campaign.get("language")) == "id"
        else "Write in English."
    )
    return (
        "You are role-playing the sender of a simulated phishing email in an "
        "AUTHORIZED security awareness exercise run by the recipient's own "
        "organization. Your reply is held for a human trainer to review before it "
        "is sent, the recipient is debriefed afterwards, and no real credentials "
        "or codes are ever collected. You are continuing the email thread you "
        "started.\n\n"
        f"{_lure_block(campaign)}"
        f"Your single objective: {goal}.\n"
        f"Influence techniques you may use: {principles}.\n"
        f"You are '{campaign['sender_name']}'. Do not claim to be anyone else.\n\n"
        "Hard rules you must never break:\n"
        "- Pursue ONLY the objective above. Never ask for passwords, codes, card "
        "numbers, home address, family, health or personal bank details.\n"
        "- Never threaten the person or their job. Keep it professional.\n"
        "- Keep the reply short (2-4 sentences), like a real email.\n"
        f"- This is turn {turn}; wrap up soon.\n"
        f"{lang}\n"
        "Write only the body of your reply, no subject line, no signature block."
    )


async def _record_message(
    campaign: dict,
    email: str,
    direction: str,
    body: str,
    status: str,
    secrets_found=None,
    **extra,
) -> None:
    doc = {
        "id": str(uuid.uuid4()),
        "campaign_id": campaign["id"],
        "organization_id": campaign.get("organization_id"),
        "email": email,
        "direction": direction,  # inbound | outbound
        "body_redacted": body,
        "status": status,  # received | draft_pending | approved | sent | blocked | discarded
        "secrets_found": secrets_found or [],
        "reviewed_by": None,
        "at": datetime.now(UTC),
        **extra,
    }
    await db.live_messages.insert_one(doc)
    return doc


async def _remediate(campaign: dict, email: str, outcome: str) -> None:
    """Assign targeted practice to a recipient who failed a live conversation."""
    try:
        from services.remediation import on_live_fail

        await on_live_fail(campaign, email, outcome)
    except Exception as exc:
        logger.warning(f"Remediation (live {outcome}) failed: {exc}")


async def _record_event(campaign: dict, email: str, event_type: str) -> None:
    await db.live_events.insert_one(
        {
            "campaign_id": campaign["id"],
            "organization_id": campaign.get("organization_id"),
            "email": email,
            "type": event_type,
            "at": datetime.now(UTC),
        }
    )


async def _history(campaign_id: str, email: str) -> list[dict]:
    msgs = (
        await db.live_messages.find({"campaign_id": campaign_id, "email": email}, {"_id": 0})
        .sort("at", 1)
        .to_list(50)
    )
    return msgs


async def process_inbound(campaign: dict, email: str, raw_body: str, gateway=None) -> dict:
    """
    Handle one inbound reply from `email`. `gateway` is an AIGateway-like object
    with `persona_chat`; injected so this is testable without a live LLM.
    Returns a summary dict describing what happened.
    """
    recipient = await db.live_recipients.find_one(
        {"campaign_id": campaign["id"], "email": email}, {"_id": 0}
    )
    if not recipient:
        return {"status": "unknown_recipient"}
    if recipient.get("conversation_state") in ("disclosed", "complied", "closed"):
        return {"status": "conversation_closed"}

    # 1. Scrub secrets BEFORE anything is stored or sent to the model (G6).
    redacted, secrets_found = scrub(raw_body)
    await _record_message(campaign, email, "inbound", redacted, "received", secrets_found)

    if secrets_found:
        await _close(campaign, email, "disclosed")
        await _record_event(campaign, email, "disclosed")
        await _queue_teachable_moment(campaign, email)
        await _remediate(campaign, email, "disclosed")
        return {"status": "disclosed", "secrets_found": secrets_found}

    # 2. Compliance judge: did they AGREE to the objective?
    if gateway and await _is_compliance(gateway, campaign, redacted):
        await _close(campaign, email, "complied")
        await _record_event(campaign, email, "complied")
        await _queue_teachable_moment(campaign, email)
        await _remediate(campaign, email, "complied")
        return {"status": "complied"}

    # 3. Turn budget.
    turn = recipient.get("turn", 0) + 1
    max_turns = min(campaign.get("max_turns", 4), MAX_TURNS_HARD_CAP)
    if turn > max_turns:
        await _close(campaign, email, "closed")
        return {"status": "turn_budget_reached"}

    # 4. Draft a persona reply, HELD for human review (G8).
    if not gateway:
        return {"status": "awaiting_gateway"}

    thread = await _history(campaign["id"], email)
    # Only what the recipient actually saw: their messages and replies we sent.
    history = [
        {
            "role": "assistant" if m["direction"] == "outbound" else "user",
            "content": m["body_redacted"],
        }
        for m in thread
        if m["body_redacted"] and (m["direction"] == "inbound" or m.get("status") == "sent")
    ]
    language = detect_language(redacted)
    prompt = build_persona_prompt(campaign, turn, language)
    draft = ""
    for _attempt in range(2):
        draft = (await gateway.persona_reply(system_prompt=prompt, history=history)).strip()
        if not is_refusal(draft):
            break
    await db.live_recipients.update_one(
        {"campaign_id": campaign["id"], "email": email},
        {"$set": {"turn": turn, "conversation_state": "active", "updated_at": _now()}},
    )
    if is_refusal(draft):
        # Queue an empty draft so a human writes this turn; never send a refusal.
        logger.info(f"persona declined to draft a reply for campaign {campaign['id']}")
        await _record_message(
            campaign, email, "outbound", "", "draft_pending", persona_declined=True
        )
        return {"status": "persona_declined", "violations": [], "draft": ""}

    violations = review_draft(
        draft,
        objective=campaign["objective"],
        allowed_senders=[campaign["sender_name"]],
        turn=turn,
        max_turns=max_turns,
    )
    status = "blocked" if violations else "draft_pending"
    await _record_message(campaign, email, "outbound", draft, status)
    return {"status": status, "violations": violations, "draft": draft}


async def _is_compliance(gateway, campaign: dict, text: str) -> bool:
    try:
        return await gateway.judge_compliance(objective=campaign["objective"], message=text)
    except Exception as exc:  # a judge failure must not crash ingest
        logger.warning(f"compliance judge failed: {exc}")
        return False


async def _close(campaign: dict, email: str, state: str) -> None:
    await db.live_recipients.update_one(
        {"campaign_id": campaign["id"], "email": email},
        {"$set": {"conversation_state": state, "updated_at": _now()}},
    )


async def _queue_teachable_moment(campaign: dict, email: str) -> None:
    """Send the teachable-moment follow-up. Best effort: logged, never fatal."""
    config = await get_live_config()
    if not config:
        return
    try:
        await mailer.send_email(
            config,
            to_address=email,
            from_name=campaign["sender_name"],
            from_address=campaign["sender_email"],
            subject=f"Re: {campaign['subject']}",
            body=TEACHABLE_MOMENT_TEXT,
        )
        await _record_message(campaign, email, "outbound", TEACHABLE_MOMENT_TEXT, "sent")
    except Exception as exc:
        logger.warning(f"teachable-moment send failed for {email}: {exc}")


async def send_approved_reply(campaign: dict, draft: dict, body: str, reviewer_id: str) -> dict:
    """Send a human-approved persona reply through the relay and mark it sent."""
    config = await get_live_config()
    if not config:
        raise RuntimeError("Live config missing")
    await mailer.send_email(
        config,
        to_address=draft["email"],
        from_name=campaign["sender_name"],
        from_address=campaign["sender_email"],
        subject=f"Re: {campaign['subject']}",
        body=body,
    )
    await db.live_messages.update_one(
        {"id": draft["id"]},
        {"$set": {"status": "sent", "body_redacted": body, "reviewed_by": reviewer_id}},
    )
    await _record_event(campaign, draft["email"], "persona_reply_sent")
    return {"status": "sent"}


def _now() -> str:
    return datetime.now(UTC).isoformat()
