"""
Direct SMTP sender for 1:1 persona replies and teachable-moment follow-ups.

Campaign blasts go through GoPhish; these single, threaded replies go straight
through the configured relay. Kept behind one function so tests can patch it.
"""

from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import aiosmtplib


async def send_email(
    config: dict,
    to_address: str,
    from_name: str,
    from_address: str,
    subject: str,
    body: str,
    in_reply_to: str | None = None,
) -> str:
    """Send a plain-text email through the relay in `config`. Returns the Message-ID."""
    msg = EmailMessage()
    msg["From"] = formataddr((from_name, from_address))
    msg["To"] = to_address
    msg["Subject"] = subject
    message_id = make_msgid()
    msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to
    msg.set_content(body)

    host, _, port = config.get("smtp_host", "localhost:25").partition(":")
    await aiosmtplib.send(
        msg,
        hostname=host,
        port=int(port or 25),
        username=config.get("smtp_username") or None,
        password=config.get("smtp_password") or None,
        start_tls=bool(config.get("smtp_starttls", False)),
    )
    return message_id
