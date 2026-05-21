"""
Personas API

Serves the persona catalog from the backend.
Transitions persona data from frontend-only JS to a backend-managed catalog.

Current behavior: auto-seeds from static data on first access.
Future behavior: full CRUD for persona management by admins/instructors.
"""

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import User
from services.auth import get_current_user
from services.database import db
from services.persona_engine import get_persona_catalog

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("")
async def list_personas(
    difficulty: str | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """
    Return all available adversarial personas.
    Optionally filter by difficulty or category.
    """
    personas = await get_persona_catalog()

    if difficulty:
        personas = [p for p in personas if p.get("difficulty", "").lower() == difficulty.lower()]
    if category:
        personas = [p for p in personas if p.get("category", "").lower() == category.lower()]

    return personas


@router.get("/{persona_id}")
async def get_persona(persona_id: str, current_user: User = Depends(get_current_user)):
    """Return a single persona by ID."""
    personas = await get_persona_catalog()
    persona = next((p for p in personas if p["id"] == persona_id), None)
    if not persona:
        raise HTTPException(status_code=404, detail=f"Persona '{persona_id}' not found")
    return persona
