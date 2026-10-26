"""
Append-only, hash-chained audit log (guardrail G12).

Every entry stores the SHA-256 of the previous entry, so editing or deleting
any record breaks the chain and `verify_chain` reports where. The chain head
lives in a single document updated with compare-and-swap, which keeps
sequence numbers gap-free under concurrent writers.
"""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from pymongo.errors import DuplicateKeyError

from services.database import db

GENESIS_HASH = "0" * 64
_HEAD_ID = "audit_head"


def _entry_hash(entry: dict[str, Any]) -> str:
    body = {
        k: entry[k] for k in ("seq", "at", "actor_id", "action", "target", "details", "prev_hash")
    }
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def record(
    actor_id: str | None,
    action: str,
    target: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append one entry. `action` is a dotted verb such as `live.campaign.approve`."""
    while True:
        head = await db.counters.find_one({"_id": _HEAD_ID}) or {"seq": 0, "hash": GENESIS_HASH}
        entry = {
            "seq": head["seq"] + 1,
            "at": datetime.now(UTC).isoformat(),
            "actor_id": actor_id,
            "action": action,
            "target": target,
            "details": details or {},
            "prev_hash": head["hash"],
        }
        entry["hash"] = _entry_hash(entry)

        if head["seq"] == 0:
            try:
                await db.counters.insert_one({"_id": _HEAD_ID, "seq": 1, "hash": entry["hash"]})
            except DuplicateKeyError:  # another writer created the head first; retry
                continue
        else:
            claimed = await db.counters.update_one(
                {"_id": _HEAD_ID, "seq": head["seq"]},
                {"$set": {"seq": entry["seq"], "hash": entry["hash"]}},
            )
            if claimed.modified_count == 0:
                continue

        await db.audit_log.insert_one(dict(entry))
        return entry


async def verify_chain() -> dict[str, Any]:
    """Recompute every hash. Returns {"ok": bool, "entries": n, "broken_at": seq|None}.

    The head/tail comparison can see a false mismatch if a write is in flight
    (head advanced, its entry not yet inserted). Writes are rare and operator
    triggered, so re-run if a verify races a concurrent write.
    """
    prev_hash = GENESIS_HASH
    expected_seq = 1
    async for entry in db.audit_log.find({}, {"_id": 0}).sort("seq", 1):
        if (
            entry["seq"] != expected_seq
            or entry["prev_hash"] != prev_hash
            or _entry_hash(entry) != entry["hash"]
        ):
            return {"ok": False, "entries": expected_seq - 1, "broken_at": expected_seq}
        prev_hash = entry["hash"]
        expected_seq += 1

    head = await db.counters.find_one({"_id": _HEAD_ID})
    if head and (head["seq"] != expected_seq - 1 or head["hash"] != prev_hash):
        # Entries were removed from the end of the log
        return {"ok": False, "entries": expected_seq - 1, "broken_at": expected_seq}
    return {"ok": True, "entries": expected_seq - 1, "broken_at": None}
