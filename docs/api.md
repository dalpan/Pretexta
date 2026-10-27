# API reference

All endpoints are prefixed with `/api`. Authentication is a JWT bearer token
(`Authorization: Bearer <token>`) obtained from `POST /api/auth/login`. Full
interactive docs are served at `/docs` (OpenAPI) when the backend is running.

Roles: **U** = any authenticated user, **T** = trainer or admin, **A** = admin.

## Auth — `/api/auth`

| Method | Path | Role | Notes |
|--------|------|------|-------|
| POST | `/register` | – | Open registration; returns a token |
| POST | `/login` | – | Returns a token + user |
| GET | `/me` | U | Current user |
| PUT | `/profile` | U | Update display name/email/theme |
| POST | `/change-password` | U | |
| POST | `/promote` | A | Change another user's role |
| POST | `/create-user` | T | Trainers create user-role accounts; admins any |

## Lab play (server-authoritative scoring)

AI chat — `/api/llm`:

| Method | Path | Role | Notes |
|--------|------|------|-------|
| POST | `/chat/start` | U | Begin a persona chat; returns `session_id` + opening line |
| POST | `/chat/turn` | U | Submit one message; returns reply, or final status + server score |

Quizzes — `/api/quizzes`:

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `` / `/all` / `/{id}` | U | `/{id}` strips the answer key |
| POST | `/{id}/submit` | U | Server grades; returns score + key for review |

Scenarios — `/api/scenarios`:

| Method | Path | Role | Notes |
|--------|------|------|-------|
| POST | `/start` | U | Start a branching scenario; creates the simulation |
| POST | `/choose` | U | Apply a choice (or advance a message node) |
| POST | `/resume` | U | Resume/begin a session by `simulation_id` |
| GET | `/session/{id}` | U | Current session state |

Simulations, debrief, reports — `/api/simulations`, `/api/debrief`,
`/api/reports`: read your own
(staff may review trainees). Clients **cannot** create graded simulation types
directly (409).

## LLM configuration — `/api/llm`

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/providers` | U | Provider catalog |
| GET | `/models/{provider}` | U | Model list |
| GET | `/models/{provider}/refresh` | A | Fetches `base_url` (admin-only) |
| GET/POST | `/config` | U/A | Read (masked); write is admin-only |
| POST | `/generate` | U | Training-content generation (size-limited) |

## Live campaigns — `/api/live` (trainer/admin; config admin-only)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET/POST | `/domains` | T | List / add a recipient domain (G1) |
| POST | `/domains/{id}/verify` | T | Re-check DNS TXT |
| DELETE | `/domains/{id}` | A | Remove |
| GET/POST | `/exclusions` | T | Exclusion list (G11) |
| DELETE | `/exclusions/{email}` | T | |
| GET/POST | `/campaigns` | T | List / create (runs pre-flight) |
| GET/PUT | `/campaigns/{id}` | T | View / edit a draft |
| POST | `/campaigns/{id}/submit` | T | Submit for approval (G3/G9/G10/G11) |
| POST | `/campaigns/{id}/approve` | A | Two-person approval (G2) |
| POST | `/campaigns/{id}/reject` | A | Back to draft |
| POST | `/campaigns/{id}/launch` | T | Create GoPhish objects and send |
| POST | `/campaigns/{id}/kill` | T | Stop (G4) |
| POST | `/campaigns/{id}/sync` | T | Pull GoPhish results |
| GET | `/campaigns/{id}/results` | T | Metrics + per-recipient state |
| POST | `/campaigns/{id}/inbound` | T | Feed one reply (demo/manual) |
| GET | `/campaigns/{id}/messages` | T | Conversation log |
| GET | `/review` | T | Pending AI-reply drafts |
| POST | `/review/{id}/approve` | T | Send (optionally edited) |
| POST | `/review/{id}/discard` | T | |
| GET/POST | `/kill-switch` | T/A | Global kill switch (G4) |
| GET/PUT | `/config` | A | GoPhish/relay/IMAP config (secrets masked) |
| POST | `/config/test` | A | Ping GoPhish |
| POST | `/poll` | A | Fetch inbound replies now |

Audit — `/api/audit` (admin): `GET /` (entries), `GET /verify` (chain integrity).

## Training & org management

- `/api/challenges`, `/api/scenario-builder` — content (staff author/publish).
- `/api/campaigns` — lab multi-stage "Training Campaigns".
- `/api/instructor`, `/api/assignments` — groups, assignments, cohort analytics.
- `/api/organizations` — create/join/leave; `/api/leaderboard`, `/api/analytics`.
- `/api/personas`, `/api/glossary`, `/api/risk-profile`,
  `/api/notifications`, `/api/webhooks`, `/api/settings`, `/api/import`.
- `/api/attack-surface` — Human Attack Surface Map (staff only): graph,
  analysis, node/edge CRUD.
- `/api/report-inbox` — Report-Phish mailbox (staff only): list/stats/leaderboard,
  `POST /ingest` (classify a reported message; credits the reporter if it's ours),
  `PATCH /{id}` (triage). `DELETE /api/live/campaigns/{id}` removes a finished campaign.
- `GET /api/live/analytics` — historical behaviour across launched campaigns:
  report-rate trend, per-campaign comparison, and repeat offenders.

## Health

`GET /api/health` — liveness + DB connectivity (used by Docker healthchecks).
