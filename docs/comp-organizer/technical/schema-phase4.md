# Phase 4 Schema: Scoring Engine

## New Enums

```
mark_status: pending, submitted, confirmed
result_status: computed, reviewed, published
```

## Tables

### `callback_marks`
Preliminary round marks — each judge marks which couples should advance.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | |
| judge_id | integer FK -> judges | |
| entry_id | integer FK -> entries | The couple being marked |
| marked | boolean, not null | true = callback, false = not marked |

Index: unique (round_id, judge_id, entry_id)

### `final_marks`
Final round marks — each judge ranks all couples for each dance.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | Must be a final round |
| judge_id | integer FK -> judges | |
| entry_id | integer FK -> entries | The couple being ranked |
| dance_name | text, not null | Which dance within the event (matches event_dances.dance_name) |
| placement | integer, not null | Judge's ranking (1 = first, 2 = second, etc.) |

Indexes:
- unique (round_id, judge_id, entry_id, dance_name) — one mark per judge per couple per dance
- unique (round_id, judge_id, dance_name, placement) — each judge gives unique placements per dance

### `judge_submissions`
Tracks whether a judge has submitted their marks for a round.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | |
| judge_id | integer FK -> judges | |
| status | mark_status, default 'pending' | pending -> submitted -> confirmed |
| submitted_at | timestamp | |
| confirmed_at | timestamp | Scrutineer confirmation |

Index: unique (round_id, judge_id)

### `callback_results`
Computed results for preliminary rounds — which couples advance.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | |
| entry_id | integer FK -> entries | |
| total_marks | integer, not null | Sum of callback marks from all judges |
| advanced | boolean, not null | Whether this couple advances to the next round |

Index: unique (round_id, entry_id)

### `final_results`
Computed placements for final rounds — per dance and overall.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | Must be a final round |
| entry_id | integer FK -> entries | |
| dance_name | text | Null for overall multi-dance result, populated for per-dance results |
| placement | integer, not null | Computed placement (1 = first, etc.) |
| placement_value | numeric(4,1) | Point value for ties (e.g. 1.5 when two couples tie for 1st) |
| tiebreak_rule | text | Which rule resolved the placement: null, 'R5'-'R8', 'R9'-'R11', or 'tie' |

Indexes:
- unique (round_id, entry_id, dance_name) — one result per couple per dance (or per overall)
- (round_id, placement)

### `tabulation_tables`
Stores the full tabulation table for display — the step-by-step scoring breakdown.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | |
| entry_id | integer FK -> entries | |
| dance_name | text | Null for multi-dance summary |
| table_data | jsonb, not null | The tabulation row for this couple (array of cell values matching column headers) |

Index: unique (round_id, entry_id, dance_name)

Notes on `table_data`: Stores the computed tabulation table row as JSON. For a single dance this is the cells like `["--", "3", "3(5)", "--", "--", "2"]` matching columns `[1, 1-2, 1-3, ..., result]`. For multi-dance summary it's the per-dance placements and total. This avoids having to recompute for display.

### `round_results_meta`
Metadata about computed results for a round.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade), unique | |
| status | result_status, default 'computed' | computed -> reviewed -> published |
| computed_at | timestamp | |
| reviewed_by | text FK -> users | Scrutineer who reviewed |
| reviewed_at | timestamp | |
| published_at | timestamp | |

## Key Design Decisions

### Marks vs Results Separation
- **Marks** (`callback_marks`, `final_marks`) are the raw input from judges — immutable once confirmed
- **Results** (`callback_results`, `final_results`) are computed from marks — can be recomputed if marks are corrected
- **Tabulation tables** are stored for display — avoids recomputing the step-by-step breakdown every time results are viewed

### Preliminary Round Scoring
- Simple: count callback marks per couple, sort by total
- `callbacks_requested` on the round tells us how many should advance
- If there's a tie at the cutoff, the system flags it for the scrutineer to resolve (include or exclude)

### Final Round Scoring (Skating System)
- Input: `final_marks` for all judges, all couples, all dances in the event
- Process:
  1. For each dance: run `singleDance()` (Rules 5-8) → per-dance placements + tabulation table
  2. If multi-dance: run `multiDance()` (Rules 9-11) → overall placements + summary table
- Output: `final_results` rows (per-dance + overall) + `tabulation_tables` rows

### Scoring Engine Function Signatures

```typescript
// Types
interface Marks {
  [coupleId: string]: number[];  // couple -> array of judge placements
}

interface TabulationRow {
  cells: string[];     // tabulation table cells
  placement: number;   // final placement
  pointValue: number;  // point value (for tie handling in multi-dance)
}

interface SingleDanceResult {
  placements: Array<{ coupleId: string; placement: number }>;
  tabulation: Map<string, TabulationRow>;
}

interface MultiDanceResult {
  finalPlacements: Map<string, number>;
  tiebreakRules: Map<string, string>;
  perDanceResults: Map<string, SingleDanceResult>;
  summaryTable: Map<string, { danceValues: number[]; total: number }>;
}

// Core functions (port from score_final.py)
function placeCouples(marks: Marks, currentMark: number, placesToAward: number): SingleDanceResult;
function singleDance(marks: Marks): SingleDanceResult;
function multiDance(results: SingleDanceResult[], allMarks: Marks[]): MultiDanceResult;

// Preliminary round
function tallyCallbacks(marks: Map<string, boolean[]>): Array<{ coupleId: string; total: number }>;
```

### Results Workflow
1. All judges submit marks for a round
2. System auto-computes results (calls scoring engine)
3. Results stored in `callback_results`/`final_results` + `tabulation_tables`
4. `round_results_meta` set to `computed`
5. Scrutineer reviews results and tabulation tables
6. Scrutineer can re-trigger computation if marks were corrected
7. Scrutineer publishes results → `round_results_meta` set to `published`
8. Published results visible to competitors on the results page
