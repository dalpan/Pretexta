"""
Glossary API

Admin-managed glossary of social engineering and cybersecurity terms.
Readable by all authenticated users, writable by admin/trainer only.
"""

from datetime import UTC, datetime
from typing import Any

import uuid as uuid_lib
from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/glossary", tags=["glossary"])


def _make_entry(data: dict[str, Any], user: User) -> dict[str, Any]:
    return {
        "id": str(uuid_lib.uuid4()),
        "term": data["term"].strip(),
        "definition": data["definition"].strip(),
        "category": data.get("category", "general"),
        "cialdini_principle": data.get("cialdini_principle"),
        "example": data.get("example", "").strip(),
        "related_terms": data.get("related_terms", []),
        "tags": data.get("tags", []),
        "created_by": user.id,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


@router.get("")
async def list_terms(
    search: str | None = Query(None),
    category: str | None = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List all glossary terms, optionally filtered."""
    query: dict[str, Any] = {}
    if search:
        query["$or"] = [
            {"term": {"$regex": search, "$options": "i"}},
            {"definition": {"$regex": search, "$options": "i"}},
        ]
    if category and category != "all":
        query["category"] = category

    terms = await db.glossary.find(query, {"_id": 0}).sort("term", 1).to_list(500)
    return terms


@router.post("")
async def create_term(
    data: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Create a new glossary term (admin/trainer only)."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Admin or trainer required")
    if not data.get("term") or not data.get("definition"):
        raise HTTPException(status_code=400, detail="term and definition are required")

    # Check for duplicate
    existing = await db.glossary.find_one(
        {"term": {"$regex": f"^{data['term'].strip()}$", "$options": "i"}}
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Term '{data['term']}' already exists")

    entry = _make_entry(data, current_user)
    await db.glossary.insert_one(entry)
    return entry


@router.put("/{term_id}")
async def update_term(
    term_id: str,
    data: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Update a glossary term (admin/trainer only)."""
    if current_user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Admin or trainer required")

    existing = await db.glossary.find_one({"id": term_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Term not found")

    update_data = {
        k: v for k, v in data.items()
        if k in ("term", "definition", "category", "cialdini_principle", "example", "related_terms", "tags")
    }
    update_data["updated_at"] = datetime.now(UTC).isoformat()

    await db.glossary.update_one({"id": term_id}, {"$set": update_data})
    return {**existing, **update_data, "_id": None}


@router.delete("/{term_id}")
async def delete_term(
    term_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a glossary term (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    result = await db.glossary.delete_one({"id": term_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Term not found")
    return {"message": "Term deleted"}


@router.get("/categories")
async def list_categories(current_user: User = Depends(get_current_user)):
    """Get all unique categories in the glossary."""
    cats = await db.glossary.distinct("category")
    return sorted([c for c in cats if c])
