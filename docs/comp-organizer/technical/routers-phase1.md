# Phase 1 Routers

## Competition Router (`competition.ts`)

### Queries
- **getBySlug** (public) — get competition by slug with org info
- **list** (public) — list competitions, filterable by status/org
- **getForDashboard** (protected) — full competition details for organizer dashboard (includes days, sessions, events, staff counts)

### Mutations
- **create** (protected) — create competition in draft status. Requires org admin/owner. Input: name, org_id. Auto-generates slug. Returns the created competition.
- **update** (protected) — update competition fields (name, description, rules, location, settings, pricing). Requires org admin/owner or scrutineer.
- **updateStatus** (protected) — change competition status. Any state transition allowed, no data deleted on backward transitions. Requires org admin/owner or scrutineer.
- **delete** (protected) — soft delete or hard delete a draft competition. Requires org owner.
- **setCompCode** (protected) — set the short competition code for judge tablet auth.
- **setMasterPassword** (protected) — set/update the master password for judge auth.

### Permission checks
- Create: user must be admin or owner of the specified org
- Update/delete: user must be admin/owner of the host org OR assigned as scrutineer

---

## Schedule Router (`schedule.ts`)

### Queries
- **getDays** (public) — get all days for a competition with their schedule blocks
- **getSchedule** (public) — full schedule: days -> blocks -> events (nested)

### Mutations
- **addDay** (protected) — add a day to the competition. Input: date, label. Auto-sets position.
- **updateDay** (protected) — update day date/label.
- **removeDay** (protected) — remove a day (cascades to blocks and event assignments).
- **reorderDays** (protected) — update position ordering for all days.
- **addBlock** (protected) — add a session or break to a day. Input: day_id, type, label. Auto-sets position.
- **updateBlock** (protected) — update block label, type, or times.
- **removeBlock** (protected) — remove a block (unlinks events in that session).
- **reorderBlocks** (protected) — update position ordering for blocks within a day.
- **applyDefaultTemplate** (protected) — generate the default 1-day schedule (Smooth, Standard, Latin, Rhythm, Nightclub, Open Events sessions).

---

## Event Router (`event.ts`)

### Queries
- **listByCompetition** (public) — all events for a competition, grouped by session
- **getById** (public) — single event with its dances

### Mutations
- **generateDefaults** (protected) — given a competition, generate all default events across all styles and levels using the grouping rules. Creates events + event_dances. Organizer prunes afterward.
- **create** (protected) — manually create an event. Input: competition_id, session_id, name, style, level, event_type, dances[].
- **update** (protected) — update event name, session assignment, max sizes, position.
- **delete** (protected) — remove an event and its dances.
- **reorderInSession** (protected) — update position ordering for events within a session.
- **updateDances** (protected) — replace the dances in an event (for changing groupings).

### Default Event Generation Logic
Defined in `src/domains/competitions/lib/default-events.ts` as application config:
- Input: list of styles to include
- Output: events + dances for all levels in those styles, following the grouping rules from the design doc
- Organizer calls generateDefaults, then prunes events they don't want

---

## Staff Router (`staff.ts`)

### Queries
- **listByCompetition** (protected) — all staff assignments for a competition (non-judge roles)

### Mutations
- **assign** (protected) — assign a platform user to a staff role. Input: competition_id, user_id, role.
- **remove** (protected) — remove a staff assignment. Input: competition_id, user_id, role.

---

## Judge Router (`judge.ts`)

### Queries
- **search** (protected) — search global judge directory by name
- **listByCompetition** (protected) — judges assigned to a competition

### Mutations
- **create** (protected) — add a new judge to the global directory. Input: first_name, last_name, affiliation.
- **update** (protected) — update judge details.
- **assignToCompetition** (protected) — assign a judge to a competition.
- **removeFromCompetition** (protected) — remove a judge from a competition.

---

## Creation Wizard Flow

The wizard is a multi-step UI that saves to the database progressively:

### Step 1: Basic Info
- Name, org selection (from user's orgs where they are admin/owner)
- Calls `competition.create` → competition created in `draft` status
- Redirects to `/competitions/[slug]/dashboard` or continues to step 2

### Step 2: Schedule Setup
- Shows default 1-day template (via `schedule.applyDefaultTemplate`)
- Organizer can rename sessions, add/remove breaks, add days
- Each change saves immediately via schedule router mutations

### Step 3: Events
- Calls `event.generateDefaults` to populate all events
- Organizer reviews and removes events they don't want
- Can edit groupings, add custom events

### Step 4: Details (optional, can do from dashboard later)
- Location, description, rules, pricing, settings (max sizes, number start)
- Calls `competition.update`

### Step 5: Publish
- Review summary
- Calls `competition.updateStatus` to move from `draft` → `advertised` (or `accepting_entries`)

Each step is also accessible from the dashboard, so organizers can come back and edit anything at any time.

---

## Competition Status Transitions

Status changes are flexible — organizer can move to any state. No data is deleted on backward transitions.

```
draft <-> advertised <-> accepting_entries <-> entries_closed <-> running <-> finished
```

Moving backward (e.g. `running` → `entries_closed`) preserves all existing data. The status only controls what's visible/available to competitors (e.g. registration form only shows when `accepting_entries`).
