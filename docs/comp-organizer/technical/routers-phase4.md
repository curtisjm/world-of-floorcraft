# Phase 4 Routers: Scoring Engine

## `scoringRouter` — `src/domains/competitions/routers/scoring.ts`

### Mark Submission

#### `submitCallbackMarks` (protected)
Submit callback marks for a preliminary round.

**Input:** `{ roundId, judgeId, marks: [{ entryId, marked }] }`
**Returns:** `{ submitted: number }`

- Upserts callback marks (insert or update existing)
- Creates/updates judge submission status to "submitted"

#### `submitFinalMarks` (protected)
Submit final round placements for one or more dances.

**Input:** `{ roundId, judgeId, marks: [{ entryId, danceName, placement }] }`
**Returns:** `{ submitted: number }`

- Deletes existing marks per dance, then inserts fresh (avoids unique constraint violations when swapping placements)
- Creates/updates judge submission status to "submitted"

### Queries

#### `getSubmissionStatus` (protected)
**Input:** `{ roundId }`
**Returns:** Array of judge submission records for the round.

#### `getResults` (public)
**Input:** `{ roundId }`
**Returns:** `{ meta, results, tabulation, callbacks }` — all computed data for display.

#### `getCallbackResults` (public)
**Input:** `{ roundId }`
**Returns:** Array of callback result records (entryId, totalMarks, advanced).

### Result Computation

#### `computeCallbackResults` (protected, org admin/scrutineer)
Compute preliminary round results from callback marks.

**Input:** `{ roundId }`
**Returns:** `{ couples, advanced }`

- Builds marks map from callback_marks table
- Runs `tallyCallbacks()` to count marks per couple
- Determines advancement based on `callbacksRequested` on the round
- Stores results in `callback_results`, sets `round_results_meta` to "computed"

#### `computeFinalResults` (protected, org admin/scrutineer)
Compute final round results using the skating system.

**Input:** `{ roundId }`
**Returns:** `{ dances, couples, isMultiDance }`

- Fetches dances from `event_dances` for ordering
- Builds marks per dance from `final_marks`
- Runs `singleDance()` (Rules 5-8) for each dance → per-dance placements + tabulation
- If multi-dance: runs `multiDance()` (Rules 9-11) → overall placements
- Stores per-dance results, overall results (danceName=null), and tabulation tables
- Sets `round_results_meta` to "computed"
- Rejects with BAD_REQUEST if no marks have been submitted

### Results Workflow

#### `reviewResults` (protected, org admin/scrutineer)
**Input:** `{ roundId }`
**Returns:** Updated meta record with status "reviewed".

#### `publishResults` (protected, org admin/scrutineer)
**Input:** `{ roundId }`
**Returns:** Updated meta record with status "published".

## Scoring Engine Library

Located at `src/domains/competitions/lib/scoring/`:

| File | Purpose |
|------|---------|
| `types.ts` | Type definitions (Marks, TabulationRow, SingleDanceResult, MultiDanceResult, CallbackTally) |
| `engine.ts` | Core scoring functions ported from Python `score_final.py` |
| `index.ts` | Barrel exports |

### Algorithm Summary

**Rules 5-8 (Single Dance):** Recursive majority-based placement. For each placement level, count how many judges placed a couple at or better than that level. A majority (>50% of judges) earns the placement. Ties broken by: greater majority count (R6), then sum of relevant marks (R7), then checking the next placement level (R8).

**Rules 9-11 (Multi-Dance):** Sum point values across all dances (R9). Ties broken by counting how many dances a couple placed at each position (R10). If still tied, smush all individual judge marks across all dances and re-run single-dance placement (R11).

**Callbacks:** Simple mark counting — sum boolean marks from all judges per couple, sort descending.

## Test Coverage

### Unit Tests (`tests/domains/competitions/scoring-engine.test.ts`) — 15 tests
- Callback tallying
- Rules 5-8: simple majority, greater majority, equal majority + sum tiebreak, no majority
- Ties with averaged point values
- Edge cases: minimum viable final, single couple, unanimous judges
- Multi-dance: Rules 9-11, four-way tie, maximum disagreement, large field

### Integration Tests (`tests/domains/competitions/scoring.test.ts`) — 14 tests
- Callback mark submission + resubmission
- Final mark submission + resubmission (with placement swaps)
- Judge submission status tracking
- Callback result computation with advancement
- Single-dance final result computation
- Multi-dance final result computation
- Tabulation table storage
- Empty results query
- Results workflow (computed → reviewed → published)
- Authorization checks (org admin required)
