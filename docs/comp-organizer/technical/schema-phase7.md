# Phase 7 Schema: Post-comp & Global Pages

## New Enums

```
feedback_question_type: text, rating, multiple_choice, yes_no
record_removal_status: pending, approved, rejected
```

## Tables

### `feedback_forms`
Organizer-defined feedback form for a competition. One form per competition.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade), unique | |
| title | text, not null, default 'Competition Feedback' | |
| description | text | Optional intro text shown to competitors |
| created_at | timestamp, default now | |
| updated_at | timestamp, default now | |

### `feedback_questions`
Individual questions within a feedback form.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| form_id | integer FK -> feedback_forms (cascade) | |
| question_type | feedback_question_type, not null | text, rating, multiple_choice, yes_no |
| label | text, not null | The question text |
| options | text[] | For multiple_choice: the answer options. Null for other types. |
| required | boolean, default false | |
| position | integer, not null | Ordering within the form |

Index: unique (form_id, position)

### `feedback_responses`
One response per competitor per competition.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| form_id | integer FK -> feedback_forms (cascade) | |
| user_id | text FK -> users | Competitor who submitted |
| submitted_at | timestamp, default now | |

Index: unique (form_id, user_id) — one response per person per comp

### `feedback_answers`
Individual answers within a response.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| response_id | integer FK -> feedback_responses (cascade) | |
| question_id | integer FK -> feedback_questions (cascade) | |
| value | text, not null | Stringified answer (text content, rating number, selected option, "true"/"false") |

Index: unique (response_id, question_id)

### `record_removal_requests`
Competitor requests to remove themselves from a competition's results. Reviewed by platform admin only.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| user_id | text FK -> users, not null | Competitor requesting removal |
| competition_id | integer FK -> competitions, not null | |
| entry_id | integer FK -> entries | Specific entry, or null for all entries |
| reason | text, not null | Why they want removal |
| status | record_removal_status, default 'pending' | |
| reviewed_by | text FK -> users | Platform admin who reviewed |
| reviewed_at | timestamp | |
| review_notes | text | Admin notes on decision |
| created_at | timestamp, default now | |

Index: unique (user_id, competition_id) WHERE status = 'pending' — one pending request per person per comp

## Default Feedback Template

When an organizer creates a feedback form, the system generates these default questions (organizer can edit, remove, or add more):

1. **Overall Experience** (rating) — "How would you rate your overall experience?"
2. **Venue** (rating) — "How would you rate the venue?"
3. **Organization** (rating) — "How would you rate the organization and scheduling?"
4. **Judging** (rating) — "How would you rate the judging quality?"
5. **Would Attend Again** (yes_no) — "Would you attend this competition again?"
6. **Comments** (text) — "Any additional comments or suggestions?"

## Key Design Decisions

### Feedback Form Builder
- One form per competition, organizer-configurable
- Default template provided as a starting point — organizer can customize freely
- Four question types cover most feedback needs without overcomplicating the builder
- Rating type is always 1-5 (consistent scale, simplifies analytics)
- All answers stored as text strings for uniform storage — parsed by type when displaying analytics
- Form is only accessible to competitors after competition status is `finished`

### Record Removal — Platform Admin Only
- Competitors submit requests with a reason
- Only platform admin can approve/reject — not the competition organizer
- Use case: competitor was checked in by deck captain but didn't actually dance, or wants results removed for personal reasons
- Approval removes the competitor's entries and results from public display (soft delete — data preserved but hidden)
- Organizers have no visibility into removal requests to keep the process neutral

### No New Tables for Results Display
Results pages (per-competition and per-competitor history) are read-only views built from existing Phase 4 tables:
- `final_results` + `tabulation_tables` → results page with Summary/Marks tabs
- `competition_registrations` + `entries` + `final_results` across competitions → competitor history
- No additional schema needed — these are query-time aggregations

### No New Tables for Calendar/Archive
Competition calendar and past events are query-time views on the existing `competitions` table:
- Calendar: `WHERE status IN ('advertised', 'accepting_entries', 'entries_closed', 'running')` with location filters
- Archive: `WHERE status = 'finished'`
