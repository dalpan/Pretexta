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

1. **Remediation loop** *(the missing core)* — a failed live outcome auto-assigns
   the relevant lab exercise (by the Cialdini principle / channel the person fell
   for), then schedules a variant retest. This is what makes Pretexta a product
   with a thesis rather than a set of features.
2. **Click campaigns as the primary flow** — report rate as the headline metric;
   demote the conversational layer in the UI.
3. **Prune** — remove certificates, the quiz generator and lab training-campaigns
   from the UI; gamification already never reads live data — keep it that way (G15).
4. **Human Attack Surface Map** *(differentiator; fits the military theme)* —
   see below.

## Human Attack Surface Map (design sketch)

The schema already has the unused building blocks (`OrgNode`, `TrustEdge`).

Model the organization as people and trust relationships: who can instruct whom,
who approves payments, whose compromise opens a path to money or admin access.
Overlay live-campaign outcomes to show **which real paths an attacker could walk
through the human layer** — a defensive "BloodHound for people".

- Nodes: people / roles, with their susceptibility from campaign + lab results.
- Edges: trust/authority (A can instruct B), approval chains, access.
- Analysis: shortest social-engineering path to a crown-jewel (e.g. finance
  approval), and which single person's training most reduces that risk.
- Military framing: a readiness posture and an after-action report per campaign.

Hard requirement: strict privacy framing — this maps *organizational risk*, not
a hit-list of individuals. Aggregate views by default; individual detail only to
the person and their trainer (guardrail G13).

## Deferred (real product, later)

TLS/public deployment and multi-worker rate limiting; management reporting and
export; recurring/scheduled campaigns; supervised auto-send; prompt-quality
evaluation for the AI personas.
