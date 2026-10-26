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

- **Live mode** (the headline): authorized phishing in real mailboxes via GoPhish.
  The primary flow is a **click campaign** measured by **report rate** and
  time-to-report; an AI persona that continues a reply thread (and stops before
  any real secret) is an optional advanced layer.
- **Lab mode**: high-signal exercises — **Inbox Triage** (signal-detection d′),
  **Write Your Reply** (LLM-rubric-graded free text), branching scenarios, AI
  chat roleplay, quizzes — all scored on the server so results can't be gamed.
- **The loop**: a failure (live or lab) auto-assigns targeted practice for the
  Cialdini principle the person fell for, then schedules a retest.
- **Human Attack Surface Map**: an attacker's-eye graph of people, trust edges
  and crown-jewel assets, showing the easiest social-engineering path and who to
  train first.

## Status and roadmap

Implemented and tested: the security foundation (authorization, server-side
scoring, no default credentials); the full live-campaign module (guardrails,
GoPhish adapter, review-mode conversation engine, IMAP poller, UI) with report
rate as the headline metric; the high-signal lab exercises (triage, free-text);
the remediation loop; and the Human Attack Surface Map (with G13/G15 enforced).

What remains is deferred infrastructure — see [roadmap.md](roadmap.md): public
TLS deployment, management reporting/export, scheduled campaigns, supervised
auto-send, and prompt-quality evaluation.
