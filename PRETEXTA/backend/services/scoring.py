from typing import Any


def calculate_susceptibility_score(simulation: dict[str, Any]) -> dict[str, Any]:
    """Calculate susceptibility score 0-100. Lower = more susceptible."""
    events = simulation.get("events", [])

    if not events:
        return {"total": 0, "breakdown": {}}

    compliance_count = sum(1 for e in events if e.get("action") == "complied")
    total_events = len(events)

    base_score = max(0, 100 - (compliance_count / total_events * 100)) if total_events > 0 else 50

    return {
        "total": round(base_score, 2),
        "breakdown": {
            "compliance_rate": round(
                (compliance_count / total_events * 100) if total_events > 0 else 0, 2
            ),
            "total_events": total_events,
        },
    }
