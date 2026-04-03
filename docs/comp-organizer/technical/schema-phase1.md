# Phase 1 Schema: Foundation

## Enums (added to `src/shared/db/enums.ts`)

```
competition_status: draft, advertised, accepting_entries, entries_closed, running, finished
schedule_block_type: session, break
competition_staff_role: scrutineer, chairman, judge, emcee, deck_captain, registration
dance_style: standard, smooth, latin, rhythm, nightclub
event_type: single_dance, multi_dance
```

## Tables

### `competitions`
The main competition entity.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| org_id | integer FK -> organizations | Host organization |
| created_by | text FK -> users | Who created it |
| name | text, not null | |
| slug | text, unique, not null | URL-friendly identifier |
| status | competition_status, default 'draft' | Lifecycle state |
| description | text | Home page content (markdown) |
| rules | text | Rules page content (markdown) |
| venue_name | text | |
| street_address | text | |
| city | text | |
| state | text | |
| zip | text | |
| country | text | |
| venue_notes | text | Parking, directions, etc. (markdown) |
| max_final_size | integer, default 8 | Default max couples in a final |
| max_heat_size | integer | Default max couples per preliminary heat |
| base_fee | numeric(10,2) | Flat registration fee |
| number_start | integer, default 1 | Starting competitor number |
| number_exclusions | integer[] | Numbers to skip |
| created_at | timestamp, default now | |
| updated_at | timestamp, default now | |

### `competition_days`
Days within a competition.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| date | date, not null | |
| label | text | e.g. "Day 1", "Saturday" |
| position | integer, not null | Ordering |

Index: unique (competition_id, position)

### `schedule_blocks`
Sessions and breaks within a day.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| day_id | integer FK -> competition_days (cascade) | |
| type | schedule_block_type, not null | session or break |
| label | text, not null | e.g. "Smooth", "Lunch" |
| position | integer, not null | Ordering within the day |
| estimated_start_time | timestamp | Calculated or manually set |
| estimated_end_time | timestamp | Calculated or manually set |

Index: unique (day_id, position)

### `competition_events`
An event within a competition (single-dance or multi-dance).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| session_id | integer FK -> schedule_blocks | Which session this event is in |
| name | text, not null | Display name, e.g. "Gold Standard W/T/Q" |
| style | dance_style, not null | |
| level | competition_level (existing enum) | |
| event_type | event_type, not null | single_dance or multi_dance |
| position | integer | Ordering within session |
| max_final_size | integer | Override competition default (nullable) |
| max_heat_size | integer | Override competition default (nullable) |

Index: (competition_id, session_id)

### `event_dances`
Dances within an event (1 row for single-dance, multiple for multi-dance).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| event_id | integer FK -> competition_events (cascade) | |
| dance_name | text, not null | e.g. "Waltz", "Cha Cha" |
| position | integer, not null | Order within the event (matters for scoring) |

Index: unique (event_id, position)

### `judges`
Global judge directory. Grows over time as judges are used across competitions. Judges do NOT need user accounts.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| first_name | text, not null | |
| last_name | text, not null | |
| affiliation | text | Organization or country |
| created_at | timestamp, default now | |

Index: (last_name, first_name)

### `competition_staff`
Staff role assignments for non-judge roles. These are platform users with accounts.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| user_id | text FK -> users | |
| role | competition_staff_role, not null | scrutineer, chairman, emcee, deck_captain, registration |
| created_at | timestamp, default now | |

Index: unique (competition_id, user_id, role) — a user can have multiple roles

### `competition_judges`
Judge assignments for a specific competition. References the global judges table.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| judge_id | integer FK -> judges | |
| created_at | timestamp, default now | |

Index: unique (competition_id, judge_id)

### Judge Authentication (comp day)

Judges authenticate on tablets via a lightweight flow (no user account needed):

1. Enter **competition code** (short identifier, e.g. "OSB" for Ohio Star Ball) — stored on `competitions.comp_code`
2. Select their name from the list of judges assigned to this competition
3. Enter **master password** — stored on `competitions.master_password_hash`

The scrutineer sets up tablets and can pre-authenticate judges.

**Additional columns on `competitions`:**

| Column | Type | Notes |
|--------|------|-------|
| comp_code | text, unique | Short identifier for tablet login (e.g. "OSB") |
| master_password_hash | text | Hashed master password for judge auth |

## Notes

- Competitions own their own dance list (event_dances.dance_name) rather than referencing the syllabus domain's dances table. This keeps competitions self-contained and allows custom dances (e.g. nightclub).
- Default event groupings (which dances are grouped at which levels) are defined in application config, not the database. When an organizer creates a competition and selects styles/levels, the system generates default events + event_dances from this config. Organizers can then edit.
- Description, rules, and venue_notes fields store markdown for rich text rendering.
- max_final_size and max_heat_size on competition_events are optional overrides of the competition-wide defaults.
- Judges are a separate entity from platform users — they don't create accounts. A global `judges` table acts as a directory. `competition_judges` assigns judges to specific competitions.
- Judge tablet auth uses a competition code + master password (not per-judge passwords). The scrutineer manages tablet setup.
- Default event generation: system generates all events for selected styles across all levels, organizer prunes what they don't want.
