"""
Recipient domain verification (guardrail G1).

A real domain counts as verified only while its DNS publishes the TXT record
`pretexta-verify=<token>`. Reserved test TLDs (RFC 2606 / RFC 6761) are
accepted as sandbox domains without DNS: mail to them can never reach a real
person, which makes them safe for development and booth demos.
"""

import re
import secrets
from datetime import UTC, datetime, timedelta

import dns.asyncresolver
import dns.exception

from services.database import db

SANDBOX_TLDS = ("test", "example", "invalid", "localhost")
TXT_PREFIX = "pretexta-verify="
RECHECK_AFTER = timedelta(hours=24)

_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def normalize_domain(value: str) -> str | None:
    domain = value.strip().lower().rstrip(".")
    return domain if _DOMAIN_RE.match(domain) else None


def is_sandbox(domain: str) -> bool:
    return domain.rsplit(".", 1)[-1] in SANDBOX_TLDS


def new_token() -> str:
    return secrets.token_urlsafe(24)


def email_domain(address: str) -> str | None:
    if address.count("@") != 1:
        return None
    local, domain = address.rsplit("@", 1)
    return normalize_domain(domain) if local else None


async def txt_record_present(domain: str, token: str) -> bool:
    try:
        answer = await dns.asyncresolver.resolve(domain, "TXT", lifetime=5)
    except (dns.exception.DNSException, OSError):
        return False
    expected = f"{TXT_PREFIX}{token}"
    for record in answer:
        if b"".join(record.strings).decode("utf-8", "replace") == expected:
            return True
    return False


async def check(domain_doc: dict) -> bool:
    """Re-verify a domain document and persist the result."""
    now = datetime.now(UTC).isoformat()
    ok = domain_doc.get("sandbox") or await txt_record_present(
        domain_doc["domain"], domain_doc["token"]
    )
    await db.verified_domains.update_one(
        {"id": domain_doc["id"]},
        {"$set": {"verified_at": now if ok else None, "last_checked_at": now}},
    )
    return bool(ok)


async def verified_domains_for(organization_id: str | None, recheck: bool = False) -> set[str]:
    """Domains currently verified for an organization. With `recheck`, stale DNS proofs are refreshed."""
    verified = set()
    async for doc in db.verified_domains.find({"organization_id": organization_id}, {"_id": 0}):
        if recheck and not doc.get("sandbox"):
            last = doc.get("last_checked_at")
            stale = not last or datetime.fromisoformat(last) < datetime.now(UTC) - RECHECK_AFTER
            if stale and not await check(doc):
                continue
        if doc.get("verified_at"):
            verified.add(doc["domain"])
    return verified
