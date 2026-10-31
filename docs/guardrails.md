# Guardrails

Pretexta has two kinds of safety control: **platform** guardrails that apply to
the whole app, and **live-campaign** guardrails (G1–G15) that gate real
outbound email. All of them are enforced in code, with regression tests in
`backend/tests/`.

## Platform guardrails (always on)

| Control | Where |
|---------|-------|
| Role-based access: admin-only config, trainer/admin content authoring; creating an org grants no platform role | `services/auth.py`, route dependencies |
| Per-record data ownership (own simulations/debriefs/reports; staff may review trainees) | `services/simulation.py`, `routes/debrief.py`, `routes/reports.py` |
| Server-authoritative scoring; clients cannot post graded results | `services/simulation.py`, see [scoring.md](scoring.md) |
| No default credentials; random JWT/DB/admin secrets; public default JWT secret never used for signing | `scripts/init-env.sh`, `services/auth.py` |
| Outbound-URL guard (webhooks must resolve to public IPs; re-checked at send) | `services/net_guard.py`, `routes/webhooks.py` |
| Rate limiting on login, registration, LLM endpoints | `middleware/rate_limit.py` |
| Input-size limits on text sent to LLM providers | `routes/llm.py` |
| User input escaped in every Mongo `$regex` query | across `routes/` |

## Live-campaign guardrails (G1–G15)

These gate the live module. A campaign that fails any **error**-level pre-flight
check cannot be submitted, approved or launched. See
[design/live-campaigns.md](design/live-campaigns.md) for the full design.

| # | Rule | Enforced at |
|---|------|-------------|
| G1 | Recipients must be on a domain verified by DNS TXT (`pretexta-verify=<token>`); reserved TLDs (`.test`/`.example`/`.invalid`) are sandbox domains | `services/live/domains.py`, `preflight.py` |
| G2 | Two-person approval: the creator can never approve; the approver must be `admin` | `routes/live.py` approve |
| G3 | Campaign window ≤ 30 days; nothing sent outside it | `preflight.py` |
| G4 | Kill switch (global + per-campaign) stops GoPhish sends and AI replies | `routes/live.py`, `launch.stop_campaign` |
| G5 | Landing pages never capture passwords: created with capture off, and the returned object is re-checked | `services/live/gophish.py` |
| G6 | Secrets a recipient types into a reply are redacted before storage, and the conversation ends | `services/live/secrets.py`, `conversation.py` |
| G7 | The persona objective is a fixed enum; the prompt is built server-side only | `services/live/conversation.py` |
| G8 | AI drafts pass an output filter; review mode (human approval) is the default | `services/live/output_filter.py`, review queue |
| G9 | Blocked coercive themes: pay/bonuses, layoffs, health, family emergencies, disasters, legal threats (EN + ID) | `preflight.py` |
| G10 | Real government agencies / third-party brands blocked unless a written override reason is recorded | `preflight.py` |
| G11 | Per-organization exclusion list honored in pre-flight and at launch | `preflight.py`, `launch.py` |
| G12 | Append-only, hash-chained audit log of every create/approve/launch/kill/override/export | `services/audit.py` |
| G13 | Individual results visible only to the person and staff (trainer/admin); everyone else sees aggregates, and none at all for a cohort under 5 | `services/privacy.py`, `routes/analytics.py`, `routes/risk_profile.py` |
| G14 | Live telemetry (`live_events`, `live_messages`) expires after 180 days (TTL index) | `server.py` indexes |
| G15 | No live results on leaderboards or in gamification: live outcomes never award XP or badges or create lab results | live services write only `live_*`; `tests/test_privacy_guardrails.py` |

## The content filter (G9/G10)

`preflight.check_content` decodes HTML entities and checks both a tag-stripped
and a tag-collapsed view of the text, so simple evasions (`PayP<b></b>al`,
`&#112;aypal`) cannot hide a blocked keyword. G10 can be overridden only by
recording a written authorization reason, which is captured in the audit log.

## The audit chain (G12)

`services/audit.py` keeps an append-only log where each entry stores the SHA-256
of the previous entry. The head advances with compare-and-swap, so sequence
numbers stay gap-free under concurrent writers. `verify_chain` recomputes every
hash and reports the first broken sequence number if any entry was edited or
removed. `GET /api/audit/verify` exposes this to admins.

## What the software cannot do for you

Guardrails make misuse hard; they do not make a campaign ethical by themselves.
Authorization from the organization, informing staff through policy (UU PDP,
PDPL, GDPR as applicable), agreeing with HR/legal how results are used, and
debriefing people kindly are human responsibilities. See [ethics.md](ethics.md).
