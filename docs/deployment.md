# Deployment

## Quick start (Docker)

```bash
git clone https://github.com/dalpan/Pretexta.git
cd Pretexta
make build && make up
```

`make build`/`make up` run `scripts/init-env.sh`, which creates `.env` from
`.env.example` with **random** `JWT_SECRET`, `MONGO_PASSWORD` and
`SEED_ADMIN_PASSWORD` (printed once). Open http://localhost:9443 and log in as
`soceng` with that password (also stored in `.env` as `SEED_ADMIN_PASSWORD`).

Services and host ports: frontend `9443`, backend `9442`, MongoDB `47017`
(bound to `127.0.0.1`).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Token signing key. If unset or the public default, a random per-process secret is used and restarts log everyone out — set it in production. |
| `MONGO_USERNAME` / `MONGO_PASSWORD` / `DB_NAME` | Database credentials. |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins. |
| `REACT_APP_BACKEND_URL` | Baked into the React bundle at build time. |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | First-run admin. Empty password → one is generated and logged. |
| `FRONTEND_PORT` / `BACKEND_PORT` / `MONGO_PORT` | Host port mappings. |

## Production notes

- **Set `JWT_SECRET`** to a long random value so sessions survive restarts.
- The default compose file does not run uvicorn with `--reload` and does not
  mount source; MongoDB is bound to `127.0.0.1`. Put the frontend/backend behind
  a TLS-terminating reverse proxy; run uvicorn with `--proxy-headers` and
  `--forwarded-allow-ips` so rate limiting keys on the real client IP.
- The in-memory rate limiter is per-process. For multiple workers, replace it
  with a shared store (Redis).
- Back up MongoDB; live-campaign telemetry self-expires after 180 days (G14).

## Live campaigns (optional)

The live module needs a GoPhish instance and a mail relay. For development or a
booth demo, everything runs locally in Docker — no domain or VPS required:

```bash
# GoPhish (admin API on :3333, phishing server on :80)
docker run -d --name gophish -p 3333:3333 -p 8080:80 gophish/gophish:latest

# GreenMail as a local SMTP+IMAP sink
docker run -d --name greenmail -p 3025:3025 -p 3143:3143 \
  -e GREENMAIL_OPTS='-Dgreenmail.setup.test.all -Dgreenmail.auth.disabled' \
  greenmail/standalone:2.1.0
```

Then, as an admin, configure **Settings → Live Campaigns** with the GoPhish URL
and API key, the SMTP relay, and (for replies) the IMAP mailbox. Use a sandbox
domain like `acme.test` for recipients — reserved TLDs are accepted without DNS
and can never reach a real mailbox. See
[design/live-campaigns.md](design/live-campaigns.md) and
[guardrails.md](guardrails.md).

The LLM for personas can be a local Ollama (`http://localhost:11434/v1`), which
is recommended for offline/booth use.

## Local development (without Docker)

```bash
make install   # frontend + backend deps
make dev        # MongoDB in Docker, backend hot-reload :8001, frontend :3000
```

## Tests and linting

```bash
make lint       # ruff check + format --check (backend)
make test       # pytest (spins up a throwaway MongoDB on 127.0.0.1:27099)
```

Backend tests live in `backend/tests/` and cover authorization, server-side
scoring, and the live-campaign guardrails.
