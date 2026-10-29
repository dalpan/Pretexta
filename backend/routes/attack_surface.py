"""
Human Attack Surface Map API (docs/roadmap.md #4).

Staff-only (admin/trainer): the map is a command view of organizational risk,
scoped to the caller's organization (G13). An attacker's-eye graph of people and
the trust paths that lead to the crown jewels, overlaid with real susceptibility
from live campaigns and lab exercises.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from models.schemas import ASSET_KINDS, TRUST_RELATIONSHIPS, OrgNode, TrustEdge, User
from services import attack_surface
from services.auth import require_trainer
from services.database import db

router = APIRouter(prefix="/attack-surface", tags=["attack-surface"])


def _org(user: User) -> str:
    """The org workspace this user's map lives in (admins without an org get their own)."""
    return user.organization_id or f"org-{user.id}"


# ---------------------------------------------------------------- read


@router.get("/graph")
async def get_graph(user: User = Depends(require_trainer)):
    """People + assets + trust edges, with computed susceptibility on each person."""
    return await attack_surface.build_graph(_org(user))


@router.get("/analysis")
async def get_analysis(user: User = Depends(require_trainer)):
    """Best attack path to each crown jewel, choke points, and readiness posture."""
    return await attack_surface.analyze(_org(user))


@router.get("/targets")
async def get_targets(user: User = Depends(require_trainer)):
    """Emailable people on the map, ranked most-susceptible first — to seed a
    campaign aimed at the human weak points."""
    return {"targets": await attack_surface.targets(_org(user))}


# ---------------------------------------------------------------- nodes


class NodeIn(BaseModel):
    name: str
    email: str | None = None
    role: str = ""
    department: str = ""
    hierarchy_level: int = 0
    user_id: str | None = None
    is_asset: bool = False
    asset_kind: str | None = None
    susceptibility: float | None = None


@router.post("/nodes", status_code=201)
async def create_node(body: NodeIn, user: User = Depends(require_trainer)):
    if body.is_asset and body.asset_kind not in ASSET_KINDS:
        raise HTTPException(422, f"asset_kind must be one of {ASSET_KINDS}")
    node = OrgNode(org_id=_org(user), **body.model_dump())
    if node.is_asset:
        node.susceptibility = None  # assets are goals, not phishable
    await db.org_nodes.insert_one(node.model_dump())
    return node.model_dump()


@router.patch("/nodes/{node_id}")
async def update_node(node_id: str, body: NodeIn, user: User = Depends(require_trainer)):
    existing = await db.org_nodes.find_one({"id": node_id, "org_id": _org(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Node not found")
    updates = body.model_dump(exclude_unset=True)
    if updates.get("is_asset"):
        updates["susceptibility"] = None
    await db.org_nodes.update_one({"id": node_id}, {"$set": updates})
    return {"updated": node_id}


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, user: User = Depends(require_trainer)):
    org = _org(user)
    res = await db.org_nodes.delete_one({"id": node_id, "org_id": org})
    if not res.deleted_count:
        raise HTTPException(404, "Node not found")
    # Drop any edges touching it so the graph stays consistent.
    await db.trust_edges.delete_many(
        {"org_id": org, "$or": [{"source_id": node_id}, {"target_id": node_id}]}
    )
    return {"deleted": node_id}


# ---------------------------------------------------------------- edges


class EdgeIn(BaseModel):
    source_id: str
    target_id: str
    relationship: str
    trust_weight: float = Field(0.5, ge=0.0, le=1.0)


@router.post("/edges", status_code=201)
async def create_edge(body: EdgeIn, user: User = Depends(require_trainer)):
    org = _org(user)
    if body.relationship not in TRUST_RELATIONSHIPS:
        raise HTTPException(422, f"relationship must be one of {TRUST_RELATIONSHIPS}")
    if body.source_id == body.target_id:
        raise HTTPException(422, "An edge cannot loop on one node")
    ids = {
        n["id"]
        async for n in db.org_nodes.find(
            {"org_id": org, "id": {"$in": [body.source_id, body.target_id]}}, {"_id": 0, "id": 1}
        )
    }
    if {body.source_id, body.target_id} - ids:
        raise HTTPException(404, "Both endpoints must be nodes in your organization")
    edge = TrustEdge(org_id=org, **body.model_dump())
    await db.trust_edges.insert_one(edge.model_dump())
    return edge.model_dump()


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, user: User = Depends(require_trainer)):
    res = await db.trust_edges.delete_one({"id": edge_id, "org_id": _org(user)})
    if not res.deleted_count:
        raise HTTPException(404, "Edge not found")
    return {"deleted": edge_id}


# ---------------------------------------------------------------- demo / reset


@router.post("/seed-demo")
async def seed_demo(user: User = Depends(require_trainer)):
    """Populate a realistic sample org so the map is demoable without live data."""
    return await attack_surface.seed_demo_org(_org(user))


@router.delete("/reset")
async def reset(user: User = Depends(require_trainer)):
    """Remove every node and edge for this org's map."""
    org = _org(user)
    n = (await db.org_nodes.delete_many({"org_id": org})).deleted_count
    e = (await db.trust_edges.delete_many({"org_id": org})).deleted_count
    return {"deleted_nodes": n, "deleted_edges": e}
