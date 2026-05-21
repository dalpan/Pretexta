"""
Risk Profile API

Exposes the user's multi-dimensional behavioral risk profile.
Also provides organization-level risk aggregation for admins/trainers.
"""

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User
from services.auth import get_current_user
from services.database import db
from services.risk_engine import get_or_create_risk_profile, get_org_risk_map

router = APIRouter(prefix="/risk-profile", tags=["risk"])


@router.get("/me")
async def get_my_risk_profile(current_user: User = Depends(get_current_user)):
    """
    Return the current user's risk profile.
    Creates a default profile if none exists yet.
    """
    profile = await get_or_create_risk_profile(current_user.id)
    return profile.model_dump()


@router.get("/org/{org_id}")
async def get_org_risk(org_id: str, current_user: User = Depends(get_current_user)):
    """
    Return aggregated risk data for an organization.
    Only accessible to the org owner or admins.
    """
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    is_owner = org.get("owner_id") == current_user.id
    is_admin = current_user.role == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized to view org risk data")

    return await get_org_risk_map(org_id)
