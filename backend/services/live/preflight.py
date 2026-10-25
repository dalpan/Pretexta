"""
Pre-flight checks for live campaigns.

`run_preflight` returns findings; any finding with level "error" blocks
submission, approval and launch. Each finding names the guardrail it enforces.
"""

import html
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from models.schemas import CIALDINI_PRINCIPLES, LIVE_OBJECTIVES
from services.database import db
from services.live.domains import email_domain, verified_domains_for

MAX_WINDOW = timedelta(days=30)

# G9: themes that exploit fear, grief or livelihood. English and Indonesian.
BLOCKED_THEMES = {
    "pay and bonuses": [
        "bonus",
        "salary",
        "payroll",
        "pay rise",
        "gaji",
        "thr",
        "tunjangan",
        "kenaikan gaji",
        "insentif",
    ],
    "layoffs": [
        "layoff",
        "layoffs",
        "laid off",
        "redundancy",
        "termination",
        "terminated",
        "phk",
        "pemutusan hubungan kerja",
        "dirumahkan",
        "pemecatan",
    ],
    "health": [
        "covid",
        "vaccine",
        "vaccination",
        "pandemic",
        "diagnosis",
        "medical results",
        "hospital",
        "vaksin",
        "rumah sakit",
        "hasil lab",
        "pandemi",
    ],
    "family emergencies": [
        "funeral",
        "passed away",
        "accident",
        "emergency contact",
        "meninggal",
        "kecelakaan",
        "duka cita",
        "berduka",
    ],
    "disasters": ["earthquake", "tsunami", "flood relief", "gempa", "banjir", "bencana"],
    "legal threats": [
        "arrest",
        "warrant",
        "lawsuit",
        "subpoena",
        "police report",
        "ditangkap",
        "surat panggilan",
        "gugatan",
        "laporan polisi",
    ],
}

# G10: government agencies and third-party brands. Overridable with a written reason.
GOVERNMENT_PATTERNS = {
    "government domain": r"\.(go\.id|gov(\.[a-z]{2})?|mil|gob\.[a-z]{2})\b",
    "DJP / pajak": r"\b(djp|pajak)\b",
    "BPJS": r"\bbpjs\b",
    "POLRI": r"\bpolri\b",
    "KPK": r"\bkpk\b",
    "Absher": r"\babsher\b",
    "IRS": r"\birs\b",
    "HMRC": r"\bhmrc\b",
}
# Only names that are unambiguous in an internal pretext ("zoom meeting" or
# "grab a coffee" must not trip the check).
BRAND_KEYWORDS = [
    "paypal",
    "microsoft",
    "office 365",
    "google",
    "gmail",
    "icloud",
    "amazon",
    "netflix",
    "dhl",
    "fedex",
    "linkedin",
    "facebook",
    "instagram",
    "whatsapp",
    "docusign",
    "dropbox",
    "bca",
    "bri",
    "mandiri",
    "bni",
    "tokopedia",
    "shopee",
    "gojek",
    "al rajhi",
]


def _finding(rule: str, level: str, message: str) -> dict[str, str]:
    return {"rule": rule, "level": level, "message": message}


def _normalize(text: str) -> tuple[str, str]:
    """Two lowercased views of the text with HTML entities decoded.

    `spaced` turns tags into spaces so word boundaries survive; `tight` drops
    them so intra-word splitting (``PayP<b></b>al``) cannot hide a keyword.
    A phrase blocks if it matches in either view.
    """
    decoded = html.unescape(text)
    spaced = re.sub(r"<[^>]+>", " ", decoded).lower()
    tight = re.sub(r"<[^>]+>", "", decoded).lower()
    return spaced, tight


def _matches(views: tuple[str, str], phrase: str) -> bool:
    pattern = rf"\b{re.escape(phrase)}\b"
    return any(re.search(pattern, view) for view in views)


def _covered(domain: str, verified: set[str]) -> bool:
    """A verified parent domain also covers its subdomains."""
    return any(domain == v or domain.endswith("." + v) for v in verified)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def check_content(campaign: dict[str, Any]) -> list[dict[str, str]]:
    findings = []
    views = _normalize(f"{campaign['subject']} {campaign['body_html']} {campaign['sender_name']}")

    for theme, phrases in BLOCKED_THEMES.items():
        hits = [p for p in phrases if _matches(views, p)]
        if hits:
            findings.append(
                _finding("G9", "error", f"Blocked theme '{theme}': {', '.join(sorted(hits))}")
            )

    gov = [
        label
        for label, pattern in GOVERNMENT_PATTERNS.items()
        if any(re.search(pattern, view) for view in views)
    ]
    brands = [b for b in BRAND_KEYWORDS if _matches(views, b)]
    if gov or brands:
        named = ", ".join(sorted({*gov, *brands}))
        if campaign.get("brand_override_reason"):
            findings.append(
                _finding("G10", "warning", f"Real agency/brand referenced under override: {named}")
            )
        else:
            findings.append(
                _finding(
                    "G10",
                    "error",
                    "Content references a real government agency or third-party brand "
                    f"({named}). Use an internal or fictional pretext, or record written "
                    "authorization in brand_override_reason.",
                )
            )

    if campaign["objective"] == "click_link" and "{{.URL}}" not in campaign["body_html"]:
        findings.append(
            _finding("content", "error", "Objective click_link needs the {{.URL}} placeholder")
        )
    return findings


async def run_preflight(campaign: dict[str, Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    org_id = campaign.get("organization_id")

    if campaign["objective"] not in LIVE_OBJECTIVES:
        findings.append(_finding("G7", "error", f"Unknown objective '{campaign['objective']}'"))
    unknown = set(campaign["principles"]) - set(CIALDINI_PRINCIPLES)
    if unknown:
        findings.append(_finding("G7", "error", f"Unknown principles: {sorted(unknown)}"))

    starts, ends = _as_utc(campaign["starts_at"]), _as_utc(campaign["ends_at"])
    if ends <= starts:
        findings.append(_finding("G3", "error", "ends_at must be after starts_at"))
    elif ends - starts > MAX_WINDOW:
        findings.append(_finding("G3", "error", "Campaign window is longer than 30 days"))
    if ends <= datetime.now(UTC):
        findings.append(_finding("G3", "error", "Campaign window has already ended"))

    verified = await verified_domains_for(org_id, recheck=True)

    sender_domain = email_domain(campaign["sender_email"])
    if not sender_domain or not _covered(sender_domain, verified):
        findings.append(
            _finding("G1", "error", "Sender address must be on a domain this organization verified")
        )

    invalid, unverified = [], []
    for address in campaign["recipients"]:
        domain = email_domain(address)
        if not domain:
            invalid.append(address)
        elif not _covered(domain, verified):
            unverified.append(address)
    if invalid:
        findings.append(_finding("recipients", "error", f"{len(invalid)} invalid address(es)"))
    if unverified:
        findings.append(
            _finding(
                "G1",
                "error",
                f"{len(unverified)} recipient(s) outside verified domains, e.g. {unverified[0]}",
            )
        )

    excluded = await excluded_addresses(org_id)
    n_excluded = sum(1 for a in campaign["recipients"] if a.lower() in excluded)
    if n_excluded:
        findings.append(
            _finding("G11", "info", f"{n_excluded} excluded recipient(s) will be skipped")
        )
    if n_excluded == len(campaign["recipients"]):
        findings.append(_finding("G11", "error", "Every recipient is on the exclusion list"))

    # Replies are matched to a campaign by the recipient's address, so a person
    # can be in only one active campaign at a time.
    overlapping = await db.live_campaigns.find_one(
        {
            "id": {"$ne": campaign.get("id")},
            "status": {"$in": ["pending_approval", "approved", "running"]},
            "recipients": {"$in": [a.lower() for a in campaign["recipients"]]},
        },
        {"_id": 0, "name": 1},
    )
    if overlapping:
        findings.append(
            _finding(
                "recipients",
                "error",
                f"Some recipients are already in active campaign '{overlapping['name']}'",
            )
        )

    findings.extend(check_content(campaign))
    return findings


async def excluded_addresses(organization_id: str | None) -> set[str]:
    docs = await db.live_exclusions.find({"organization_id": organization_id}, {"_id": 0}).to_list(
        10000
    )
    return {d["email"] for d in docs}


def has_errors(findings: list[dict[str, str]]) -> bool:
    return any(f["level"] == "error" for f in findings)
