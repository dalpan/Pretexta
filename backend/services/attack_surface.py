"""
Human Attack Surface Map (docs/roadmap.md, priority #4).

A "BloodHound for people". We model the organization as a directed graph:

- nodes = people (with a *susceptibility*, 0-100) and a few asset nodes — the
  "crown jewels" an attacker is actually after (money, admin, data);
- edges = trust relationships. An edge A -> B means a compromised A can credibly
  reach B (authority pressure, a help-desk relationship, access to an asset).

An attacker enters by phishing any one person, then pivots along trust edges.
Each hop succeeds with a probability derived from the *target's* susceptibility
and the *edge's* trust weight. The best attack path to a crown jewel is the
maximum-probability path from "the internet" to that asset — found with Dijkstra
over -log(p). The person who sits on the most, or the easiest, of those paths is
the highest-leverage place to spend training ("fix this one first").

PRIVACY (guardrail G13): this maps *organizational* risk, not a hit-list. The
map and its individual nodes are visible only to staff (admin/trainer) who own
the remediation. Susceptibility is reported as a band by default; the raw number
and its evidence are available to the same staff who already see risk profiles.
"""

import math

from models.schemas import OrgNode, TrustEdge
from services.database import db

# --- tuning constants (kept explicit so the model is auditable) -------------

DEFAULT_SUSCEPTIBILITY = 50.0  # no data yet: coin-flip, flagged "estimated"
HARDENED_SUSCEPTIBILITY = 10.0  # what a fully trained person is modelled at
SUSC_FLOOR, SUSC_CEIL = 5.0, 95.0  # nobody is ever 0% or 100%

# Weights for blending the available susceptibility signals (renormalised over
# whatever signals a person actually has).
W_LIVE, W_LAB, W_RISK = 0.45, 0.30, 0.25

# Resistance lost per live outcome (live behaviour is the strongest signal).
LIVE_PENALTY = {"clicked": 45, "submitted": 70, "complied": 65, "disclosed": 85}
LIVE_REPORT_BONUS = 20  # reporting the phish is the behaviour we want


# ============================ susceptibility ===============================


def _band(susc: float) -> str:
    if susc >= 67:
        return "high"
    if susc >= 34:
        return "medium"
    return "low"


async def _live_resistance(email: str) -> float | None:
    """Resistance (0-100) implied by this person's real live-campaign behaviour."""
    rows = await db.live_recipients.find(
        {"email": email}, {"_id": 0, "state": 1, "reported": 1, "conversation_state": 1}
    ).to_list(200)
    if not rows:
        return None
    resistance = 100.0
    for r in rows:
        for outcome in (r.get("state"), r.get("conversation_state")):
            resistance -= LIVE_PENALTY.get(outcome, 0)
        if r.get("reported"):
            resistance += LIVE_REPORT_BONUS
    return max(0.0, min(100.0, resistance))


async def _lab_resistance(user_id: str) -> float | None:
    """Resistance from recent lab simulation scores (already 0-100)."""
    sims = (
        await db.simulations.find(
            {"user_id": user_id, "score": {"$ne": None}}, {"_id": 0, "score": 1}
        )
        .sort("completed_at", -1)
        .to_list(10)
    )
    scores = [s["score"] for s in sims if isinstance(s.get("score"), int | float)]
    if not scores:
        return None
    return sum(scores) / len(scores)


async def _risk_resistance(user_id: str) -> float | None:
    """Resistance from the behavioural risk profile (vector is 0=weak..100=strong)."""
    profile = await db.risk_profiles.find_one({"user_id": user_id}, {"_id": 0, "current_vector": 1})
    if not profile or not profile.get("current_vector"):
        return None
    vec = profile["current_vector"]
    vals = [v for v in vec.values() if isinstance(v, int | float)]
    return sum(vals) / len(vals) if vals else None


async def compute_susceptibility(node: dict) -> dict:
    """
    Returns {susceptibility, band, data_quality, evidence[]} for one person node.
    Blends live behaviour, lab scores and the risk profile — whichever exist.
    Falls back to any seeded value on the node, then to 50 (estimated).
    """
    evidence: list[str] = []
    signals: list[tuple[float, float]] = []  # (weight, resistance)

    user_id = node.get("user_id")
    email = None
    if user_id:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
        email = (user or {}).get("email")

    if email and (live := await _live_resistance(email)) is not None:
        signals.append((W_LIVE, live))
        evidence.append("live-campaign behaviour")
    if user_id and (lab := await _lab_resistance(user_id)) is not None:
        signals.append((W_LAB, lab))
        evidence.append("lab exercise scores")
    if user_id and (risk := await _risk_resistance(user_id)) is not None:
        signals.append((W_RISK, risk))
        evidence.append("behavioural risk profile")

    if signals:
        total_w = sum(w for w, _ in signals)
        resistance = sum(w * r for w, r in signals) / total_w
        susc = max(SUSC_FLOOR, min(SUSC_CEIL, 100.0 - resistance))
        quality = "measured"
    elif node.get("susceptibility") is not None:
        susc = max(SUSC_FLOOR, min(SUSC_CEIL, float(node["susceptibility"])))
        quality = "estimated"
        evidence.append("seeded estimate")
    else:
        susc = DEFAULT_SUSCEPTIBILITY
        quality = "unknown"
        evidence.append("no training data yet")

    return {
        "susceptibility": round(susc, 1),
        "band": _band(susc),
        "data_quality": quality,
        "evidence": evidence,
    }


# ============================ graph assembly ===============================


async def build_graph(org_id: str, *, refresh: bool = True) -> dict:
    """Load nodes + edges for an org and attach computed susceptibility to people."""
    nodes = await db.org_nodes.find({"org_id": org_id}, {"_id": 0}).to_list(500)
    edges = await db.trust_edges.find({"org_id": org_id}, {"_id": 0}).to_list(2000)

    for node in nodes:
        if node.get("is_asset"):
            node["susceptibility"] = None
            node["band"] = None
            continue
        computed = await compute_susceptibility(node) if refresh else None
        if computed:
            node.update(computed)
        else:
            susc = node.get("susceptibility") or DEFAULT_SUSCEPTIBILITY
            node["susceptibility"], node["band"] = susc, _band(susc)

    # Only keep edges whose endpoints both exist.
    ids = {n["id"] for n in nodes}
    edges = [e for e in edges if e["source_id"] in ids and e["target_id"] in ids]
    return {"nodes": nodes, "edges": edges}


async def targets(org_id: str) -> list[dict]:
    """People on the map who have a reachable email, ranked most-susceptible first
    — the recipient list for a campaign aimed at the human weak points."""
    graph = await build_graph(org_id)
    out: list[dict] = []
    for n in graph["nodes"]:
        if n.get("is_asset"):
            continue
        email = n.get("email")
        if not email and n.get("user_id"):
            user = await db.users.find_one({"id": n["user_id"]}, {"_id": 0, "email": 1})
            email = (user or {}).get("email")
        if email:
            out.append(
                {
                    "name": n["name"],
                    "role": n.get("role"),
                    "email": email,
                    "susceptibility": n.get("susceptibility"),
                    "band": n.get("band"),
                }
            )
    out.sort(key=lambda x: x["susceptibility"] or 0, reverse=True)
    return out


# ============================ pathfinding ==================================

INTERNET = "__internet__"  # virtual source: an attacker outside the org


def _hop_prob(target: dict, edge: dict) -> float:
    """Probability a compromised source succeeds in pivoting across `edge`.

    Reaching an asset depends only on the edge's access reliability; reaching a
    person depends on how susceptible that person is and how trusted the edge.
    """
    if target.get("is_asset"):
        return max(0.01, min(1.0, edge.get("trust_weight", 0.5)))
    susc = (target.get("susceptibility") or DEFAULT_SUSCEPTIBILITY) / 100.0
    return max(0.01, min(1.0, susc * edge.get("trust_weight", 0.5)))


def _build_adjacency(
    graph: dict, susc_override: dict[str, float] | None = None
) -> tuple[dict, dict]:
    by_id = {n["id"]: dict(n) for n in graph["nodes"]}
    if susc_override:
        for nid, val in susc_override.items():
            if nid in by_id and not by_id[nid].get("is_asset"):
                by_id[nid]["susceptibility"] = val

    adj: dict[str, list[tuple[str, float]]] = {INTERNET: []}
    # The internet can phish any person directly; entry prob = their susceptibility.
    for node in by_id.values():
        adj.setdefault(node["id"], [])
        if not node.get("is_asset"):
            susc = (node.get("susceptibility") or DEFAULT_SUSCEPTIBILITY) / 100.0
            adj[INTERNET].append((node["id"], max(0.01, min(1.0, susc))))
    for edge in graph["edges"]:
        tgt = by_id.get(edge["target_id"])
        if tgt is not None:
            adj[edge["source_id"]].append((edge["target_id"], _hop_prob(tgt, edge)))
    return adj, by_id


def _best_path(adj: dict, source: str, target: str) -> tuple[float, list[str]]:
    """Max-probability path source->target via Dijkstra over -log(p). Returns (prob, [node ids])."""
    import heapq

    best: dict[str, float] = {source: 0.0}  # accumulated -log(p); lower = better
    prev: dict[str, str] = {}
    pq: list[tuple[float, str]] = [(0.0, source)]
    while pq:
        cost, node = heapq.heappop(pq)
        if node == target:
            break
        if cost > best.get(node, math.inf):
            continue
        for nxt, p in adj.get(node, []):
            if p <= 0:
                continue
            nc = cost - math.log(p)
            if nc < best.get(nxt, math.inf):
                best[nxt] = nc
                prev[nxt] = node
                heapq.heappush(pq, (nc, nxt))
    if target not in best:
        return 0.0, []
    path = _trace(prev, target) + [target]
    return math.exp(-best[target]), path


def _trace(prev: dict, node: str) -> list[str]:
    out: list[str] = []
    while node in prev:
        node = prev[node]
        out.append(node)
    return list(reversed(out))


async def analyze(org_id: str) -> dict:
    """Full attack-surface analysis: best path to each crown jewel, choke points, posture."""
    graph = await build_graph(org_id)
    by_id = {n["id"]: n for n in graph["nodes"]}
    assets = [n for n in graph["nodes"] if n.get("is_asset")]
    people = [n for n in graph["nodes"] if not n.get("is_asset")]

    adj, _ = _build_adjacency(graph)

    # 1. Best (easiest) attack path from the internet to each crown jewel.
    paths = []
    for asset in assets:
        prob, path = _best_path(adj, INTERNET, asset["id"])
        if not path:
            continue
        hops = [_describe(by_id, nid) for nid in path if nid != INTERNET]
        paths.append(
            {
                "asset_id": asset["id"],
                "asset_name": asset["name"],
                "asset_kind": asset.get("asset_kind"),
                "probability": round(prob, 3),
                "hops": hops,
                "entry": hops[0]["name"] if hops else None,
            }
        )
    paths.sort(key=lambda p: p["probability"], reverse=True)

    # 2. Choke points: for each person, how much does hardening THEM cut the
    #    organization's TOTAL exposure (summed best-path risk across every crown
    #    jewel)? Measuring against the total — not just the single worst path —
    #    is what surfaces the people who gate the other assets too.
    baseline_worst = max((p["probability"] for p in paths), default=0.0)
    baseline_total = sum(p["probability"] for p in paths)
    choke = []
    for person in people:
        override = {person["id"]: HARDENED_SUSCEPTIBILITY}
        adj_h, _ = _build_adjacency(graph, override)
        total_after = sum(_best_path(adj_h, INTERNET, a["id"])[0] for a in assets)
        reduction = baseline_total - total_after
        choke.append(
            {
                "node_id": person["id"],
                "name": person["name"],
                "role": person.get("role"),
                "susceptibility": person.get("susceptibility"),
                "band": person.get("band"),
                "risk_reduction": round(max(0.0, reduction), 3),
            }
        )
    choke.sort(key=lambda c: (c["risk_reduction"], c["susceptibility"] or 0), reverse=True)

    # 3. Readiness posture (military framing).
    posture_score = round(100 * (1 - baseline_worst))
    return {
        "generated_for": org_id,
        "counts": {"people": len(people), "assets": len(assets), "edges": len(graph["edges"])},
        "posture": _posture(posture_score),
        "attack_paths": paths,
        "choke_points": choke[:5],
        "after_action": _after_action(paths, choke, by_id),
    }


def _describe(by_id: dict, nid: str) -> dict:
    n = by_id.get(nid, {})
    return {
        "id": nid,
        "name": n.get("name", "?"),
        "role": n.get("role"),
        "is_asset": n.get("is_asset", False),
        "susceptibility": n.get("susceptibility"),
        "band": n.get("band"),
    }


def _posture(score: int) -> dict:
    # DEFCON-style readiness condition for the military theme.
    if score >= 80:
        condition, label = 5, "SECURE"
    elif score >= 60:
        condition, label = 4, "GUARDED"
    elif score >= 40:
        condition, label = 3, "ELEVATED"
    elif score >= 20:
        condition, label = 2, "HIGH"
    else:
        condition, label = 1, "SEVERE"
    return {"score": score, "condition": condition, "label": label}


def _after_action(paths: list, choke: list, by_id: dict) -> list[str]:
    notes: list[str] = []
    if paths:
        top = paths[0]
        route = " -> ".join(h["name"] for h in top["hops"])
        notes.append(
            f"Easiest route to a crown jewel ({top['asset_name']}): {route} "
            f"— {round(top['probability'] * 100)}% modelled success."
        )
    if choke and choke[0]["risk_reduction"] > 0:
        c = choke[0]
        notes.append(
            f"Highest-leverage training: {c['name']} ({c['role']}). Hardening them "
            f"cuts total modelled exposure by {round(c['risk_reduction'] * 100)} points."
        )
    weak = [c for c in choke if (c["band"] == "high")]
    if weak:
        notes.append(
            f"{len(weak)} role(s) sit in the high-susceptibility band and lie on a path to an asset."
        )
    if not notes:
        notes.append("No attack path to a crown jewel found — add asset nodes and access edges.")
    return notes


# ============================ demo seed ====================================

_DEMO_NODES = [
    # (key, name, role, department, level, is_asset, asset_kind, susceptibility)
    ("ceo", "Chief Executive", "CEO", "Executive", 5, False, None, 35),
    ("cfo", "Chief Finance Officer", "CFO", "Finance", 4, False, None, 45),
    ("fin", "Finance Officer", "Accounts Payable", "Finance", 1, False, None, 70),
    ("itadmin", "IT Administrator", "Domain Admin", "IT", 3, False, None, 30),
    ("itsupport", "Help Desk Agent", "IT Support", "IT", 1, False, None, 60),
    ("sales", "Sales Representative", "Account Exec", "Sales", 1, False, None, 68),
    ("newhire", "New Joiner", "Graduate Trainee", "Operations", 0, False, None, 82),
    ("pay", "Payment Approval", "Wire transfers", "Finance", 0, True, "money", None),
    ("domain", "Domain Admin Console", "Identity & access", "IT", 0, True, "admin", None),
    ("pii", "Customer PII Database", "CRM records", "Sales", 0, True, "data", None),
]

_DEMO_EDGES = [
    # (source_key, target_key, relationship, trust_weight)
    ("ceo", "cfo", "reports_to", 0.85),
    ("ceo", "fin", "reports_to", 0.70),
    ("cfo", "fin", "reports_to", 0.85),
    ("fin", "pay", "approves", 0.95),
    ("itadmin", "domain", "admin_of", 0.95),
    ("itsupport", "itadmin", "peer", 0.55),
    ("itsupport", "newhire", "it_support", 0.75),
    ("newhire", "fin", "peer", 0.40),
    ("sales", "pii", "has_access", 0.80),
    ("itadmin", "pii", "admin_of", 0.90),
]


async def seed_demo_org(org_id: str) -> dict:
    """Create a small, realistic sample org so the map is demoable without live data.

    Idempotent: clears any existing demo nodes/edges for this org first.
    """
    await db.org_nodes.delete_many({"org_id": org_id, "seeded": True})
    await db.trust_edges.delete_many({"org_id": org_id, "seeded": True})

    key_to_id: dict[str, str] = {}
    for key, name, role, dept, level, is_asset, kind, susc in _DEMO_NODES:
        node = OrgNode(
            org_id=org_id,
            name=name,
            email=None if is_asset else f"{key}@acme.test",  # sandbox planning address
            role=role,
            department=dept,
            hierarchy_level=level,
            is_asset=is_asset,
            asset_kind=kind,
            susceptibility=susc,
        )
        doc = node.model_dump()
        doc["seeded"] = True
        await db.org_nodes.insert_one(doc)
        key_to_id[key] = node.id

    for src, tgt, rel, weight in _DEMO_EDGES:
        edge = TrustEdge(
            org_id=org_id,
            source_id=key_to_id[src],
            target_id=key_to_id[tgt],
            relationship=rel,
            trust_weight=weight,
        )
        doc = edge.model_dump()
        doc["seeded"] = True
        await db.trust_edges.insert_one(doc)

    return {"nodes": len(_DEMO_NODES), "edges": len(_DEMO_EDGES)}
