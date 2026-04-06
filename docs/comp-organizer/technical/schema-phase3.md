# Phase 3 Schema: Pre-comp Operations

## New Enums

```
add_drop_type: add, drop
add_drop_status: pending, approved, rejected
```

## Additional columns on `competitions` (schedule estimation settings)

| Column | Type | Notes |
|--------|------|-------|
| minutes_per_couple_per_dance | numeric(4,1), default 1.5 | Used for time estimation |
| transition_minutes | numeric(4,1), default 2.0 | Time between events |

## New Tables

### `add_drop_requests`
Late change requests submitted after entries close.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| submitted_by | text FK -> users | Who submitted (competitor or org admin) |
| type | add_drop_type, not null | add or drop |
| event_id | integer FK -> competition_events | Event to add to or drop from |
| leader_registration_id | integer FK -> competition_registrations | |
| follower_registration_id | integer FK -> competition_registrations | |
| reason | text | Optional reason for the change |
| status | add_drop_status, default 'pending' | |
| reviewed_by | text FK -> users | Staff who approved/rejected |
| reviewed_at | timestamp | |
| affects_rounds | boolean | Computed: would this change push an event past the threshold for adding a preliminary round? |
| created_at | timestamp, default now | |

Index: (competition_id, status)

### `rounds`
Rounds within an event (preliminary rounds, quarter-final, semi-final, final).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| event_id | integer FK -> competition_events (cascade) | |
| round_type | text, not null | '1st_round', '2nd_round', 'quarter_final', 'semi_final', 'final' |
| position | integer, not null | Ordering (1st round = 1, final = last) |
| callbacks_requested | integer | Number of couples to advance (set by chairman, for prelim rounds) |
| status | text, default 'pending' | pending, in_progress, completed |

Index: unique (event_id, position)

### `heats`
Subdivisions of a round when there are too many couples for one heat.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | |
| heat_number | integer, not null | 1, 2, 3, etc. |
| status | text, default 'pending' | pending, in_progress, completed |

Index: unique (round_id, heat_number)

### `heat_assignments`
Which couples are in which heat.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| heat_id | integer FK -> heats (cascade) | |
| entry_id | integer FK -> entries | |

Index: unique (heat_id, entry_id)

### `event_time_overrides`
Manual time overrides for specific events (overrides the computed estimate).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| event_id | integer FK -> competition_events (cascade), unique | |
| estimated_minutes | numeric(5,1), not null | Manually set duration for this event |

## Key Design Decisions

### Add/Drop Access
- Either partner in the couple can submit
- Org admins can submit for any couple registered under their org
- Remember: couples register under a single org (chosen at registration time between both partners' orgs)

### Add/Drop Review Workflow
1. Request submitted → `affects_rounds` is computed automatically:
   - For **add** requests: would adding this couple push the event past `max_final_size`, requiring a preliminary round that doesn't currently exist?
   - For **drop** requests: would removing this couple eliminate the need for an existing preliminary round?
2. Requests that **don't affect round structure** → shown in a "safe to approve" section, with an "approve all" button
3. Requests that **do affect round structure** → shown in a separate section for individual review
4. Organizer/scrutineer/registration staff can approve or reject

### Round/Heat Generation
- Triggered after entries close (or manually by organizer/scrutineer)
- For each event:
  - If entries <= `max_final_size` → create a single `final` round, no heats
  - If entries > `max_final_size` → determine how many preliminary rounds are needed
    - Work backward: final needs <= max_final_size couples
    - Semi-final recalls ~50-60% to final
    - Quarter-final recalls ~50-60% to semi
    - Additional rounds as needed
  - For each preliminary round, if entries > `max_heat_size` → split into heats
  - Heat assignment: distribute couples across heats as evenly as possible
- Organizer/scrutineer can manually adjust round structure and heat assignments

### Schedule Time Estimation
- Default formula: `(couples_in_event * dances_in_event * minutes_per_couple_per_dance) + transition_minutes`
- `minutes_per_couple_per_dance` and `transition_minutes` are competition-wide settings with sensible defaults
- Per-event overrides via `event_time_overrides` table
- For events with multiple rounds: estimate includes all rounds (prelims + final)
- Times flow through the schedule: first event in a session starts at session start time, subsequent events start after previous event's estimated end
- Organizer can manually adjust session start times on `schedule_blocks`

### Ribbon/Award Calculator
- No schema needed — computed at query time from entries and event settings
- For each event: based on max_final_size and entry count, calculate:
  - Number of finalist ribbons (places 4 through max_final_size, 2 per couple)
  - Number of medals (places 1-3, 2 per couple)
  - Apply configurable buffer percentage
- Aggregated across all events for total award needs
