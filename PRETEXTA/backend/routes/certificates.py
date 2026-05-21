from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/certificates", tags=["certificates"])


@router.get("/{simulation_id}")
async def get_certificate_data(simulation_id: str, current_user: User = Depends(get_current_user)):
    """Generate certificate data for a completed simulation."""
    sim = await db.simulations.find_one({"id": simulation_id, "status": "completed"}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Completed simulation not found")

    score = sim.get("score", 0) or 0
    if score < 70:
        raise HTTPException(status_code=400, detail="Certificate requires a minimum score of 70%")

    # Determine certification level
    if score >= 95:
        cert_level = "Platinum"
    elif score >= 85:
        cert_level = "Gold"
    elif score >= 70:
        cert_level = "Silver"
    else:
        cert_level = "Bronze"

    certificate = {
        "certificate_id": f"CERT-{simulation_id[:8].upper()}",
        "recipient": {
            "name": current_user.display_name or current_user.username,
            "username": current_user.username,
        },
        "simulation": {
            "title": sim.get("title", "Social Engineering Awareness"),
            "type": sim.get("simulation_type", "simulation"),
            "difficulty": sim.get("difficulty", "medium"),
            "score": score,
        },
        "certification": {
            "level": cert_level,
            "title": "Social Engineering Awareness",
            "description": (
                f"Has demonstrated {cert_level.lower()}-level "
                f"proficiency in identifying and defending "
                f"against social engineering attacks."
            ),
        },
        "issued_at": datetime.now(UTC).isoformat(),
        "issuer": "Pretexta - Social Engineering Simulation Lab",
        "verification_url": f"/verify/{simulation_id[:8].upper()}",
    }

    return certificate


@router.get("/user/all")
async def get_user_certificates(current_user: User = Depends(get_current_user)):
    """Get all certificates for the current user."""
    sims = await db.simulations.find(
        {
            "user_id": current_user.id,
            "status": "completed",
            "score": {"$gte": 70},
        },
        {"_id": 0},
    ).to_list(100)

    certificates = []
    for sim in sims:
        score = sim.get("score", 0) or 0
        if score >= 95:
            level = "Platinum"
        elif score >= 85:
            level = "Gold"
        elif score >= 70:
            level = "Silver"
        else:
            continue

        certificates.append(
            {
                "certificate_id": f"CERT-{sim['id'][:8].upper()}",
                "simulation_id": sim["id"],
                "title": sim.get("title", "Social Engineering Awareness"),
                "score": score,
                "level": level,
                "completed_at": sim.get("completed_at", sim.get("started_at")),
            }
        )

    return certificates
