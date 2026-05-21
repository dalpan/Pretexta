from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import Simulation, SimulationEvent, User
from services.auth import get_current_user
from services.database import db
from services.simulation import (
    create_simulation,
    delete_simulation,
    get_simulation,
    list_simulations,
    update_simulation,
)

router = APIRouter(prefix="/simulations", tags=["simulations"])


@router.post("")
async def create_simulation_route(
    simulation: Simulation, current_user: User = Depends(get_current_user)
):
    doc = simulation.model_dump()
    # Serialize datetimes before handing to service
    doc["started_at"] = doc["started_at"].isoformat() if doc.get("started_at") else None
    if doc.get("completed_at"):
        doc["completed_at"] = doc["completed_at"].isoformat()
    return await create_simulation(doc, current_user.id)


@router.get("")
async def list_simulations_route(current_user: User = Depends(get_current_user)):
    return await list_simulations(current_user.id)


@router.get("/{simulation_id}")
async def get_simulation_route(
    simulation_id: str, current_user: User = Depends(get_current_user)
):
    return await get_simulation(simulation_id, current_user.id)


@router.put("/{simulation_id}")
async def update_simulation_route(
    simulation_id: str,
    updates: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    return await update_simulation(simulation_id, updates, current_user.id)


@router.delete("/{simulation_id}")
async def delete_simulation_route(
    simulation_id: str, current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete mission logs")
    return await delete_simulation(simulation_id, current_user.id)


@router.get("/{simulation_id}/events")
async def get_simulation_events(
    simulation_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=200, le=1000),
):
    """
    Return the typed event log for a simulation.
    Used for replay and detailed analytics.
    Falls back to extracting events from the simulation document if
    the typed event log is not yet populated.
    """
    sim = await get_simulation(simulation_id, current_user.id)

    # Try dedicated event collection first (future state)
    typed_events = await db.simulation_events.find(
        {"simulation_id": simulation_id}, {"_id": 0}
    ).sort("sequence", 1).to_list(limit)

    if typed_events:
        return {"simulation_id": simulation_id, "events": typed_events, "source": "typed"}

    # Fall back to events embedded in the simulation document
    # These are legacy untyped events — still useful for display
    embedded_events = sim.get("events", []) if isinstance(sim, dict) else []
    return {
        "simulation_id": simulation_id,
        "events": embedded_events[:limit],
        "source": "embedded",
        "note": "Legacy event format. Typed events available for new simulations.",
    }


@router.post("/{simulation_id}/events")
async def append_simulation_event(
    simulation_id: str,
    event: SimulationEvent,
    current_user: User = Depends(get_current_user),
):
    """
    Append a typed event to a simulation's event log.
    Used by the simulation runtime to record interactions.
    """
    # Verify ownership
    await get_simulation(simulation_id, current_user.id)

    # Get current sequence number
    last_event = await db.simulation_events.find_one(
        {"simulation_id": simulation_id},
        {"sequence": 1},
        sort=[("sequence", -1)],
    )
    next_sequence = (last_event["sequence"] + 1) if last_event else 0

    doc = event.model_dump()
    doc["simulation_id"] = simulation_id
    doc["sequence"] = next_sequence

    await db.simulation_events.insert_one(doc)

    return {"id": event.id, "sequence": next_sequence}
