# Phase 5 Schema: Judge UI

Phase 4 already defines the core marks and results tables (`callback_marks`, `final_marks`, `judge_submissions`, `callback_results`, `final_results`, `tabulation_tables`, `round_results_meta`). Phase 5 adds judge session management and mark correction auditing.

## New Enums

```
judge_session_status: active, ended
mark_correction_source: scrutineer, judge
```

## Tables

### `judge_sessions`
Tracks authenticated judge tablet sessions. A judge can only have one active session per competition at a time.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| judge_id | integer FK -> judges | |
| status | judge_session_status, default 'active' | active or ended |
| token_hash | text, not null | Hashed JWT for validation/revocation |
| started_at | timestamp, default now | |
| ended_at | timestamp | Set on logout or switch |

Index: unique (competition_id, judge_id) WHERE status = 'active' — one active session per judge per comp

Notes:
- When a judge logs in on a new tablet, any existing active session for that judge is ended (prevents duplicate sessions)
- JWT payload: `{ competition_id, judge_id, session_id, iat, exp }` — exp set to end of day
- Token is scoped: only grants access to judging endpoints for this competition

### `active_rounds`
Tracks which round the scrutineer has activated for judging. Only one round can be active per competition at a time.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| round_id | integer FK -> rounds | |
| started_at | timestamp, default now | |
| ended_at | timestamp | Set when round is advanced/stopped |

Index: unique (competition_id) WHERE ended_at IS NULL — one active round per comp

Notes:
- Scrutineer calls `startRound` → creates row here → Ably broadcast to judge tablets
- When advancing, current active round is ended (sets `ended_at`) and next round is started
- Judges can only submit marks for the active round
- Cannot start next round until all `judge_submissions` for current round have status = 'submitted'

### `mark_corrections`
Audit trail for any marks changed by the scrutineer or sent back to a judge for correction.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | |
| judge_id | integer FK -> judges | |
| entry_id | integer FK -> entries | |
| dance_name | text | Null for callback marks |
| old_value | text, not null | Previous mark (stringified) |
| new_value | text, not null | Corrected mark (stringified) |
| source | mark_correction_source, not null | Who made the correction |
| corrected_by | text FK -> users | Null if judge self-corrected, user_id if scrutineer |
| reason | text | Optional explanation |
| created_at | timestamp, default now | |

Notes:
- Created whenever a mark is changed after initial submission
- For callback marks: old_value/new_value are "true"/"false"
- For final marks: old_value/new_value are the placement number as string
- `source = 'scrutineer'` means the scrutineer edited directly; `source = 'judge'` means the scrutineer unlocked the submission and the judge re-submitted

## Ably Channel Architecture

All competition real-time communication uses Ably. Judge tablets authenticate with Ably using a token request endpoint that validates their judge JWT.

### Channels

#### `comp:{compId}:judging`
Scrutineer → judge tablets. All judge tablets for this competition subscribe.

Events:
- **`round:started`** — `{ roundId, eventName, roundType, coupleNumbers[], callbacksRequested? }`
  Judge tablets display the marking page for this round.
- **`round:locked`** — `{ roundId }`
  Disables further mark editing. Sent when scrutineer advances to next round.
- **`round:unlocked`** — `{ roundId, judgeId }` (filtered client-side)
  Tells a specific judge their submission was sent back for correction.

#### `comp:{compId}:submissions`
Judge tablets → scrutineer. Scrutineer subscribes to monitor progress.

Events:
- **`judge:submitted`** — `{ judgeId, roundId, timestamp }`
- **`judge:editing`** — `{ judgeId, roundId }` (judge clicked "Edit" to revise)

#### `comp:{compId}:results`
Scrutineer → all subscribers (competitors, projector, staff views).

Events:
- **`results:computed`** — `{ roundId }` (internal, scrutineer sees "ready to review")
- **`results:published`** — `{ roundId, eventName }` (public)

### Ably Token Auth for Judges

Judge tablets get an Ably token via a dedicated endpoint:
- Judge presents their JWT
- Server validates JWT, checks `judge_sessions` for active session
- Returns an Ably token scoped to:
  - Subscribe: `comp:{compId}:judging`
  - Publish: `comp:{compId}:submissions`
  - No access to other channels

## Key Design Decisions

### Judge Session Lifecycle
1. Scrutineer enters comp code + master password + selects judge on tablet
2. Server validates credentials, creates `judge_sessions` row, returns JWT
3. JWT stored in browser (httpOnly cookie or localStorage — no sensitive data in payload)
4. Tablet connects to Ably with scoped token
5. Judge marks rounds as they are activated
6. At end of day (or to switch judges): logout → ends session, clears JWT, disconnects Ably

### Mark Submission Flow
1. Scrutineer starts round → `active_rounds` row created → Ably `round:started`
2. Judge tablet shows marking page with couple numbers
3. Judge taps marks (in-memory only, not saved to DB)
4. Judge hits Submit → mutation saves all marks to `callback_marks` or `final_marks` + updates `judge_submissions` status → Ably `judge:submitted`
5. Judge can hit Edit → marks become editable again, Ably `judge:editing`
6. Judge re-submits → marks overwritten in DB → Ably `judge:submitted`
7. All judges submitted → scrutineer can advance

### Advancing Rounds
1. Scrutineer sees all judges submitted
2. Scrutineer clicks "Advance" → current `active_rounds` row gets `ended_at` set
3. If preliminary: scoring engine computes callback results, populates `callback_results`
4. If final: scoring engine computes placements, populates `final_results` + `tabulation_tables`
5. `round_results_meta` set to `computed`
6. Scrutineer reviews results
7. Scrutineer publishes → `round_results_meta` set to `published` → Ably `results:published`
8. Next round activated (auto-determined from schedule, or manually selected)

### Corrections
Two paths:
1. **Scrutineer edits directly**: Updates the mark in DB, creates `mark_corrections` row, re-triggers scoring
2. **Unlock for judge**: Scrutineer unlocks a specific judge's submission (resets `judge_submissions` status to `pending`) → Ably `round:unlocked` → judge edits and re-submits → creates `mark_corrections` row on re-submit
