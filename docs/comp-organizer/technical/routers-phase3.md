# Phase 3 Routers

## Add/Drop Router (`add-drop.ts`)

### Queries
- **listByCompetition** (protected, staff) — all requests, grouped by:
  1. Safe to approve (doesn't affect rounds) — with "approve all" action
  2. Needs review (affects rounds) — individual review
- **listByRegistration** (protected) — requests involving a specific competitor

### Mutations
- **submit** (protected) — submit an add or drop request.
  - Input: competition_id, type (add/drop), event_id, leader_registration_id, follower_registration_id, reason
  - Validates: competition is in `entries_closed` status, submitter is a partner or org admin for the couple's org
  - Computes `affects_rounds`: checks if adding/dropping would change round structure
- **approve** (protected, staff) — approve a request. Creates/removes the entry. Recalculates `amount_owed` if per-event pricing.
- **reject** (protected, staff) — reject a request with optional reason.
- **approveAllSafe** (protected, staff) — bulk approve all requests that don't affect round structure.

---

## Round Router (`round.ts`)

### Queries
- **listByEvent** (public) — all rounds and heats for an event
- **getById** (protected) — round details with heat assignments

### Mutations
- **generateForCompetition** (protected, staff) — auto-generate rounds and heats for all events in the competition based on entry counts and max sizes.
- **generateForEvent** (protected, staff) — auto-generate rounds/heats for a single event.
- **update** (protected, scrutineer) — update round details (callbacks_requested, etc.)
- **addRound** (protected, scrutineer) — manually add a round to an event.
- **removeRound** (protected, scrutineer) — remove a round.
- **reassignHeats** (protected, scrutineer) — redistribute couples across heats in a round.
- **moveEntry** (protected, scrutineer) — move a couple from one heat to another.

---

## Schedule Estimation Router (`schedule-estimation.ts`)

### Queries
- **getEstimatedSchedule** (public) — full schedule with computed time estimates for all events.
  - Uses: competition settings (minutes_per_couple_per_dance, transition_minutes), entry counts, event_time_overrides
  - Returns: each event with estimated start/end time, flowing through sessions

### Mutations
- **updateCompSettings** (protected, org admin/staff) — update minutes_per_couple_per_dance and transition_minutes.
- **setEventOverride** (protected, org admin/staff) — set or update a manual time override for an event.
- **removeEventOverride** (protected, org admin/staff) — remove a manual override (revert to computed estimate).
- **recalculate** (protected, org admin/staff) — force recalculation of all time estimates (useful after entry changes).

---

## Stats Router (`stats.ts`)

### Queries
- **getCompetitionStats** (protected, org admin/staff) — aggregate stats:
  - Total registrations
  - Total entries
  - Total events
  - Entries per event
  - Registrations by org
  - Payment summary (total collected, outstanding)

---

## Award Calculator Router (`awards.ts`)

### Queries
- **calculate** (protected, org admin/staff) — compute award needs for the competition.
  - Input: competition_id, buffer_percentage (default 10%), assumed_final_size (optional, defaults to max_final_size)
  - Returns per-event and aggregate totals:
    - Finalist ribbons: (places 4 through final_size) * 2 per couple
    - Medals: places 1-3, 2 per couple (6 total per event)
    - Buffer applied on top
  - No database writes — computed on the fly
