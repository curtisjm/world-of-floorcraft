# Phase 6 Routers: Comp Day Operations

Five routers for Phase 6, covering all day-of staff views and public displays.

---

## Scrutineer Dashboard Router (`scrutineer-dashboard.ts`)

Extends the Phase 5 scrutineer router with session/event management. All procedures require scrutineer or org admin/owner role.

### Queries

- **getDashboard** (scrutineer) — Full comp-day dashboard state.
  - Input: `competition_id`
  - Returns: current active round, submission status, schedule with progress indicators (completed/active/upcoming), recent results, judge online status

- **getEventProgress** (scrutineer) — Detailed progress for a specific event.
  - Input: `event_id`
  - Returns: all rounds for this event with status (pending/active/scored/published), entry counts, heat assignments

### Mutations

- **markEventComplete** (scrutineer) — Mark an event as fully complete (all rounds scored and published).
  - Input: `event_id`
  - Publishes: Ably `event:completed` on `comp:{compId}:live`

- **updateScheduleLive** (scrutineer) — Make day-of schedule adjustments (reorder events, update times).
  - Input: `competition_id`, changes array
  - Publishes: Ably `schedule:updated` on `comp:{compId}:live`

---

## Deck Captain Router (`deck-captain.ts`)

All procedures require staff role of `deck_captain` (or scrutineer/org admin/owner).

### Queries

- **getCheckinView** (deck captain) — Check-in list for the current/upcoming round.
  - Input: `competition_id`, `round_id?` (defaults to active round)
  - Returns: entries ordered by couple number, each with:
    - Couple number, leader name, follower name
    - Check-in status (ready/scratched/not yet)
    - Stay-on-floor indicator: boolean + list of upcoming events they're in (within current session)

- **getScheduleView** (deck captain) — Upcoming events with couple numbers.
  - Input: `competition_id`
  - Returns: schedule blocks with events, each event showing couple numbers listed horizontally

### Mutations

- **checkin** (deck captain) — Mark a couple as ready for their event.
  - Input: `round_id`, `entry_id`
  - Behavior: upsert `deck_captain_checkins` with status 'ready' (idempotent)
  - Publishes: Ably `checkin:deck` on `comp:{compId}:live`

- **scratch** (deck captain) — Scratch a couple from a round (reversible).
  - Input: `round_id`, `entry_id`
  - Behavior: upsert `deck_captain_checkins` with status 'scratched'
  - Publishes: Ably `checkin:deck` on `comp:{compId}:live`

- **unscratch** (deck captain) — Reverse a scratch.
  - Input: `round_id`, `entry_id`
  - Behavior: sets status back to 'ready'
  - Publishes: Ably `checkin:deck` on `comp:{compId}:live`

---

## Emcee Router (`emcee.ts`)

All procedures require staff role of `emcee` (or scrutineer/org admin/owner).

### Queries

- **getEmceeView** (emcee) — Schedule with on-deck info and inline announcements.
  - Input: `competition_id`
  - Returns: full schedule with:
    - Events ordered by session/position
    - Inline announcement notes between events
    - Current/next event indicators
    - Published results for completed events (for reading placements)

- **getEventResults** (emcee) — Results for a completed event, formatted for announcement.
  - Input: `event_id`
  - Returns: placements with couple names, numbers, and organizations — ordered for reading aloud (1st through last)

### Mutations

- **createNote** (emcee, scrutineer, org admin) — Add an announcement note to the schedule.
  - Input: `competition_id`, `day_id`, `position_after_event_id` (nullable), `content`, `visible_on_projector` (default true)
  - Publishes: Ably `announcement:created` on `comp:{compId}:live`

- **updateNote** (emcee, scrutineer, org admin) — Edit an announcement note.
  - Input: `note_id`, `content?`, `position_after_event_id?`, `visible_on_projector?`
  - Publishes: Ably `announcement:updated` on `comp:{compId}:live`

- **deleteNote** (emcee, scrutineer, org admin) — Remove an announcement note.
  - Input: `note_id`
  - Publishes: Ably `announcement:deleted` on `comp:{compId}:live`

---

## Registration Table Router (`registration-table.ts`)

All procedures require staff role of `registration` (or scrutineer/org admin/owner).

### Queries

- **getRegistrationTable** (registration staff) — Full registration table for the competition.
  - Input: `competition_id`, `sort_by?` (default: 'org')
  - Returns: registrations grouped by organization, each person showing:
    - Name, couple number, organization
    - Partner(s) grouped together within org
    - Payment status: amount owed, amount paid, outstanding balance, payment method(s)
    - Registration check-in status (boolean + timestamp + who checked them in)
    - Number of entries

- **getRegistrationDetail** (registration staff) — Detailed view for a single registration.
  - Input: `registration_id`
  - Returns: full registration info + all entries + all payments + add/drop requests

- **getPendingAddDrops** (registration staff) — Add/drop requests awaiting approval.
  - Input: `competition_id`
  - Returns: pending requests, same as Phase 3 add-drop router but filtered to pending only

### Mutations

- **checkinRegistration** (registration staff) — Mark a person as checked in at the registration table.
  - Input: `registration_id`
  - Behavior: creates `registration_checkins` row, sets `competition_registrations.checked_in = true`
  - Publishes: Ably `checkin:registration` on `comp:{compId}:live`

- **undoCheckin** (registration staff) — Reverse a registration check-in (mistake correction).
  - Input: `registration_id`
  - Behavior: deletes `registration_checkins` row, sets `checked_in = false`
  - Publishes: Ably `checkin:registration` on `comp:{compId}:live`

- **recordPayment** (registration staff) — Record a manual payment (cash, check, card at door).
  - Input: `registration_id`, `amount`, `method` (cash/check/card/other), `notes?`
  - Behavior: creates `payments` row with `processed_by = current user`
  - Publishes: Ably `checkin:registration` on `comp:{compId}:live` (reuses event since payment status changed)

- **approveAddDrop** (registration staff) — Approve a pending add/drop request.
  - Input: `request_id`
  - Behavior: same as Phase 3 add-drop approve

- **rejectAddDrop** (registration staff) — Reject a pending add/drop request.
  - Input: `request_id`, `reason?`

---

## Live View Router (`live-view.ts`)

Public router — no authentication required. Serves the projector display and competitor live view.

### Queries

- **getSchedule** (public) — Full live schedule for the competition.
  - Input: `competition_id`
  - Returns: schedule blocks with events, each event showing:
    - Event number, name (level + style + dances)
    - Couple numbers listed
    - Heat assignments (if applicable)
    - Status: upcoming / in-progress / completed
    - Inline announcement notes (only where `visible_on_projector = true`)

- **getMyEvents** (protected, optional) — Highlighted view for an authenticated competitor.
  - Input: `competition_id`
  - Returns: same as `getSchedule` but with a `isMyEvent` flag on events where the current user is entered
  - Falls back to regular schedule if user has no entries

- **getAblyToken** (public) — Get a subscribe-only Ably token for live updates.
  - Returns: Ably token with subscribe permissions on:
    - `comp:{compId}:live`
    - `comp:{compId}:results`

### No mutations — all live view data is read-only. Updates come via Ably subscriptions from staff actions.

---

## Projector Display

Not a separate router — uses `live-view.getSchedule` and `live-view.getAblyToken`.

Page at `/competitions/[slug]/display`:
- No authentication required
- Full-screen layout optimized for projection
- Shows upcoming events with couple numbers and inline announcements
- Current event highlighted
- Auto-updates via Ably subscription to `comp:{compId}:live` and `comp:{compId}:results`
- No navigation, no interactive elements
