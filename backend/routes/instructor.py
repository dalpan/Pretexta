"""
Trainer API

Endpoints khusus untuk trainer (admin/trainer role).
Mengelola peserta, kelompok pelatihan, penugasan, dan laporan.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import (
    Assignment,
    AssignmentResult,
    TrainingGroup,
    User,
)
from services.auth import get_current_user
from services.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/instructor", tags=["instructor"])


def _require_trainer(user: User):
    """Verify user has trainer or admin role."""
    if user.role not in ("admin", "trainer"):
        raise HTTPException(status_code=403, detail="Trainer or admin role required")


# ── Training Groups ───────────────────────────────────────────────


@router.post("/groups")
async def create_group(
    data: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Buat kelompok pelatihan baru."""
    _require_trainer(current_user)
    group = TrainingGroup(
        name=data["name"],
        description=data.get("description"),
        instructor_id=current_user.id,
        organization_id=current_user.organization_id,
        tags=data.get("tags", []),
    )
    await db.training_groups.insert_one(group.model_dump())
    return group.model_dump()


@router.get("/groups")
async def list_groups(current_user: User = Depends(get_current_user)):
    """Daftar semua kelompok yang dibuat oleh instruktur ini."""
    _require_trainer(current_user)
    groups = await db.training_groups.find(
        {"instructor_id": current_user.id}, {"_id": 0}
    ).to_list(100)
    return groups


@router.get("/groups/{group_id}")
async def get_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Detail satu kelompok beserta data anggota."""
    _require_trainer(current_user)
    group = await db.training_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Fetch trainee profiles
    trainee_ids = group.get("trainee_ids", [])
    trainees = []
    if trainee_ids:
        trainees = await db.users.find(
            {"id": {"$in": trainee_ids}},
            {"_id": 0, "password_hash": 0},
        ).to_list(len(trainee_ids))

    return {**group, "trainees": trainees}


@router.post("/groups/{group_id}/trainees")
async def add_trainee_to_group(
    group_id: str,
    data: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Tambahkan peserta ke kelompok. data: {trainee_id atau username}"""
    _require_trainer(current_user)

    group = await db.training_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group["instructor_id"] != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your group")

    # Find trainee by id or username
    trainee_query = {}
    if "trainee_id" in data:
        trainee_query = {"id": data["trainee_id"]}
    elif "username" in data:
        trainee_query = {"username": data["username"]}
    else:
        raise HTTPException(status_code=400, detail="Provide trainee_id or username")

    trainee = await db.users.find_one(trainee_query, {"_id": 0, "password_hash": 0})
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee not found")

    await db.training_groups.update_one(
        {"id": group_id},
        {"$addToSet": {"trainee_ids": trainee["id"]}},
    )
    return {"message": f"Added {trainee['username']} to group", "trainee": trainee}


@router.delete("/groups/{group_id}/trainees/{trainee_id}")
async def remove_trainee_from_group(
    group_id: str,
    trainee_id: str,
    current_user: User = Depends(get_current_user),
):
    """Keluarkan peserta dari kelompok."""
    _require_trainer(current_user)
    group = await db.training_groups.find_one({"id": group_id}, {"_id": 0})
    if not group or group["instructor_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.training_groups.update_one(
        {"id": group_id}, {"$pull": {"trainee_ids": trainee_id}}
    )
    return {"message": "Trainee removed from group"}


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Hapus kelompok pelatihan."""
    _require_trainer(current_user)
    group = await db.training_groups.find_one({"id": group_id})
    if not group or group["instructor_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.training_groups.delete_one({"id": group_id})
    return {"message": "Group deleted"}


# ── Assignments ───────────────────────────────────────────────────


@router.post("/assignments")
async def create_assignment(
    data: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """
    Buat penugasan baru ke seorang peserta atau seluruh kelompok.
    Jika group_id diberikan, assignment akan di-expand ke setiap anggota kelompok.
    """
    _require_trainer(current_user)

    group_id = data.get("group_id")
    trainee_id = data.get("trainee_id")

    if not group_id and not trainee_id:
        raise HTTPException(status_code=400, detail="Provide group_id or trainee_id")

    assignments_created = []

    async def _resolve_user_id(raw_id: str) -> str:
        """Resolve trainee_id to an actual user UUID.
        Accepts both UUID and username strings for usability.
        """
        # Try by UUID (id field) first
        user = await db.users.find_one({"id": raw_id}, {"_id": 0, "id": 1})
        if user:
            return user["id"]
        # Fallback: try by username
        user = await db.users.find_one({"username": raw_id}, {"_id": 0, "id": 1})
        if user:
            return user["id"]
        raise HTTPException(status_code=404, detail=f"User '{raw_id}' not found")

    if group_id:
        group = await db.training_groups.find_one({"id": group_id}, {"_id": 0})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        trainee_ids = group.get("trainee_ids", [])
        if not trainee_ids:
            raise HTTPException(status_code=400, detail="Group has no members yet. Add users to the group first.")
        for tid in trainee_ids:
            a = Assignment(
                instructor_id=current_user.id,
                group_id=group_id,
                trainee_id=tid,  # Group members already stored as UUIDs
                content_type=data["content_type"],
                content_id=data["content_id"],
                title=data["title"],
                instructions=data.get("instructions"),
                due_date=data.get("due_date"),
                passing_score=float(data.get("passing_score", 70)),
                max_attempts=int(data.get("max_attempts", 3)),
            )
            await db.assignments.insert_one(a.model_dump())
            assignments_created.append(a.id)
    else:
        # Resolve username or UUID to actual user UUID
        resolved_id = await _resolve_user_id(trainee_id)
        a = Assignment(
            instructor_id=current_user.id,
            trainee_id=resolved_id,
            content_type=data["content_type"],
            content_id=data["content_id"],
            title=data["title"],
            instructions=data.get("instructions"),
            due_date=data.get("due_date"),
            passing_score=float(data.get("passing_score", 70)),
            max_attempts=int(data.get("max_attempts", 3)),
        )
        await db.assignments.insert_one(a.model_dump())
        assignments_created.append(a.id)

    return {
        "message": f"Created {len(assignments_created)} assignment(s)",
        "ids": assignments_created,
    }


@router.get("/assignments")
async def list_my_assignments(
    group_id: str | None = Query(None),
    trainee_id: str | None = Query(None),
    status: str | None = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Daftar semua penugasan yang dibuat oleh instruktur ini."""
    _require_trainer(current_user)
    query: dict[str, Any] = {"instructor_id": current_user.id}
    if group_id:
        query["group_id"] = group_id
    if trainee_id:
        query["trainee_id"] = trainee_id
    if status:
        query["status"] = status

    assignments = await db.assignments.find(query, {"_id": 0}).to_list(500)
    return assignments


@router.get("/assignments/{assignment_id}/results")
async def get_assignment_results(
    assignment_id: str,
    current_user: User = Depends(get_current_user),
):
    """Hasil semua peserta untuk satu penugasan."""
    _require_trainer(current_user)
    results = await db.assignment_results.find(
        {"assignment_id": assignment_id}, {"_id": 0}
    ).to_list(200)

    # Enrich with simulation scores
    enriched = []
    for r in results:
        if r.get("simulation_id"):
            sim = await db.simulations.find_one(
                {"id": r["simulation_id"]}, {"_id": 0, "events": 0}
            )
            r["simulation"] = sim
        enriched.append(r)

    return enriched


@router.put("/assignments/{assignment_id}/feedback")
async def add_instructor_feedback(
    assignment_id: str,
    data: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Instruktur memberikan feedback tertulis untuk hasil seorang peserta."""
    _require_trainer(current_user)
    result_id = data.get("result_id")
    feedback = data.get("feedback", "")
    if not result_id:
        raise HTTPException(status_code=400, detail="result_id required")

    await db.assignment_results.update_one(
        {"id": result_id},
        {"$set": {"instructor_feedback": feedback}},
    )
    return {"message": "Feedback saved"}


@router.delete("/assignments/{assignment_id}")
async def cancel_assignment(
    assignment_id: str,
    current_user: User = Depends(get_current_user),
):
    """Batalkan/hapus sebuah penugasan."""
    _require_trainer(current_user)
    await db.assignments.update_one(
        {"id": assignment_id, "instructor_id": current_user.id},
        {"$set": {"status": "cancelled"}},
    )
    return {"message": "Assignment cancelled"}


# ── Cohort Analytics ──────────────────────────────────────────────


@router.get("/cohort/{group_id}/analytics")
async def cohort_analytics(
    group_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Analitik kelompok: skor rata-rata, risk vector per peserta,
    completion rate, dan siapa yang paling butuh perhatian.
    """
    _require_trainer(current_user)

    group = await db.training_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    trainee_ids = group.get("trainee_ids", [])
    if not trainee_ids:
        return {"group": group, "stats": [], "summary": {}}

    # Fetch completed simulations for all trainees
    sims = await db.simulations.find(
        {"user_id": {"$in": trainee_ids}, "status": "completed"},
        {"_id": 0, "events": 0},
    ).to_list(1000)

    # Fetch risk profiles
    risk_profiles = await db.risk_profiles.find(
        {"user_id": {"$in": trainee_ids}}, {"_id": 0}
    ).to_list(len(trainee_ids))
    risk_map = {p["user_id"]: p for p in risk_profiles}

    # Per-trainee stats
    per_trainee: dict[str, dict] = {}
    for sim in sims:
        uid = sim.get("user_id")
        if not uid:
            continue
        if uid not in per_trainee:
            per_trainee[uid] = {"scores": [], "simulations": 0, "types": {}}
        if sim.get("score") is not None:
            per_trainee[uid]["scores"].append(sim["score"])
        per_trainee[uid]["simulations"] += 1
        stype = sim.get("simulation_type", "unknown")
        per_trainee[uid]["types"][stype] = per_trainee[uid]["types"].get(stype, 0) + 1

    # Fetch trainee names
    trainees = await db.users.find(
        {"id": {"$in": trainee_ids}},
        {"_id": 0, "password_hash": 0},
    ).to_list(len(trainee_ids))
    trainee_map = {t["id"]: t for t in trainees}

    stats = []
    for tid in trainee_ids:
        t = trainee_map.get(tid, {})
        ts = per_trainee.get(tid, {"scores": [], "simulations": 0, "types": {}})
        rp = risk_map.get(tid, {})
        avg = round(sum(ts["scores"]) / len(ts["scores"]), 1) if ts["scores"] else None
        stats.append({
            "user_id": tid,
            "username": t.get("username", "unknown"),
            "display_name": t.get("display_name"),
            "level": t.get("level", 1),
            "xp": t.get("xp", 0),
            "simulations_completed": ts["simulations"],
            "avg_score": avg,
            "risk_vector": rp.get("current_vector"),
            "high_risk_dimensions": rp.get("high_risk_dimensions", []),
            "needs_attention": avg is not None and avg < 60,
        })

    # Sort: needs attention first, then by avg score ascending
    stats.sort(key=lambda x: (not x["needs_attention"], x["avg_score"] or 999))

    group_avg = None
    all_scores = [s["avg_score"] for s in stats if s["avg_score"] is not None]
    if all_scores:
        group_avg = round(sum(all_scores) / len(all_scores), 1)

    return {
        "group": group,
        "stats": stats,
        "summary": {
            "total_trainees": len(trainee_ids),
            "trainees_with_data": len([s for s in stats if s["simulations_completed"] > 0]),
            "group_avg_score": group_avg,
            "needs_attention_count": len([s for s in stats if s["needs_attention"]]),
        },
    }


@router.get("/trainee/{trainee_id}/profile")
async def get_trainee_profile(
    trainee_id: str,
    current_user: User = Depends(get_current_user),
):
    """Profile lengkap seorang peserta untuk instruktur."""
    _require_trainer(current_user)

    trainee = await db.users.find_one(
        {"id": trainee_id}, {"_id": 0, "password_hash": 0}
    )
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee not found")

    sims = await db.simulations.find(
        {"user_id": trainee_id, "status": "completed"},
        {"_id": 0, "events": 0},
    ).sort("completed_at", -1).to_list(50)

    risk_profile = await db.risk_profiles.find_one({"user_id": trainee_id}, {"_id": 0})

    assignments = await db.assignments.find(
        {"trainee_id": trainee_id}, {"_id": 0}
    ).to_list(50)

    results = await db.assignment_results.find(
        {"trainee_id": trainee_id}, {"_id": 0}
    ).to_list(50)

    return {
        "trainee": trainee,
        "simulations": sims,
        "risk_profile": risk_profile,
        "assignments": assignments,
        "results": results,
        "summary": {
            "total_simulations": len(sims),
            "avg_score": round(
                sum(s["score"] for s in sims if s.get("score") is not None) / len(sims), 1
            ) if sims else None,
            "total_assignments": len(assignments),
            "completed_assignments": len([r for r in results if r.get("passed")]),
        },
    }


@router.get("/user-history")
async def get_user_history(
    user_id: str = Query(...),
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_user),
):
    """
    Get simulation history for any user (admin/trainer only).
    Returns simulations sorted by most recent first.
    """
    _require_trainer(current_user)

    # Verify target user exists
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    simulations = await db.simulations.find(
        {"user_id": user_id},
        {"_id": 0, "events": 0},
    ).sort("created_at", -1).to_list(limit)

    risk_profile = await db.risk_profiles.find_one({"user_id": user_id}, {"_id": 0})
    assignments = await db.assignments.find(
        {"trainee_id": user_id}, {"_id": 0}
    ).to_list(100)

    completed = [s for s in simulations if s.get("status") == "completed"]
    avg_score = round(
        sum(s["score"] for s in completed if s.get("score") is not None) / len(completed), 1
    ) if completed else None

    return {
        "user": target,
        "simulations": simulations,
        "risk_profile": risk_profile,
        "summary": {
            "total_simulations": len(simulations),
            "completed": len(completed),
            "avg_score": avg_score,
            "total_assignments": len(assignments),
        },
    }


@router.get("/trainees")
async def list_all_trainees(
    org_id: str | None = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Daftar semua pengguna dengan role user yang bisa ditambahkan ke kelompok.
    """
    _require_trainer(current_user)
    query: dict[str, Any] = {"role": "user", "is_active": True}
    if org_id:
        query["organization_id"] = org_id

    trainees = await db.users.find(
        query, {"_id": 0, "password_hash": 0}
    ).to_list(500)
    return trainees


@router.get("/users/all")
async def list_all_users(
    role: str | None = Query(None),
    search: str | None = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Daftar semua pengguna untuk admin/trainer.
    Admin: lihat semua role.
    Trainer: hanya bisa lihat role=user.
    """
    _require_trainer(current_user)

    query: dict[str, Any] = {"is_active": True}

    # Trainers can only see regular users, admins can see all
    if current_user.role == "trainer":
        query["role"] = "user"
    elif role:
        query["role"] = role

    if search:
        query["$or"] = [
            {"username": {"$regex": search, "$options": "i"}},
            {"display_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]

    users = await db.users.find(
        query, {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(500)

    return users
