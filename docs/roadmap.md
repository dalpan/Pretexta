# Roadmap & product direction

This document fixes what Pretexta is for, what it keeps, what it cuts, and the
order of work. It is the reference for any "should we build X?" decision.

## Thesis

Awareness tools measure what people *know*. Pretexta measures what people *do*
under social-engineering pressure, and closes the loop:

> **measure in the real environment → remediate with targeted practice → retest**

Primary metric is **report rate** (and time-to-report), not click rate or quiz
scores. See [concept.md](concept.md) for the evidence.

## What is core (keep and invest)

| Area | Why it is core |
|------|----------------|
| **Live campaigns — click first** | Authorized phishing in real mailboxes; click rate + report rate are the real signal. This is the headline. |
| **Inbox Triage** | High-signal discrimination (d′) with a false-alarm cost; deterministic, offline. |
| **Write Your Reply** | Free-text behavior graded by an LLM rubric. |
| **Scenarios** | Branching, consequence-driven practice. |
| **Risk profile / Analytics** | Where results turn into insight. |
| **Assignments** | How remediation is delivered. |

Server-authoritative scoring underpins all of these (see [scoring.md](scoring.md)).

## What we are cutting or demoting

| Feature | Decision | Reason |
|---------|----------|--------|
| **Certificates** (Platinum/Gold/Silver) | Cut from the UI | Fluff; a weak signal for a behavior tool. |
| **AI Challenge (quiz generator)** | Cut from the UI | Generates quizzes — the format we are demoting; low value, overlaps content. |
| **Training Campaigns** (lab multi-stage) | Cut from the UI | Conceptually overlaps Scenarios + Live. |
| **Gamification** (XP / badges / leaderboard) | Keep for lab engagement only; **never** tie to live results | Ranking individuals shames people and invites gaming; conflicts with the thesis (guardrail G15). |

Cut-from-UI means the menu, route and page are removed. Backend endpoints may
remain dormant for now; they are not exposed and will be removed when safe.

## The conversational-AI layer, honestly

The live module supports two kinds of campaign:

- **Click campaigns** — no AI, no replies. The core, GoPhish-style. Metric:
  report rate.
- **Conversational campaigns** — when a recipient replies, an AI persona
  continues the thread (BEC, OTP, approval). This is a differentiator, **not the
  foundation.**

Review mode (a human approves every AI draft) only pays off at scale — one
trainer skimming hundreds of drafted replies instead of writing them. At small
scale it is marginal. The real automation value is a **supervised auto-send
mode** (AI replies within strict guardrails, human monitors + kill switch),
which is a later, carefully-gated step. Until then, position conversational AI
as an optional advanced layer, not the headline.

## Priorities (in order)

1. **Remediation loop** *(the missing core)* — ✅ **DONE**. A failed live outcome
   auto-assigns the relevant lab exercise (by the Cialdini principle the person
   fell for), then schedules a variant retest. `services/remediation.py`.
2. **Click campaigns as the primary flow** — ✅ **DONE**. The Live Campaigns page
   leads with report rate (aggregate KPI band + per-campaign hero), the create
   form defaults to a click campaign, and the AI conversation is a clearly-labelled
   advanced option. Backend metric now also returns click rate + median
   time-to-report.
3. **Prune** — ✅ **DONE**. Removed certificates, the standalone AI-challenge menu
   and lab "Campaigns"; gamification still never reads live data (G15).
4. **Human Attack Surface Map** *(differentiator; fits the military theme)* —
   ✅ **DONE**. `services/attack_surface.py`, `routes/attack_surface.py`, and the
   "Peta Serangan" command page. See below for the model as built.

## Human Attack Surface Map (as built)

The previously-unused `OrgNode` / `TrustEdge` schema is now the backbone.

Model the organization as people and trust relationships: who can instruct whom,
who approves payments, whose compromise opens a path to money or admin access.
Overlay live-campaign outcomes to show **which real paths an attacker could walk
through the human layer** — a defensive "BloodHound for people".

- **Nodes**: people / roles plus a few *asset* nodes — the crown jewels (money,
  admin, data). Each person's **susceptibility** (0–100) is computed by blending,
  in weight order, their real live-campaign behaviour (0.45), lab scores (0.30)
  and risk profile (0.25); a clicked/submitted live outcome moves them straight
  into the high band. No data → flagged "estimated".
- **Edges**: directed trust relationships. `A → B` means a compromised A can
  credibly reach B (authority pressure, a help-desk relationship, approval or
  access to an asset). `approves` / `has_access` / `admin_of` point at an asset.
- **Analysis**: an attacker enters by phishing any one person, then pivots along
  edges; each hop succeeds with `p = susceptibility(target) × trust_weight`. The
  best attack path to each crown jewel is the max-probability path from the
  internet (Dijkstra over `-log p`). **Choke points** are ranked by how much
  hardening one person cuts *total* modelled exposure across all assets — which
  correctly surfaces a low-susceptibility sole-gatekeeper (e.g. the domain admin)
  over a highly-susceptible person who leads nowhere.
- **Military framing**: a DEFCON-style readiness posture (1 SEVERE … 5 SECURE)
  from the single easiest route, plus an after-action summary.

Hard requirement (met): strict privacy framing — this maps *organizational risk*,
not a hit-list. The page is staff-only (admin/trainer who own the remediation),
susceptibility is shown as a band, and the raw number + its evidence sit behind a
node click for the same staff who already see risk profiles (guardrail G13).

## LIVE OPS additions (shipped)

- **Report-Phish mailbox** (`services/report_inbox.py`) — the defensive mirror of
  a campaign. A forwarded lure is classified; if it's ours the reporter is
  credited into report rate, otherwise it's queued for threat triage. Reporter
  leaderboard included. Integration point: `POST /report-inbox/ingest` (a mail
  poller or forwarding rule feeds it in production).
- **Delete campaigns** + **exclusion (allowlist) UI** — close two gaps: finished
  campaigns can be removed (an active one must be killed first, G4), and the
  people who must never be phished can be managed in the UI.

## Deferred (real product, later)

TLS/public deployment and multi-worker rate limiting; management reporting and
export; recurring/scheduled campaigns; supervised auto-send; prompt-quality
evaluation for the AI personas; IMAP auto-ingest for the report mailbox and an
end-user "Report Phish" button.
