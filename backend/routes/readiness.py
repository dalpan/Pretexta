from fastapi import APIRouter, Depends

from models.schemas import User
from services import readiness
from services.auth import require_trainer

router = APIRouter(prefix="/readiness", tags=["readiness"])


@router.get("")
async def get_readiness(user: User = Depends(require_trainer)):
    """Cohort-level readiness overview: index, report-rate trend, remediation loop,
    weakest principles and attack-surface posture. Admins see every organization;
    trainers only their own."""
    scope = {} if user.role == "admin" else {"organization_id": user.organization_id}
    return await readiness.overview(
        user_scope=scope,
        campaign_scope=scope,
        # Same workspace the Attack Surface Map uses for this user.
        org_id=user.organization_id or f"org-{user.id}",
    )
