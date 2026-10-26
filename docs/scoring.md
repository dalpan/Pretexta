# Scoring & anti-cheat

Every lab result in Pretexta is scored on the **server**, from what the trainee
actually did. The browser can start an exercise and send the next action, but it
can neither compute the score nor report an outcome. This document explains how
each surface is scored and why it cannot be gamed.

## Why this matters

If a trainee can set their own score, the leaderboard, the risk profile and the
instructor dashboard are all fiction. Early versions trusted the client in three
places; all three are now closed, each with regression tests in
`backend/tests/`.

| Surface | Old (client-trusted) | Now (server-authoritative) |
|---------|----------------------|----------------------------|
| AI chat | Win/loss from an injectable `[ATTACK_FAILED]` token; browser POSTed `score: 100/0` | Server holds the conversation; outcome from the trainee's words; server computes the score |
| Quiz | `GET /quizzes/:id` shipped the answer key; browser computed the score | Answer key stripped; `POST /quizzes/:id/submit` grades server-side |
| Branching scenario | `GET /challenges/:id` shipped `score_impact`+branches; browser PUT the score | Answer key stripped for trainees; server applies each choice and records the score |

`create_simulation` refuses client-created `ai_challenge`, `quiz`, `simulation`
and `challenge` results (HTTP 409) — those must come through their dedicated
server endpoints.

## AI chat (`services/lab_chat.py`)

A session lives in `lab_sessions` with the full history. On each turn:

1. **Secret check.** The message is run through `secrets.scrub`. If it contains
   an OTP, password or card number, the outcome is `compromised`.
2. **Compliance check.** Otherwise, compliance phrases (e.g. "I'll wire the
   money", "here is my password", Indonesian equivalents) also mark a
   compromise.
3. **Turn budget.** If neither fires and the turn cap (`MAX_TURNS = 6`) is
   reached, the outcome is `defended`.
4. Otherwise the persona replies and the session continues.

**Score** (`_score`):
- compromised at turn *t*: `clamp(10 + (t-1)*8, 10, 45)` — falling early is
  worse; resisting a few turns first earns a little credit.
- defended: `clamp(70 + defense_signals*6, 70, 100)` — rewarded for the number
  of distinct resistance behaviors shown (verification, refusal, slowing down).

Defense signals come from `persona_engine._detect_defenses` (keyword families
per Cialdini principle).

## Quiz (`routes/quizzes.py`)

- `GET /quizzes/:id` calls `_strip_answer_key`, removing every option's `correct`
  flag and all explanations before sending the quiz to the taker.
- `POST /quizzes/:id/submit {answers}` grades on the server, **points-weighted**:
  `score = round(earned_points / possible_points * 100)`. It records the
  simulation itself and returns the key + explanations for the review screen.

## Branching scenario (`services/scenario_runner.py`)

- `GET /challenges/:id` strips `score_impact` and branch targets (`next`) for
  trainees; staff keep the full graph for authoring and preview.
- Play is a server session (`scenario_sessions`) that starts at 100. Each choice
  applies the chosen option's `score_impact`, clamped to 0–100, and advances to
  the next node. Reaching an `end` node finalizes the simulation with the server
  score; the outcome is the node's `result`, or success/failure by the 70
  threshold if unset.
- `ensure_session` lets the player resume by `simulation_id`, which also covers
  scenarios started by a campaign stage.

## From score to consequences

When a simulation reaches `completed`, `services/simulation._on_simulation_complete`
fires (all best-effort, never blocking the response):

1. **XP + badges** — `_calculate_xp` scales a base by the score; `gamification`
   awards badges.
2. **Risk profile** — `risk_engine.update_profile_from_simulation` adjusts the
   user's per-channel risk vector from the events and outcome.
3. **Assignment linkage** — if an active assignment matches the content, an
   `assignment_results` row is recorded and the assignment completed on a pass.

## Roadmap: higher-signal scoring

The current quiz/scenario scoring is honest but low-signal (see
[concept.md](concept.md)). Planned additions, reusing this same
server-authoritative pattern:

- **Inbox triage** — signal-detection metrics (hits, false alarms, d′) instead
  of a single 0–100.
- **Free-text response** — an LLM graded against a rubric (independent-channel
  verification vs asking the attacker), via `ai_gateway`.
