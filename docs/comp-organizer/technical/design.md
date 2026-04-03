# Competition Organizer — Design Document

Linear issue: WOF-13

## Overview
Building competition organizing, judging, and results functionality. This is a new `competitions` domain. Competitions are owned by organizations (only org admins/owners can create them). Scoring uses the skating system (reference: `skating-system.pdf`, `score_final.py`).

---

## Competition Structure

### Ownership & Permissions
- Only org admins/owners can create a competition
- Competition is always associated with an organization

### Competition Lifecycle States
1. **Draft** — being set up by organizer
2. **Advertised** — posted on org page, visible to public
3. **Accepting entries** — registration open
4. **Entries closed** — add/drop form available for late changes
5. **Running** — live judging, sessions active, on-deck views
6. **Finished** — results published, feedback form available

### Location
- Structured address (street, city, state, zip, country)
- Additional venue info (parking, directions, notes)
- Future: map integration

---

## Schedule Model

### Structure
```
competition
  └── competition_days (day 1, day 2, ...)
        └── schedule_blocks (ordered within a day)
              - type: "session" | "break"
              - label: e.g. "Smooth", "Lunch"
              - estimated_start_time (calculated from entries, adjustable)
              - position (ordering)
```

Events are assigned to session blocks.

### Default 1-Day Template
Sessions in order: Smooth, Standard, Latin, Rhythm, Nightclub, Open Events

Organizers can:
- Rename sessions
- Reorder sessions
- Add additional days
- Add labeled breaks (lunch, dinner, etc.)
- Modify session contents

---

## Styles and Dances

### Standard
Waltz, Tango, Foxtrot, Quickstep, Viennese Waltz

### Smooth
Waltz, Tango, Foxtrot, Viennese Waltz

### Latin
Cha Cha, Samba, Rumba, Paso Doble, Jive

### Rhythm
Cha Cha, Rumba, Swing, Bolero, Mambo

### Nightclub
TBD — all single dances

---

## Event Groupings (Default, Overridable by Organizer)

Events are either **single-dance** (scored independently) or **multi-dance** (scored together via skating system Rules 9-11). Parentheses indicate grouped multi-dance events; unlisted dances at that level are single-dance events.

### Standard
| Level | Grouped Events | Remaining Singles |
|-------|---------------|-------------------|
| Newcomer | — | All single |
| Bronze | — | All single |
| Silver | (Waltz, Quickstep) | Tango, Foxtrot, V. Waltz |
| Gold | (Waltz, Tango, Quickstep) | Foxtrot, V. Waltz |
| Novice | (Waltz, Foxtrot, Quickstep) | Tango, V. Waltz |
| Prechamp | (Waltz, Tango, Foxtrot, Quickstep) | V. Waltz |
| Champ | (All dances) | — |

### Smooth
| Level | Grouped Events | Remaining Singles |
|-------|---------------|-------------------|
| Newcomer | — | All single |
| Bronze | — | All single |
| Silver | — | All single |
| Gold | (Waltz, Foxtrot) | Tango, V. Waltz |
| Novice | (Waltz, Tango, Foxtrot) | V. Waltz |
| Prechamp | (All dances) | — |
| Champ | (All dances) | — |

### Latin
| Level | Grouped Events | Remaining Singles |
|-------|---------------|-------------------|
| Newcomer | — | All single |
| Bronze | — | All single |
| Silver | (Cha Cha, Rumba) | Samba, Paso Doble, Jive |
| Gold | (Cha Cha, Samba, Rumba) | Paso Doble, Jive |
| Novice | (Cha Cha, Samba, Rumba) | Paso Doble, Jive |
| Prechamp | (Cha Cha, Samba, Rumba, Jive) | Paso Doble |
| Champ | (All dances) | — |

### Rhythm
| Level | Grouped Events | Remaining Singles |
|-------|---------------|-------------------|
| Newcomer | — | All single |
| Bronze | — | All single |
| Silver | (Cha Cha, Rumba) | Swing, Bolero, Mambo |
| Gold | (Cha Cha, Rumba, Swing) | Bolero, Mambo |
| Novice | (Cha Cha, Rumba, Swing) | Bolero, Mambo |
| Prechamp | (Cha Cha, Rumba, Swing, Bolero) | Mambo |
| Champ | (All dances) | — |

### Nightclub
All levels: all single dances (dances TBD)

---

## Events & Entries

### Events
An **event** is a specific competition unit: level + style + dance(s). It's either:
- **Single-dance event** (e.g. Gold Standard Foxtrot) — scored standalone via Rules 5-8
- **Multi-dance event** (e.g. Gold Standard Waltz/Tango/Quickstep) — scored via Rules 9-11

The default grouping tables define which events a competition offers. Organizers can override.

### Entries
- Entries are at the **event level** (not individual dances)
- A competitor can enter multiple events (e.g. Gold Standard W/T/Q multi-dance AND Gold Standard Foxtrot single)
- Competitors enter as couples (leader + follower)
- Not required to be in an org to enter (can enter unaffiliated)
- If couple members belong to different orgs, they choose which org to enter under
- This org choice determines which org's team list they appear on

---

## Rounds & Heats

- If too many entries for a straight final: 1st round -> 2nd round -> ... -> Quarter-final -> Semi-final -> Final
- Organizer sets max final size and max preliminary heat size
- If a preliminary round has more couples than max heat size, split into multiple heats
- Preliminary rounds: judges mark callbacks (select couples to advance)
- Final rounds: judges rank all couples (skating system)

---

## Registration & Payment

### Couple Registration Flow
1. One partner registers both (enters partner's user ID/username)
2. Partner gets a notification of the entry
3. Partner can later modify or remove entries they were added to
4. Neither partner needs to be in an org (can enter unaffiliated)
5. If partners are in different orgs, they select which org to enter under

### TBA (To Be Announced) Finder
- Competitors without a partner can post to a "looking for partner" board
- Input: level, style, role (lead/follow)
- Visible to other competitors at that competition
- Separate from team match

### Team Match
- A fun org-vs-org event where each org sends one couple at a time
- Competitor-facing page is just a text box to submit team match ideas/suggestions
- (Separate from the main competitive events)

### Payment / Pricing
- **Flat competition fee** (one price covers all event entries)
- Organizer can optionally define additional pricing tiers (e.g. student, spectator)
- Registration table can override payment status (e.g. cash payment at door)

---

## Pages — Competition Host

### Dashboard (`/competitions/[slug]/dashboard`)
- Default view: competition checklist / vertical timeline
- Side panel with links to all management pages
- Stats overview (competitors, entries, events)

### Sub-pages (linked from dashboard):
- **Create competition** — wizard: basic info -> sessions -> events -> publish
- **Edit home / event info**
- **Set rules**
- **Manage events / schedule** — generate suggested schedule from entries, manually editable
- **Assign staff** — scrutineer, chairman, judges
- **Payments** — banking info, view payments, analytics
- **Competitor numbers** — set start number, exclusions, manual assignment
- **Ribbon / award calculator** — based on entries and final sizes, calculate awards needed
- **Add/drop management** — review late change requests

---

## Pages — Competitor Facing

### Global Pages (not per-competition)
- **Competition calendar** — upcoming competitions
- **Past events** — archive of completed competitions
- **All results by competitor** — search/view any competitor's full results history
- **Request record removal** — request to remove a comp from your record (e.g. dropped but still checked in by deck captain)

### Per-Competition Pages
- **Home / event info** — competition details, location, dates
- **Rules** — competition rules set by organizer
- **Registration** — enter events as a couple, select org affiliation, payment
- **Entries list** — all entries by event
- **Results** — placements per event, click a name to see their full history
- **Late add/drop form** — submit change requests after entries close
- **Live view (comp day)** — schedule + on-deck events
- **TBA finder** — find a partner for specific events
- **Team match requests** — submit team match ideas (text box)
- **Feedback form** — available after competition ends

---

## Judge Model

Judges do NOT have platform user accounts. They exist in a global judge directory that grows over time as they are used across competitions.

### Judge Authentication (comp day, on tablets)
1. Enter **competition code** — a short identifier (e.g. "OSB" for Ohio Star Ball)
2. Select their name from the list of judges assigned to this competition
3. Enter **master password** — shared password set by organizer/scrutineer

The scrutineer sets up and signs in judges on tablets before the session begins.

### Judge Directory
- Global table of judges (name, affiliation)
- New judges are added when first assigned to any competition
- Future competitions can search/select from existing judges

---

## Pages — Judge Facing

### Judge Schedule
- View assigned events and times

### Marking Pages (tablet-optimized)

**Preliminary rounds:**
- Display all couple numbers on one page
- If multiple heats, show all numbers with a line dividing heats
- Click cycle: 1st click = marked (callback), 2nd click = maybe (visual only, NOT a mark if submitted), 3rd click = remove mark
- Submit button: when clicked while round still running, greys out marks and becomes an "Edit" button
- **Validation on submit**: if judge selected wrong number of callbacks, show warning with count selected vs count expected, with two buttons: "Submit anyway" and "Continue selecting"

**Final rounds:**
- Display finalist numbers at the top
- Tap a number, then tap a position in the ranking list to place them
- Submit/confirm flow same as prelim (grey out + edit button)

---

## Pages — Scrutineer / Tech Manager

### Permissions
- Same edit access as competition organizer at all times
- Responsible for running day-of comp activities (not exclusive, but primary operator)

### Day-of Responsibilities
- Ensure judge accounts are active and ready
- Start/manage sessions
- Run events (advance rounds, trigger heats)
- Review auto-calculated scores and publish results
- Make day-of event/entry changes (move events, adjust entries, etc.)

### Scoring Workflow
1. All judges submit marks for an event/round
2. Scoring calculates automatically
3. Scrutineer reviews tabulation table
4. Scrutineer can override if needed
5. Scrutineer publishes results

### Tiebreaking
- If a tie persists through Rule 11, the tie stands (no dance-off or Chairman resolution)
- Tied couples are awarded the same position

---

## Pages — Chairman

- Manage judges (assign, remove)
- Set judge schedule (which judges on which events)
- No digital tiebreaking role — ties that survive Rule 11 simply stand

---

## Pages — Emcee

- Schedule / on-deck info during events (real-time, same data as projector)
- Results display after session ends
- **Announcement notes**: emcee, scrutineer, and comp organizer can all add notes/reminders for the emcee
  - Notes can be tied to specific events or times
  - Displayed prominently on the emcee's view

---

## Pages — Deck Captain

Multiple deck captains can be assigned; all share the same real-time state.

### Check-in Tab
- Competitors ordered by number within the current/upcoming event
- Click to check in (cosmetic only — does not affect event participation)
- Scratch option: crosses out / greys out entry, but reversible (can add back)
- **Stay-on-floor indicators**: if a competitor needs to stay for the next event, highlight their name with a distinct color/indicator and show which upcoming events they're in

### Schedule Tab
- Upcoming events with estimated times
- Couple numbers listed horizontally under each event

---

## Projector Display

- **Unauthenticated URL**: `/competitions/[slug]/display` — no login required, shareable link
- Shows upcoming events, estimated times, and couple numbers
- If there are heats, show which heat each couple is in
- Auto-updates in real-time as schedule progresses

---

## Registration Table (Comp Day)

Multiple staff can work simultaneously with shared real-time state.

- Main view: table of entries sorted by organization, partners grouped together within org
- **Payment indicator** per person (with manual override for cash/other)
- **Check-in indicator**: whether person has been checked in and received their number
- Can approve add/drop form change requests

---

## Scoring Engine

Port `score_final.py` to TypeScript:
- `placeCouples()` — Rules 5-8 for single dance scoring
- `singleDance()` — score a single dance, compute point values for ties
- `multiDance()` — Rules 9-11 for multi-dance event scoring
- Helper functions for majority calculation, relevant marks, tiebreaking
