"""
Secret detector (guardrail G6).

Pretexta must never store a real credential a recipient types into a reply.
`scrub` redacts anything that looks like a one-time code, password, PIN or
payment card *before* the text is stored, and reports what it found so the
conversation can stop and switch to a teachable moment.

The bias is deliberately toward over-redaction: ending a simulation early is
harmless; persisting a real secret is not.
"""

import re

REDACTION = "[REDACTED]"

# Words that introduce a secret, in English and Indonesian.
_CODE_WORDS = r"(?:otp|code|codes|kode|verification|verifikasi|passcode|pin|token)"
# "pass" is omitted on purpose: it matches passport, passenger, passed.
_PW_WORDS = r"(?:password|passwd|passphrase|pwd|sandi|kata\s*sandi|katasandi)"

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # A value only counts as disclosed when it is explicitly assigned, so that
    # "I won't share my password" (a correct refusal) is not flagged.
    # "password: hunter2", "my password is hunter2", "kata sandi saya hunter2"
    (
        "password",
        re.compile(
            rf"{_PW_WORDS}\s*(?:[:=]|\bis\b|\badalah\b|\bsaya\b|\bku\b)\s*(?P<secret>\S{{3,}})",
            re.IGNORECASE,
        ),
    ),
    # "the code is 123456", "kode otp 123456", "pin: 1234"
    (
        "otp",
        re.compile(
            rf"{_CODE_WORDS}\b(?:\s+\w+){{0,3}}?\s*[:=]?\s*(?P<secret>\d[\d\s-]{{2,10}}\d)",
            re.IGNORECASE,
        ),
    ),
]

# Standalone 6-8 digit code with no other context (common OTP paste).
# 4-5 digits are left to the contextual pass above, so years like 2026 are safe.
_BARE_CODE = re.compile(r"(?<!\d)(?P<secret>\d{6,8})(?!\d)")

# Payment card: 13-19 digits (optionally grouped) that pass the Luhn check.
_CARD = re.compile(r"(?<![\d-])(?P<secret>(?:\d[ -]?){13,19})(?![\d-])")


def _luhn_ok(digits: str) -> bool:
    nums = [int(c) for c in digits if c.isdigit()]
    if not 13 <= len(nums) <= 19:
        return False
    total, parity = 0, len(nums) % 2
    for i, n in enumerate(nums):
        if i % 2 == parity:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def scrub(text: str) -> tuple[str, list[str]]:
    """Return (redacted_text, sorted list of secret types found)."""
    if not text:
        return text, []
    found: set[str] = set()
    redacted = text

    def _redact(match: re.Match[str], label: str) -> str:
        found.add(label)
        whole = match.group(0)
        secret = match.group("secret")
        # Keep the lead-in words, redact only the secret token.
        return whole.replace(secret, REDACTION)

    for label, pattern in _PATTERNS:
        redacted = pattern.sub(lambda m, label=label: _redact(m, label), redacted)

    def _redact_card(match: re.Match[str]) -> str:
        secret = match.group("secret")
        if _luhn_ok(secret):
            found.add("card")
            return REDACTION
        return secret

    redacted = _CARD.sub(_redact_card, redacted)

    # Any remaining bare 4-8 digit run (after the contextual passes above).
    def _redact_bare(match: re.Match[str]) -> str:
        found.add("code")
        return REDACTION

    redacted = _BARE_CODE.sub(_redact_bare, redacted)

    return redacted, sorted(found)


def contains_secret(text: str) -> bool:
    return bool(scrub(text)[1])
