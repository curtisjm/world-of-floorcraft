# Phase 6 Schema: Comp Day Operations

## New Enums

```
checkin_type: registration, deck_captain
announcement_note_type: text, break
```

## Tables

### `registration_checkins`
Registration table check-in — person showed up, received number, handled payment.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| registration_id | integer FK -> competition_registrations (cascade) | |
| checked_in_by | text FK -> users | Staff member who checked them in |
| checked_in_at | timestamp, default now | |

Index: unique (registration_id) — can only check in once

Notes:
- This is the "they arrived at the venue" check-in at the registration table
- Separate from deck captain check-in (per-event, on-floor readiness)
- The `checked_in` boolean on `competition_registrations` (Phase 2) is kept in sync as a denormalized flag for quick queries

### `deck_captain_checkins`
Per-event, per-entry on-floor readiness check. Done by deck captains right before each event.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| round_id | integer FK -> rounds (cascade) | Which round they're checking in for |
| entry_id | integer FK -> entries (cascade) | The couple |
| status | text, not null, default 'ready' | 'ready' or 'scratched' |
| checked_in_by | text FK -> users | Deck captain who marked them |
| updated_at | timestamp, default now | |

Index: unique (round_id, entry_id) — one status per couple per round

Notes:
- Idempotent: if two deck captains mark the same couple, second is a no-op
- `status = 'scratched'` means the couple is not dancing this event (reversible — can be set back to 'ready')
- Scratching here is cosmetic/operational — it does not remove their entry or affect scoring. If they don't dance, the judges simply don't mark them.
- Stay-on-floor logic is computed at query time: check if an entry's leader or follower appears in any upcoming round in the current session

### `announcement_notes`
Inline announcements inserted into the schedule. Visible to emcee, projector, and live view.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| day_id | integer FK -> competition_days (cascade) | Which day |
| position_after_event_id | integer FK -> competition_events | Note appears after this event in the schedule. Null = top of day. |
| content | text, not null | The announcement text |
| created_by | text FK -> users | Emcee, scrutineer, or organizer |
| visible_on_projector | boolean, default true | Whether to show on projector/live view |
| created_at | timestamp, default now | |
| updated_at | timestamp, default now | |

Notes:
- Positioned inline with the schedule — appears between events like a callout
- `position_after_event_id = null` means the note appears at the top of the day (before any events)
- Any of emcee, scrutineer, or org admin/owner can create/edit/delete notes
- `visible_on_projector` allows internal-only notes (emcee reminders) vs public announcements
- Multiple notes can be positioned after the same event (ordered by created_at)

## Ably Channel Architecture (Phase 6 additions)

### `comp:{compId}:live`
Real-time updates for all comp-day views (projector, competitor live view, emcee, deck captain, registration table).

Events:
- **`schedule:updated`** — `{ }` (signal to refetch schedule data — covers event reordering, time changes, etc.)
- **`checkin:registration`** — `{ registrationId, checkedIn: boolean }`
- **`checkin:deck`** — `{ roundId, entryId, status: 'ready' | 'scratched' }`
- **`announcement:created`** — `{ noteId, content, positionAfterEventId }`
- **`announcement:updated`** — `{ noteId, content }`
- **`announcement:deleted`** — `{ noteId }`
- **`event:started`** — `{ eventId, roundId }` (projector/live view: highlight current event)
- **`event:completed`** — `{ eventId }` (move to next in schedule)

Notes:
- This channel is readable by unauthenticated clients (projector display, public live view)
- Ably token for unauthenticated clients: subscribe-only on `comp:{compId}:live` and `comp:{compId}:results`
- Publishing to this channel is done server-side only (from mutation handlers)

### Updated channel summary

| Channel | Publishers | Subscribers |
|---------|-----------|-------------|
| `comp:{compId}:judging` | Server (scrutineer actions) | Judge tablets |
| `comp:{compId}:submissions` | Judge tablets | Scrutineer |
| `comp:{compId}:results` | Server (publish action) | Everyone (public) |
| `comp:{compId}:live` | Server (staff actions) | Everyone (public) — projector, live view, emcee, deck captain, registration |

## Key Design Decisions

### Two Check-in Systems
1. **Registration check-in**: "Did they show up?" — at the registration table, once per person per comp. Handles payment confirmation and number distribution.
2. **Deck captain check-in**: "Are they ready to dance?" — per couple, per round, right before the event. Operational/cosmetic — does not affect scoring.

### Optimistic Updates for Shared State
Deck captain and registration table views use optimistic updates:
- Tap to check in → UI updates immediately → mutation sent to server → Ably broadcasts to other tablets
- If mutation fails: UI rolls back, shows error
- Idempotent operations: two people marking the same couple as "ready" is a no-op, no conflict
- Server is always the source of truth; Ably keeps all clients in sync

### Projector as a Subset of Live View
The projector display and competitor live view show the same data:
- Upcoming events with event number, name, couple numbers
- Inline announcements (where `visible_on_projector = true`)
- Current/next event highlighting

The only difference:
- Projector: unauthenticated, full-screen display mode, no navigation
- Competitor live view: within the app layout. If authenticated, the user's events are highlighted.

### Announcement Notes as Schedule Callouts
Notes are positioned relative to events in the schedule (like callouts in a markdown document):
- Each note has a `position_after_event_id` anchoring it in the schedule
- Renders inline between events in all schedule views
- Can be marked as projector-visible or emcee-only
- Multiple notes can stack after the same event
