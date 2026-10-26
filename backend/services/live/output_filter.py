"""
Output filter for persona replies (guardrail G8).

Every AI draft is checked before it can be queued for review or sent. A draft
that asks for something outside the campaign's single objective, threatens the
recipient, or impersonates a named real person is held and never auto-sent.

This is defence in depth behind the locked server-side prompt and human review
(G7); it catches a model that drifts off script.
"""

import re

# Out-of-scope solicitations: a persona may only pursue its one approved objective.
_OUT_OF_SCOPE = {
    "home address": r"\b(home address|alamat rumah|where do you live|alamat tinggal)\b",
    "family": r"\b(your (wife|husband|spouse|children|kids|family)|keluarga|istri|suami|anak)\b",
    "health": r"\b(medical|health condition|diagnosis|kesehatan|penyakit)\b",
    "personal banking": r"\b(bank balance|account balance|saldo|personal bank account)\b",
    "national id": r"\b(ssn|social security|passport number|ktp|nik|npwp pribadi)\b",
    "photo": r"\b(send (me )?(a )?(photo|picture|selfie)|foto diri|swafoto)\b",
}

# Coercion and threats.
_THREATS = {
    "job threat": r"\b(you('|)ll be fired|lose your job|dipecat|kehilangan pekerjaan|phk)\b",
    "legal threat": r"\b(we('|)ll (sue|prosecute)|legal action|police|lawsuit|tuntut|polisi|pidana)\b",
    "harm": r"\b(regret this|consequences for you|something will happen|menyesal|akan terjadi sesuatu)\b",
}


def review_draft(
    draft: str,
    objective: str,
    allowed_senders: list[str],
    turn: int,
    max_turns: int,
) -> list[str]:
    """Return a list of violation labels. Empty means the draft is clean."""
    violations: list[str] = []
    text = draft.lower()

    for label, pattern in _OUT_OF_SCOPE.items():
        if re.search(pattern, text):
            violations.append(f"out_of_scope:{label}")

    for label, pattern in _THREATS.items():
        if re.search(pattern, text):
            violations.append(f"threat:{label}")

    # A persona chasing a non-OTP objective should not be asking for codes.
    if objective != "agree_to_share_otp" and re.search(
        r"\b(otp|verification code|kode verifikasi|one[- ]time)\b", text
    ):
        violations.append("out_of_scope:asks_for_code")

    if turn > max_turns:
        violations.append("turn_budget_exceeded")

    # Impersonating a real person outside the approved sender identities.
    # Case-insensitive lead-in, but the name itself must be capitalized.
    allowed = {s.lower() for s in allowed_senders}
    for name in re.findall(
        r"(?i:\b(?:i am|this is|saya)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", draft
    ):
        if name.lower() not in allowed and not any(name.lower() in s for s in allowed):
            violations.append(f"identity:{name}")

    return violations
