"""Cohort privacy rules (guardrail G13).

Individual results are visible only to the person and to staff (trainers and
admins). Anyone else gets aggregates, and only over a cohort large enough that
an average cannot be traced back to one person.
"""

MIN_COHORT = 5


def cohort_too_small(size: int) -> bool:
    return size < MIN_COHORT
