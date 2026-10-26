# Architecture

Pretexta is a two-tier web app: a React single-page frontend and a FastAPI
backend over MongoDB. All state and all scoring live on the backend; the
frontend is a thin client.

```
┌───────────────────────────────────────────────────────────────┐
│  Frontend  (React 19 · Tailwind · CRA)         :9443 (nginx)   │
│  pages/ · components/ · services/api.js (axios + JWT)          │
└───────────────────────────┬───────────────────────────────────┘
                            │ REST, Bearer JWT
┌───────────────────────────┴───────────────────────────────────┐
│  Backend  (FastAPI · LangChain · Pydantic)     :9442 (uvicorn) │
│                                                                │
│  routes/    26 routers, ~131 endpoints, all under /api         │
│  services/  business logic (see below)                         │
│  models/    Pydantic schemas (schemas.py)                      │
│  middleware/ rate limiting                                     │
└───────────────────────────┬───────────────────────────────────┘
                            │ Motor (async)
┌───────────────────────────┴───────────────────────────────────┐
│  MongoDB 7.0                                   :47017 (local)  │
└───────────────────────────────────────────────────────────────┘
                            │ (live campaigns only)
              ┌─────────────┴─────────────┐
              │ GoPhish (send + tracking) │  IMAP/SMTP relay
              └───────────────────────────┘
```

## Backend layout

### `routes/` — HTTP surface (thin)

Each file is one router mounted under `/api`. Route handlers validate input and
delegate to a service; they hold no business logic beyond authorization
dependencies. Notable groups: `auth`, `challenges`, `quizzes`, `scenarios`,
`simulations`, `llm`, `live` + `audit`, `campaigns`, `instructor`,
`organizations`. See [api.md](api.md).

### `services/` — business logic

| Service | Responsibility |
|---------|----------------|
| `auth.py` | Password hashing (bcrypt), JWT, `require_admin` / `require_trainer` / `is_staff` |
| `simulation.py` | Create/own/update simulations; XP + risk + assignment side-effects on completion; blocks client-scored result types |
| `lab_chat.py` | Server-held AI chat sessions; outcome + score decided server-side |
| `scenario_runner.py` | Server-held branching-scenario sessions; score applied per choice |
| `scoring.py`, `gamification.py`, `risk_engine.py`, `adaptive.py` | Susceptibility scoring, XP/badges, risk vector, adaptive difficulty |
| `ai_gateway.py` | Single entry point for LLM calls (persona replies, compliance judge, generation, analysis) |
| `llm.py` | Provider dispatch (Groq, Gemini, Anthropic, OpenAI, OpenRouter, local) |
| `persona_engine.py` | Persona catalog (22 personas) + defense-signal detection |
| `audit.py` | Hash-chained append-only audit log |
| `net_guard.py` | Outbound-URL guard (SSRF protection for webhooks) |
| `services/live/` | The live-campaign module (see below) |

### `services/live/` — the live-campaign module

| Module | Responsibility |
|--------|----------------|
| `domains.py` | DNS-TXT domain verification; reserved-TLD sandbox domains |
| `preflight.py` | Pre-flight guardrail checks (window, recipients, blocked themes/brands) |
| `gophish.py` | Async GoPhish REST client; refuses credential-capturing pages (G5) |
| `launch.py` | Build GoPhish objects, launch, sync results, teachable moment |
| `conversation.py` | Reply engine: scrub secrets → compliance judge → drafted reply held for review |
| `secrets.py` | Secret detector/redactor (OTP, password, card) |
| `output_filter.py` | Guardrail on AI draft replies |
| `inbound.py` | IMAP poller that routes replies into the conversation engine |
| `mailer.py` | Direct SMTP for 1:1 persona replies and teachable moments |

## Data model (MongoDB collections)

Core: `users`, `organizations`, `challenges`, `quizzes`, `simulations`,
`simulation_events`, `llm_configs`, `settings`, `glossary`, `personas`,
`risk_profiles`, `notifications`, `scenario_templates`, `webhooks`.

Training: `training_groups`, `assignments`, `assignment_results`,
`campaigns`, `campaign_progress`.

Server-held sessions (so scoring can't be forged): `lab_sessions`,
`scenario_sessions`.

Live campaigns: `live_campaigns`, `live_recipients`, `live_events`,
`live_messages`, `live_exclusions`, `verified_domains`, `live_config`,
`audit_log`, `counters` (audit chain head).

## Authentication & authorization

- JWT (HS256), 24-hour expiry, `Authorization: Bearer <token>`. If `JWT_SECRET`
  is unset or the public default, a random per-process secret is generated (see
  [deployment.md](deployment.md)).
- Roles: `user` (trainee), `trainer`, `admin`. Dependencies `require_trainer`
  and `require_admin` gate staff-only and admin-only routes. Creating an
  organization grants **no** platform role.
- Data ownership is enforced per record: a trainee sees only their own
  simulations/debriefs/reports; staff may review trainees.

## Request lifecycle (example: a lab AI chat)

1. `POST /api/llm/chat/start {persona_id}` → server loads the persona from its
   catalog, creates a `lab_sessions` row, returns the opening line.
2. `POST /api/llm/chat/turn {session_id, message}` → server appends the message
   to the server-held history, scrubs it for secrets, decides the outcome, and
   (on a terminal outcome) records a `simulations` row with the server-computed
   score. The browser never sends history or score.

The quiz and scenario flows follow the same server-authoritative shape; see
[scoring.md](scoring.md).
