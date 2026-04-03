# Implementation Phases

Each phase is independently deployable and builds on the previous one.

---

## Phase 1: Foundation
Competition CRUD, schedule builder, and event management.

**Goal**: Organizers can create and fully configure a competition structure.

- [ ] Database schema: competitions, competition_days, schedule_blocks, events, event_dances
- [ ] Enums: competition status, schedule block type, dance style, round type, staff roles
- [ ] Competition CRUD router (create, update, delete, get, list)
- [ ] Schedule builder: default 1-day template, add/remove days, add/rename/reorder sessions and breaks
- [ ] Event management: generate default events from style/level grouping rules, allow organizer overrides
- [ ] Staff assignment schema + router (scrutineer, chairman, judges, emcee, deck captains, registration)
- [ ] Dashboard page with checklist/timeline view and navigation to sub-pages
- [ ] Competition home/info page (public-facing)
- [ ] Rules page (organizer-editable, public-viewable)

**Key decisions**: Default event grouping rules are defined as application config (not database), applied when generating events for a new competition. Organizer edits are stored per-competition.

---

## Phase 2: Registration & Entries
Couple registration, TBA finder, payment tracking, competitor numbers.

**Goal**: Competitors can register, enter events, and pay.

- [ ] Database schema: entries, competitor_numbers, tba_listings, team_match_submissions, pricing_tiers, payments
- [ ] Registration router: one partner registers both, partner notification, partner can modify/remove
- [ ] Org affiliation selection for couples in different orgs
- [ ] Unaffiliated entry support
- [ ] Payment tracking: flat fee with optional tiers (student, spectator), manual override for cash
- [ ] Competitor number assignment: auto-assign from start number, exclusions, manual override
- [ ] TBA finder: post looking-for-partner listings (level, style, role), browse listings
- [ ] Team match request page (text submission)
- [ ] Registration page UI
- [ ] Entries list page (public, grouped by event)

---

## Phase 3: Pre-comp Operations
Add/drop management, schedule generation from entries.

**Goal**: Handle the period between entries closing and comp day.

- [ ] Database schema: add_drop_requests
- [ ] Add/drop form (competitor-facing): submit change requests after entries close
- [ ] Add/drop management (organizer-facing): review requests, approve/reject
  - [ ] Auto-approve changes that don't affect round structure
  - [ ] Separate review for changes that would add preliminary rounds
- [ ] Schedule generation: estimate event times based on entry counts
- [ ] Organizer can manually adjust estimated times
- [ ] Round/heat generation: based on max final size and max heat size settings
  - [ ] Determine if event needs preliminary rounds
  - [ ] Split large preliminary rounds into heats
- [ ] Ribbon/award calculator: compute awards needed based on entries and final sizes
- [ ] Stats page: competitor count, entry count, event count

---

## Phase 4: Scoring Engine
Port skating system to TypeScript. Pure logic, no UI.

**Goal**: Fully tested scoring engine that can compute results for any round type.

- [ ] Port `score_final.py` to TypeScript in `src/domains/competitions/lib/scoring/`
- [ ] `placeCouples()` — Rules 5-8: single dance placement using majority system
- [ ] `singleDance()` — Score a single dance, compute point values for ties
- [ ] `multiDance()` — Rules 9-11: multi-dance event scoring (sum placements, tiebreak with place counts, Rule 11 smushed marks)
- [ ] Helper functions: majority calculation, relevant marks, tiebreakers
- [ ] Callback tallying for preliminary rounds (count marks, determine advancement)
- [ ] Ties through Rule 11 simply stand (no further resolution)
- [ ] Comprehensive test suite covering:
  - [ ] Clear majority (Rule 5)
  - [ ] Multiple majorities (Rule 6)
  - [ ] Equal majorities / sum tiebreak (Rule 7)
  - [ ] No majority (Rule 8)
  - [ ] Multi-dance with clean results (Rule 9)
  - [ ] Multi-dance ties (Rule 10)
  - [ ] Rule 11 tiebreak (smushed marks)
  - [ ] Unbreakable ties
  - [ ] Preliminary round callback counting

---

## Phase 5: Judge UI
Tablet-optimized marking pages with real-time submission.

**Goal**: Judges can mark preliminary callbacks and rank finals on tablets.

- [ ] Database schema: callback_marks, final_marks, judge_submissions
- [ ] Judge schedule page
- [ ] Preliminary round marking page:
  - [ ] Display all couple numbers, line dividers between heats
  - [ ] Click cycle: mark -> maybe (visual only) -> unmarked
  - [ ] Submit button with validation (wrong callback count warning)
  - [ ] Post-submit: grey out marks, show edit button
- [ ] Final round marking page:
  - [ ] Display finalist numbers, tap-to-rank interface
  - [ ] Submit/confirm flow (same as prelim)
- [ ] Real-time mark submission via Ably
- [ ] Scrutineer view: see which judges have submitted, review marks
- [ ] Auto-score trigger when all judges submit, scrutineer review before publish

---

## Phase 6: Comp Day Operations
All day-of views and workflows.

**Goal**: Full day-of-competition experience for all staff roles.

- [ ] Scrutineer controls: start/manage sessions, run events, advance rounds
- [ ] Deck captain view (multiple captains, shared real-time state):
  - [ ] Check-in tab: competitors by number, check-in, scratch (reversible)
  - [ ] Stay-on-floor indicators with upcoming event list
  - [ ] Schedule tab
- [ ] Emcee view: schedule, on-deck, results, announcement notes (from emcee/scrutineer/organizer)
- [ ] Registration table view (multiple staff, shared state):
  - [ ] Entry table sorted by org, partners grouped
  - [ ] Payment and check-in indicators
  - [ ] Approve add/drop requests
- [ ] Projector display: unauthenticated URL (`/competitions/[slug]/display`)
  - [ ] Upcoming events, times, couple numbers, heat assignments
  - [ ] Auto-updates via Ably
- [ ] Competitor live view: schedule + on-deck events
- [ ] Ably channel architecture for all real-time views

---

## Phase 7: Post-comp & Global Pages
Results, history, feedback, and discovery.

**Goal**: Complete the competitor experience with results and global navigation.

- [ ] Results page per competition (placements by event, tabulation tables)
- [ ] Click competitor name to view full results history
- [ ] All results by competitor (global search)
- [ ] Competition calendar (upcoming competitions)
- [ ] Past events archive
- [ ] Feedback form (available after comp finishes)
- [ ] Request record removal (competitor can request removal from a comp's results)
- [ ] Participating org pages:
  - [ ] Team entries and schedule
  - [ ] When competitors need to be at venue
  - [ ] Org admin add/drop for members
- [ ] Payment analytics for organizers
