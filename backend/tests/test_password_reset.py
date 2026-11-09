"""Admin password reset and session revocation via token_version."""

from datetime import UTC, datetime, timedelta

import jwt

from services.auth import JWT_ALGORITHM, JWT_SECRET
from services.database import db
from tests.conftest import make_user

NEW = "Fresh-Pass-2026"


async def _login(api, username, password):
    return await api.post("/api/auth/login", json={"username": username, "password": password})


async def test_admin_resets_password_and_signs_out_sessions(api):
    _, admin = await make_user("admin")
    target, old_session = await make_user("user")
    assert (await api.get("/api/auth/me", headers=old_session)).status_code == 200

    r = await api.post(
        f"/api/auth/users/{target.id}/reset-password", json={"new_password": NEW}, headers=admin
    )
    assert r.status_code == 200, r.text

    r = await api.get("/api/auth/me", headers=old_session)
    assert r.status_code == 401 and "revoked" in r.json()["detail"]
    assert (await _login(api, target.username, "Password123")).status_code == 401

    r = await _login(api, target.username, NEW)
    assert r.status_code == 200
    assert r.json()["user"]["must_change_password"] is True
    me = await api.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"})
    assert me.status_code == 200 and me.json()["must_change_password"] is True

    entry = await db.audit_log.find_one({"action": "auth.password.reset", "target": target.id})
    assert entry and entry["details"] == {"username": target.username, "require_change": True}
    assert NEW not in str(entry)


async def test_reset_without_forced_change(api):
    _, admin = await make_user("admin")
    target, _ = await make_user("trainer")
    r = await api.post(
        f"/api/auth/users/{target.id}/reset-password",
        json={"new_password": NEW, "require_change": False},
        headers=admin,
    )
    assert r.status_code == 200
    assert (await _login(api, target.username, NEW)).json()["user"]["must_change_password"] is False


async def test_only_admin_can_reset(api):
    target, _ = await make_user("user")
    for role in ("user", "trainer"):
        _, h = await make_user(role)
        r = await api.post(
            f"/api/auth/users/{target.id}/reset-password", json={"new_password": NEW}, headers=h
        )
        assert r.status_code == 403, role


async def test_reset_refuses_admins_self_weak_and_unknown(api):
    me, admin = await make_user("admin")
    other_admin, _ = await make_user("admin")

    def reset(uid, pw=NEW):
        return api.post(
            f"/api/auth/users/{uid}/reset-password", json={"new_password": pw}, headers=admin
        )

    assert (await reset(other_admin.id)).status_code == 403
    assert (await reset(me.id)).status_code == 400
    assert (await reset("no-such-user")).status_code == 404
    target, _ = await make_user("user")
    r = await reset(target.id, "short")
    assert r.status_code == 400 and "8 characters" in r.json()["detail"]
    extra = await api.post(
        f"/api/auth/users/{target.id}/reset-password",
        json={"new_password": NEW, "role": "admin"},
        headers=admin,
    )
    assert extra.status_code == 422


async def test_change_password_returns_new_token_and_clears_flag(api):
    _, admin = await make_user("admin")
    target, _ = await make_user("user")
    await api.post(
        f"/api/auth/users/{target.id}/reset-password", json={"new_password": NEW}, headers=admin
    )
    first = {"Authorization": f"Bearer {(await _login(api, target.username, NEW)).json()['token']}"}
    second = {
        "Authorization": f"Bearer {(await _login(api, target.username, NEW)).json()['token']}"
    }

    same = await api.post(
        "/api/auth/change-password",
        json={"current_password": NEW, "new_password": NEW},
        headers=first,
    )
    assert same.status_code == 400

    r = await api.post(
        "/api/auth/change-password",
        json={"current_password": NEW, "new_password": "Mine-Own-2026"},
        headers=first,
    )
    assert r.status_code == 200
    fresh = {"Authorization": f"Bearer {r.json()['token']}"}

    me = await api.get("/api/auth/me", headers=fresh)
    assert me.status_code == 200 and me.json()["must_change_password"] is False
    assert (await api.get("/api/auth/me", headers=first)).status_code == 401
    assert (await api.get("/api/auth/me", headers=second)).status_code == 401


async def test_tokens_from_before_token_version_still_work(api):
    user, _ = await make_user("user")
    await db.users.update_one(
        {"id": user.id}, {"$unset": {"token_version": "", "must_change_password": ""}}
    )
    legacy = jwt.encode(
        {"user_id": user.id, "exp": datetime.now(UTC) + timedelta(hours=1)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    r = await api.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy}"})
    assert r.status_code == 200 and r.json()["must_change_password"] is False
