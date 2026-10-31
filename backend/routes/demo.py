from fastapi import APIRouter, Depends

from models.schemas import User
from services import audit, demo
from services.auth import require_admin

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("")
async def demo_status(user: User = Depends(require_admin)):
    return await demo.status()


@router.post("")
async def load_demo(user: User = Depends(require_admin)):
    """Load (or reload) the fictional demo organization. Admin only."""
    result = await demo.seed(user.id, user.organization_id or f"org-{user.id}")
    await audit.record(user.id, "demo.load", None, {"people": result["people"]})
    return result


@router.delete("")
async def clear_demo(user: User = Depends(require_admin)):
    """Remove all demo records; real data is never touched."""
    result = await demo.clear()
    await audit.record(user.id, "demo.clear", None, result)
    return result
