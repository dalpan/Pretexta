# Design: Live Campaigns

Status: draft · Owner: @dalpan · Last updated: 2026-10-26

## 1. Problem

Pretexta today runs lab simulations: quizzes, branching scenarios and AI roleplay.
Participants know they are being tested, every message they see is an attack, and
refusing costs nothing. Under those conditions "always refuse" earns a perfect score,
so lab scores measure what people *know*, not what they *do*.

Field studies point the same way. Large phishing programs found that annual and
embedded training barely moved click rates, while reporting behavior was the
measure that actually improved organizational detection
(Lain et al., IEEE S&P 2022; Ho et al., IEEE S&P 2025).

Live Campaigns measure behavior where it happens: in employees' real inboxes, during
a normal workday, with the organization's informed authorization.

## 2. Goals and non-goals

Goals

- Run authorized phishing simulations against an organization's own mailboxes.
- Continue a simulated pretext as a **conversation**: when a recipient replies, an
  AI persona answers within a locked objective, as real BEC and helpdesk scams do.
- Stop before any real secret changes hands and turn that moment into teaching.
- Measure reporting (rate and time-to-report) as the primary outcome, not clicks.
- Close the loop: live result → targeted lab exercise → retest with a variant.
- Enforce every safety rule in code, so it cannot be skipped by configuration.

Non-goals

- Building a mail-sending platform. Delivery, landing pages and click tracking reuse
  [GoPhish](https://github.com/gophish/gophish) through its REST API.
- Targeting anyone outside a domain the organization has proven it controls.
- SMS, WhatsApp or voice in live mode. Those stay lab-only (see §9).
- Ranking or naming individuals to management.

## 3. Overview

```
                 ┌──────────────────────── Pretexta ────────────────────────┐
 Trainer ──────▶ │ Campaign builder ─▶ Approval ─▶ Guardrail checks         │
 Approver ─────▶ │        │                              │                   │
                 │        ▼                              ▼                   │
                 │  GoPhish adapter ◀──── kill switch ──── Audit log        │
                 │        │   ▲                                              │
                 │        │   └── results sync (sent/open/click/report)      │
                 │        ▼                                                  │
                 │  Conversation engine ◀── inbound replies (IMAP)           │
                 │   persona (locked objective) → output filter → review     │
                 │        │                                                  │
                 │        ▼                                                  │
                 │  Outcomes ─▶ teachable moment ─▶ lab assignment ─▶ retest │
                 └───────────────────────────────────────────────────────────┘
                          │ API                         │ SMTP / IMAP
                          ▼                             ▼
                       GoPhish                  Simulation mail domain
```

## 4. Campaign lifecycle

1. **Draft.** A trainer picks a pretext, a persona objective, recipients (groups) and
   a time window.
2. **Pre-flight.** Pretexta runs every check in §6 and lists any failures. A campaign
   with a failing check cannot be submitted.
3. **Approval.** A second person with the `admin` role approves it. The creator can
   never approve their own campaign. Approval is recorded in the audit log.
4. **Running.** Pretexta creates the GoPhish objects (group, template, landing page,
   sending profile), launches the campaign and syncs results every minute.
   Replies go to the conversation engine.
5. **Closed.** The window ends or someone presses the kill switch. Sending and AI
   replies stop, and recipients who interacted get their debrief.
6. **Follow-up.** Each participant is assigned lab exercises for the Cialdini
   principles they fell for. A variant retest is scheduled 3–4 weeks later.

## 5. Conversation engine

### Threading

Each recipient gets a unique reply address using plus-addressing
(`it-support+<opaque-token>@<sim-domain>`). Pretexta reads that mailbox over IMAP
and maps the token to `(campaign_id, recipient_id)`. Tokens are random, unique per
recipient, and invalid after the campaign closes.

### Locked objective

The persona's system prompt is built **only on the server**, from campaign fields:

- `objective`, taken from a fixed enum: `click_link`, `reply`,
  `agree_to_share_otp`, `agree_to_approve_payment`, `agree_to_install_tool`.
- `principles`, a subset of the six Cialdini principles.
- `pretext`, the approved template text.
- `max_turns`, at most 6.

Clients never send prompt text. This replaces today's `/api/llm/chat`, where the
browser sends the whole persona.

The objectives are written as **agreements**, never as handing over the secret. The
persona tries to get "OK, I'll send you the code", not the code itself.

### Stop before the secret

Every inbound reply goes through two checks before anything is stored or answered:

1. **Secret detector.** Regex plus a classifier looks for OTP-like codes, password
   strings, card numbers and credentials. A match triggers four things: the content
   is redacted *before* it is stored, the conversation ends, the outcome is recorded
   as `disclosed`, and the recipient immediately gets the teachable-moment email.
2. **Compliance intent.** An LLM judge decides whether the reply agrees to the
   objective. If it does, the conversation ends with outcome `complied` and the
   teachable moment is sent.

### Output filter

Every AI draft is checked before it is sent. A draft that does any of the following
is held for human review and never sent automatically:

- asks for anything outside the objective (home address, family, health, personal
  bank details, documents);
- threatens the recipient (job loss, legal action, harm);
- names a real person outside the campaign's allowed sender identities;
- exceeds the persona's turn budget.

### Review mode (default)

AI drafts wait in a queue until a trainer approves, edits or discards them.
Auto-send is a separate per-campaign setting that needs admin approval and is off by
default. The first release ships with review mode only.

## 6. Guardrails

All guardrails run on the server and block the action that would break them. The
"Enforced at" column names the code path that refuses it.

| # | Rule | Enforced at |
|---|------|-------------|
| G1 | Recipients must be on a domain verified by a DNS TXT record `pretexta-verify=<token>` | recipient import, pre-flight, every send |
| G2 | The creator cannot approve their own campaign; the approver must be `admin` | approval endpoint |
| G3 | Campaign window is at most 30 days; nothing is sent outside it | pre-flight, scheduler |
| G4 | Kill switch, global and per campaign, stops GoPhish sends and AI replies within 60 s | scheduler, conversation engine |
| G5 | Landing pages never capture passwords: Pretexta creates them with `capture_passwords=false` and refuses to launch if GoPhish reports otherwise | pre-flight, launch |
| G6 | Inbound secrets are redacted before storage (§5) | IMAP ingest |
| G7 | Persona objective comes from a fixed enum; the prompt is built on the server only | conversation engine |
| G8 | AI drafts pass the output filter; review mode is the default | conversation engine |
| G9 | Blocked themes: pay and bonuses, layoffs, health, family emergencies, disasters, legal threats against the recipient | template validation |
| G10 | Real government agencies and third-party brands are blocked by default; an admin override requires written authorization, recorded in the audit log | template validation |
| G11 | An exclusion list is honored (leave, recent incidents, opt-outs required by local law) | recipient import, every send |
| G12 | Append-only audit log of every create, approve, launch, kill, override and data export, hash-chained to show tampering | all mutating endpoints |
| G13 | Individual results are visible only to the person and their trainer; management views are aggregates over groups of at least 5 | analytics endpoints |
| G14 | Retention: live campaign data expires after 180 days by default (TTL index) | database |
| G15 | No live results on leaderboards or in gamification | analytics, gamification |

## 7. Metrics

Primary

- **Report rate.** Share of recipients who reported, through GoPhish's report
  button or a forward to the security mailbox.
- **Time-to-report.** Median minutes from delivery to the first report in the
  campaign. This is the organization's detection speed.

Secondary

- Click rate and data-submission rate (the event only, never the content).
- Reply rate and **conversation depth**: turns before a report, compliance or
  silence.
- Outcomes per Cialdini principle and per pretext channel.
- Repeat susceptibility across retests.

Lab scores never mix with live metrics. Dashboards show them side by side, labeled
separately.

## 8. Data model (new collections)

- `verified_domains`: `{id, organization_id, domain, token, verified_at, last_checked_at}`
- `live_campaigns`: `{id, organization_id, created_by, approved_by, status, window, objective, principles, template_id, gophish_campaign_id, kill_switch, created_at}`
- `live_recipients`: `{id, campaign_id, user_id?, email, reply_token, excluded}`
- `live_events`: `{id, campaign_id, recipient_id, type, at, meta}` where `type` is one of
  sent, opened, clicked, submitted, reported, replied, complied, disclosed, killed. TTL index.
- `live_messages`: `{id, campaign_id, recipient_id, direction, body_redacted, status, reviewed_by}`. TTL index.
- `audit_log`: `{seq, at, actor_id, action, target, details, prev_hash, hash}`

## 9. Why email only

- WhatsApp Business terms prohibit deceptive messaging, so simulation numbers get
  banned. Personal numbers are outside any domain an organization can verify.
- SMS sender-ID spoofing is illegal or tightly regulated in many jurisdictions.
- Voice cloning of a real executive requires that executive's written consent.
  That flow can be added later as a separate, explicitly opt-in module.

These channels stay available as lab simulations.

## 10. Delivery plan

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| P0 | Authorization fixes, tests, CI (done on branch `security/authz-hardening`) | `make test` green |
| P1 | Guardrail foundation: audit log, verified domains, approval flow, kill switch | G1–G4, G11, G12 have tests |
| P2 | GoPhish adapter: create and launch campaigns, sync results, teachable-moment pages | end-to-end run against a GoPhish container in CI |
| P3 | Conversation engine in review mode, with secret detector and output filter | G5–G9 have tests; red-team prompt injection suite passes |
| P4 | Live → lab loop, metrics dashboard, retention | G13–G15 have tests |
| P5 | Optional auto-send mode | security review sign-off |

Black Hat MEA Arsenal (1–3 Dec 2026) targets P1 to P3 in review mode, demoed against
a domain owned by the project.

## 11. Open questions

- Inbound mail: IMAP polling only, or also inbound webhooks (SES, Mailgun, Postmark)?
- Reporting signal: rely on the GoPhish report button, or also parse forwards to a
  security mailbox?
- Classifier for the secret detector: rules plus the configured LLM, or a small
  local model, so that raw replies never leave the deployment?
- Should P1 add per-organization roles (`org_admin`, `org_trainer`) to replace
  today's global `admin` and `trainer` roles?
