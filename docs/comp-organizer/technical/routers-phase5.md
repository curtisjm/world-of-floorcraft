# Phase 5 Routers: Judge UI

Two new routers for Phase 5. The `judge-session` router uses judge JWT auth (not Clerk). The `scrutineer` router uses standard Clerk auth with staff role verification.

---

## Judge Session Router (`judge-session.ts`)

All procedures (except `authenticate`) require a valid judge JWT. The router middleware validates the JWT and checks for an active `judge_sessions` row.

### Mutations

- **authenticate** (public) — Log in as a judge on a tablet.
  - Input: `comp_code`, `master_password`, `judge_id`
  - Validates: comp_code matches a competition, master_password matches hash, judge_id is assigned to this competition via `competition_judges`
  - Side effects: ends any existing active session for this judge, creates new `judge_sessions` row
  - Returns: JWT (`{ competition_id, judge_id, session_id }`) + judge name + competition name

- **logout** (judge auth) — End the current session.
  - Sets `judge_sessions.status = 'ended'`, `ended_at = now`
  - Client clears JWT and disconnects Ably

- **submitCallbackMarks** (judge auth) — Submit preliminary round marks.
  - Input: `round_id`, `marks: Array<{ entry_id, marked: boolean }>`
  - Validates:
    - Round is the currently active round (`active_rounds`)
    - Judge is assigned to this competition
    - All entry_ids belong to this round
  - Behavior:
    - Upserts `callback_marks` rows (insert or overwrite on re-submit)
    - Sets `judge_submissions` status to `submitted`, `submitted_at = now`
    - If re-submitting (edit flow): creates `mark_corrections` rows for any changed marks
  - Publishes: Ably `judge:submitted` on `comp:{compId}:submissions`

- **submitFinalMarks** (judge auth) — Submit final round marks.
  - Input: `round_id`, `marks: Array<{ entry_id, dance_name, placement }>`
  - Validates:
    - Round is the currently active round
    - Judge is assigned to this competition
    - All entry_ids belong to this round
    - All dance_names match the event's `event_dances`
    - Placements are a valid permutation (1..N for N couples, each used exactly once per dance)
  - Behavior:
    - Upserts `final_marks` rows
    - Sets `judge_submissions` status to `submitted`
    - If re-submitting: creates `mark_corrections` rows for changes
  - Publishes: Ably `judge:submitted` on `comp:{compId}:submissions`

### Queries

- **getActiveRound** (judge auth) — Get the currently active round for this competition.
  - Returns: round details (id, event name, round type, couple numbers, heat divisions, callbacks_requested) or null if no round is active
  - Used by judge tablet to know what to display

- **getMySubmission** (judge auth) — Get this judge's current marks for the active round.
  - Returns: marks array (callback or final depending on round type) + submission status
  - Used when judge hits "Edit" to reload their marks

- **getAblyToken** (judge auth) — Get a scoped Ably token for real-time.
  - Validates judge JWT and active session
  - Returns Ably token with permissions:
    - Subscribe: `comp:{compId}:judging`
    - Publish: `comp:{compId}:submissions`

---

## Scrutineer Router (`scrutineer.ts`)

All procedures require Clerk auth + staff role of `scrutineer` (or org admin/owner) for the competition.

### Mutations

- **startRound** (scrutineer) — Activate a round for judging.
  - Input: `competition_id`, `round_id?` (optional — if omitted, auto-determines next round from schedule)
  - Validates:
    - No currently active round with pending submissions (all judges must have submitted for current round before advancing)
    - If auto-determining: finds next unscored round in schedule order
    - If manual: validates the specified round exists and hasn't been scored
  - Behavior:
    - Ends current active round if one exists (`active_rounds.ended_at = now`)
    - If ending a round: triggers scoring for that round (callback tally or skating system)
    - Creates new `active_rounds` row
    - Creates `judge_submissions` rows (status: `pending`) for all `competition_judges`
  - Publishes: Ably `round:started` on `comp:{compId}:judging`
  - Returns: round details + marking data for scrutineer's monitor view

- **stopRound** (scrutineer) — End the active round without advancing to the next one.
  - Input: `competition_id`
  - Validates: there is an active round, all judges have submitted
  - Behavior: ends active round, triggers scoring
  - Publishes: Ably `round:locked` on `comp:{compId}:judging`

- **overrideMarks** (scrutineer) — Directly correct a judge's marks.
  - Input: `round_id`, `judge_id`, `corrections: Array<{ entry_id, dance_name?, new_value }>`
  - Validates: round exists, judge is assigned
  - Behavior:
    - Updates `callback_marks` or `final_marks` rows
    - Creates `mark_corrections` row per change (source: `scrutineer`, corrected_by: current user)
    - Re-triggers scoring for the round
    - Updates `round_results_meta` back to `computed` if it was `reviewed`

- **unlockJudgeSubmission** (scrutineer) — Send a judge's marks back for correction.
  - Input: `round_id`, `judge_id`
  - Behavior:
    - Sets `judge_submissions` status back to `pending`
    - Publishes Ably `round:unlocked` on `comp:{compId}:judging` with `{ judgeId }`

- **reviewResults** (scrutineer) — Mark results as reviewed after checking tabulation.
  - Input: `round_id`
  - Validates: `round_results_meta.status` is `computed`
  - Behavior: sets status to `reviewed`, `reviewed_by`, `reviewed_at`

- **publishResults** (scrutineer) — Make results visible to competitors.
  - Input: `round_id`
  - Validates: `round_results_meta.status` is `reviewed`
  - Behavior: sets status to `published`, `published_at`
  - Publishes: Ably `results:published` on `comp:{compId}:results`

- **recomputeResults** (scrutineer) — Re-run the scoring engine for a round.
  - Input: `round_id`
  - Use case: after mark corrections, or if scrutineer suspects a computation error
  - Behavior: re-runs scoring engine, overwrites `final_results`/`callback_results` + `tabulation_tables`, resets `round_results_meta` to `computed`

### Queries

- **getSubmissionStatus** (scrutineer) — Real-time submission progress for the active round.
  - Input: `competition_id`
  - Returns: list of judges with their submission status (pending/submitted), submitted_at, plus active round details
  - Note: Scrutineer also subscribes to Ably `comp:{compId}:submissions` for instant updates, but this query provides the full state on page load

- **viewJudgeMarks** (scrutineer) — View a specific judge's marks for a round.
  - Input: `round_id`, `judge_id`
  - Returns: all marks from that judge for that round (callback or final)

- **getResults** (scrutineer) — Get computed results and tabulation tables for a round.
  - Input: `round_id`
  - Returns: `final_results` or `callback_results` + `tabulation_tables` + `round_results_meta` status
  - Used for the scrutineer review screen before publishing

- **getNextRound** (scrutineer) — Preview what the next auto-determined round would be.
  - Input: `competition_id`
  - Returns: next round in schedule order that hasn't been scored, or null if all done
  - Used to show the scrutineer what "Advance" will start next

- **getCorrectionHistory** (scrutineer) — View all mark corrections for a round.
  - Input: `round_id`
  - Returns: all `mark_corrections` rows for this round, ordered by created_at
