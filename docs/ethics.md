# Ethics and Acceptable Use

Pretexta simulates social engineering so people and organizations can get better at
resisting it. The same techniques can hurt people, so this document sets out what
Pretexta may be used for, which rules the software enforces, and which rules depend
on you.

This document only claims safeguards that exist in the code. Planned safeguards are
marked **planned** and link to their design.

## 1. Two modes

| | Lab mode (available) | Live mode (**planned**, see [design](design/live-campaigns.md)) |
|---|---|---|
| What | Quizzes, branching scenarios and AI roleplay inside Pretexta | Simulated phishing emails in an organization's real mailboxes, with AI follow-up when recipients reply |
| Participants know | Yes, they open the exercise themselves | That the organization runs simulations, but not when |
| Measures | Knowledge and decision-making in a controlled setting | Real behavior: reporting, time-to-report, clicks, replies |

Lab scores show what someone knows. They do not predict how often that person will
click in real life. Do not present them as if they do.

## 2. Acceptable use

- Security awareness programs run by, or on behalf of, the organization whose staff
  take part.
- Classroom, conference and workshop exercises with participants who opted in.
- Research approved by an ethics board, with informed consent.

## 3. Prohibited use

- Targeting people or organizations without the organization's authorization.
- Collecting real credentials, one-time codes, payment data or personal data beyond
  what the simulation needs.
- Using Pretexta's personas or generated pretexts in real attacks.
- Impersonating real government agencies or third-party brands outside lab mode
  without written authorization from that brand or agency.
- Using results to discipline, shame or rank individuals.

## 4. What the software enforces today

- **Role-based access.** Only admins configure LLM providers, platform settings and
  outbound URLs. Only trainers and admins import or publish content to the shared
  catalog. Creating an organization grants no platform role.
- **Data ownership.** Simulations, debriefs and reports are visible only to their
  owner and to trainers or admins.
- **Server-side scoring of assignments.** An assignment result is taken from a
  completed simulation the trainee owns, never from the request body.
- **No default credentials.** Setup generates random JWT, database and admin
  secrets. A JWT secret left at the public default is never used for signing.
- **Outbound URL guard.** Webhook targets must resolve to public addresses. They are
  checked again at send time.
- **Rate limits** on login, registration and LLM endpoints, per user or per IP.
- **Input size limits** on text sent to LLM providers.

Every item above has a regression test in `backend/tests/`.

## 5. Known limits of lab mode

Write these down before you rely on lab results:

- **Lab outcomes are reported by the client.** Simulation scores and the AI chat's
  win/loss signal come from the participant's browser or from the model's own
  output, so a determined participant can fake them. Use lab results for learning,
  not for grading people.
- **AI chat personas are sent by the client.** Any logged-in user can steer the
  configured LLM within the size limits. Configure a provider whose usage you can
  afford to have consumed by your users.
- **No retention policy yet.** Data stays until an admin deletes it.
- **No audit log yet** (**planned**, design guardrail G12).

## 6. Rules for live mode (**planned**)

Live mode will refuse to run unless these conditions hold. Each one maps to a
guardrail in the [design](design/live-campaigns.md#6-guardrails).

- Recipients are on a domain the organization proved it controls (G1).
- A second admin approved the campaign (G2). The campaign has a window of at most
  30 days (G3) and a kill switch (G4).
- Landing pages never capture passwords (G5). Secrets that people type into replies
  are redacted before storage, and the conversation ends right away (G6).
- The AI persona pursues one fixed, approved objective. Its messages are filtered
  and, by default, reviewed by a human before they are sent (G7, G8).
- Cruel or coercive themes are blocked: pay, layoffs, health, family emergencies,
  disasters and legal threats (G9).
- Individual results go only to the person and their trainer. Management sees
  aggregates over groups of at least 5. Live results never appear on leaderboards
  (G13, G15).

The software cannot do these for you:

- Get authorization from the organization, and inform staff through policy that
  simulations happen, as your local law requires. Examples: Indonesia's UU PDP
  (No. 27/2022), Saudi Arabia's PDPL, the GDPR.
- Agree with HR and legal how results will and will not be used.
- Debrief people kindly. Someone who clicked made the mistake the exercise exists to
  surface. Treat them accordingly.

## 7. Reporting

- **Misuse of Pretexta:** open an issue, or contact the maintainers privately if
  public disclosure could harm someone.
- **Vulnerabilities in Pretexta:** do not open a public issue. Use GitHub's private
  vulnerability reporting on this repository. We aim to respond within 7 days and to
  coordinate disclosure within 90 days.

*Last updated: October 2026*
