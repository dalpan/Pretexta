# Pretexta documentation

Pretexta is an open-source framework for social-engineering assessments. It
measures how people *behave* under social-engineering pressure — in open-ended
AI roleplay and in authorized live phishing campaigns — rather than only testing
whether they know the textbook answer.

Start here, then follow the links:

| Doc | What it covers |
|-----|----------------|
| [concept.md](concept.md) | Why Pretexta measures behavior, not knowledge — the idea and the evidence. Read this first. |
| [roadmap.md](roadmap.md) | Product direction: what's core, what's cut, and the order of work. |
| [user-guide.md](user-guide.md) | **Rule book**: install, admin & trainee usage, every menu with screenshots. |
| [live-campaign-walkthrough.md](live-campaign-walkthrough.md) | **Step-by-step**: set up GoPhish and run a full live campaign, with screenshots. |
| [architecture.md](architecture.md) | How the system is built: frontend, backend services, data model, auth. |
| [scoring.md](scoring.md) | Server-authoritative scoring and why lab results cannot be gamed. |
| [guardrails.md](guardrails.md) | Platform guardrails and the live-campaign guardrails G1–G15. |
| [design/live-campaigns.md](design/live-campaigns.md) | Full design of the live (GoPhish-integrated) module. |
| [api.md](api.md) | REST endpoint reference (interactive docs at `/docs`). |
| [deployment.md](deployment.md) | Running Pretexta, environment variables, production notes, live-campaign setup. |
| [ethics.md](ethics.md) | Acceptable use, what the software enforces, and what remains your responsibility. |
| [llm_prompts.md](llm_prompts.md) | Prompt templates used by the LLM gateway. |

## The short version

- **Lab mode** (available): AI chat roleplay, branching scenarios, quizzes. All
  scored on the server from what the trainee does. The AI chat is the
  high-signal surface; quizzes and scenarios are remediation and warm-up.
- **Live mode**: authorized phishing simulations in real mailboxes via GoPhish,
  with an AI persona that continues the thread when someone replies and stops
  before any real secret is disclosed. Primary metrics are report rate and
  time-to-report.

## Status and roadmap

The security foundation (authorization, server-side scoring, no default
credentials) and the live-campaign module (P1–P3: guardrails, GoPhish adapter,
review-mode conversation engine, IMAP poller, UI) are implemented and tested.

Next, per [concept.md](concept.md): raise the *content* signal of the lab —
inbox triage (signal-detection metrics) and free-text responses graded by an LLM
rubric — and enforce the analytics-side guardrails G13/G15.
