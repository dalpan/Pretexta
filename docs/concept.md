# Concept: measure behavior, not knowledge

Pretexta exists because the usual way of "doing security awareness" measures the
wrong thing, and this document explains what Pretexta measures instead and why.

## The problem with quiz-style awareness training

Most awareness tools ask employees multiple-choice questions: *"Which of these is
a phishing email?"* The trouble is threefold.

1. **The answer is obvious.** When one option is "URGENT: reset your password
   now" with a link and the others are a calendar invite and a newsletter,
   everyone picks the phish. The quiz measures whether someone knows the
   textbook answer, not whether they would act on it while busy. This is
   *social-desirability bias*: people answer the way they know they should.
2. **The base rate is 100% attack.** In a quiz every item is an attack. In a
   real inbox, almost everything is legitimate, and the hard part is spotting
   the one fake among hundreds of real messages while doing your actual job.
3. **Suspicion is free.** "Refuse everything" scores perfectly on a quiz. In a
   real workplace, refusing every request is also a failure mode — invoices go
   unpaid, colleagues get ignored.

Independent research backs this up. A controlled study of ~19,500 employees
found that completing annual training had no significant relationship with
failing a simulated phish, and embedded training moved the failure rate by only
about 1.7 percentage points (Ho et al., *IEEE S&P 2025*). Verizon's DBIR has
repeatedly found that **reporting rate**, not click rate, is the metric that
tracks a resilient organization (recent-training groups reported at ~21% vs a
~5% baseline).

The takeaway: knowing the theory is not the same as behaving safely, and a
tamper-proof quiz about the theory is still a quiz about the theory.

## What Pretexta measures instead

Pretexta is built around *behavior under realistic conditions*, with the
decision made on the **server** from what the trainee actually does — never from
a self-reported score the browser could forge (see [scoring.md](scoring.md)).

Two surfaces carry this idea:

- **AI chat (lab).** An open-ended roleplay against an adversarial persona. The
  outcome is decided by what the trainee types: leaking a secret or agreeing to
  the attacker's goal is a compromise; resisting under escalating pressure is a
  defense. There is no "pick the right answer" — the trainee has to actually
  hold the line in a conversation.
- **Live campaigns.** Authorized phishing simulations in employees' real
  mailboxes, with an AI persona that continues the thread when someone replies.
  Here the base rate, the workload and the cost of over-caution are all real,
  because it is real email on a normal workday. The primary metrics are
  **report rate** and **time-to-report**, not click rate alone.
  See [live-campaigns.md](design/live-campaigns.md).

## Where quizzes and scenarios fit

Quizzes and branching scenarios still exist, but as **remediation and warm-up**,
not as the headline. Their scoring is now server-authoritative, so they cannot
be gamed, but they remain lower-signal than the two surfaces above by design.

The roadmap moves their *content* toward higher signal too:

- **Inbox triage** — a realistic inbox mixing mostly legitimate mail with a few
  pretexts, under time pressure, where flagging a legitimate message costs
  points. This measures *discrimination* (signal detection), not recall.
- **Free-text response** — "what would you reply?" graded by an LLM against a
  rubric (did they verify through an independent channel, or ask the attacker
  "is this really you?"). This reuses the server-side scoring infrastructure.
- **Consequence-driven scenarios** — branches with no obviously-correct option
  and escalating pressure (the persona engine already tracks `pressure_level`).

## Honest limits

- While trainees know they are in a lab, no exercise perfectly predicts
  real-world click rates. Lab scores measure discrimination and verification
  discipline under pressure; they do not forecast "X% of staff will click."
  State this plainly rather than overclaiming.
- Live campaigns reduce that gap because the conditions are real, but they
  require organizational authorization and care (see
  [guardrails.md](guardrails.md) and [ethics.md](ethics.md)).

## References

- D. Ho et al., "Understanding the Efficacy of Phishing Training in Practice,"
  *IEEE Symposium on Security and Privacy*, 2025.
- Verizon Data Breach Investigations Report (DBIR), 2024–2025 — reporting-rate
  vs click-rate benchmarks.
- R. Cialdini, *Influence: The Psychology of Persuasion* — the six principles
  the content is organized around.
