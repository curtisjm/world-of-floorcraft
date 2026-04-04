# Implementation Phases

Each phase is independently deployable and builds on the previous one.

---

## Phase 1: Foundation
Competition CRUD, schedule builder, and event management.

**Goal**: Organizers can create and fully configure a competition structure.

**Backend** (implemented):
- [x] Database schema: competitions, competition_days, schedule_blocks, competition_events, event_dances, judges, competition_staff, competition_judges
- [x] Enums: competition_status, schedule_block_type, competition_staff_role, dance_style, event_type
- [x] Competition CRUD router: create (auto-slug), update, delete (owner only), getBySlug, list (with pagination/filters), getForDashboard
- [x] Status transitions: updateStatus (any direction, no data deleted on backward transitions)
- [x] Judge tablet auth setup: setCompCode, setMasterPassword (bcrypt hashed)
- [x] Schedule builder: applyDefaultTemplate (6 sessions), addDay/updateDay/removeDay, addBlock/updateBlock/removeBlock, reorderDays/reorderBlocks
- [x] Event management: generateDefaults from style/level grouping config, create/update/delete, reorderInSession, updateDances
- [x] Default event generation config: `src/domains/competitions/lib/default-events.ts` — grouping rules for Standard, Smooth, Latin, Rhythm across all 7 levels
- [x] Staff assignment router: assign/remove platform users to roles
- [x] Judge directory + competition assignments: global judge CRUD, search, assignToCompetition/removeFromCompetition
- [x] Integration tests: 40 tests across 5 test files (competition, schedule, event, staff, judge)

**Frontend** (not yet started):
- [ ] Dashboard page with checklist/timeline view and navigation to sub-pages
- [ ] Competition home/info page (public-facing)
- [ ] Rules page (organizer-editable, public-viewable)
- [ ] Creation wizard UI (multi-step: basic info → schedule → events → details → publish)
- [ ] Schedule builder UI (drag-and-drop reordering)
- [ ] Event management UI (generate defaults, prune, edit groupings)
- [ ] Staff/judge assignment UI

**Key decisions**:
- Default event grouping rules are defined as application config (not database), applied when generating events for a new competition. Organizer edits are stored per-competition.
- `requireCompOrgRole` permission check: org admin/owner OR assigned scrutineer can manage a competition. Duplicated per-router for self-containment.
- Reorder operations use a two-pass approach (set to negative positions, then final positions) to avoid unique constraint violations on position indexes.
- `sessionId` on `competition_events` uses `onDelete: "set null"` — removing a schedule block unlinks events rather than deleting them.
- `competitions.compCode` is globally unique (not per-org) since it's the tablet auth entry point.
- `competition_days.date` uses string mode to avoid timezone-shift issues with date-only values.
- bcryptjs used for master password hashing (added as dependency).

---

## Phase 2: Registration & Entries
Couple registration, TBA finder, payment tracking, competitor numbers.

**Goal**: Competitors can register, enter events, and pay.

**Backend** (implemented):
- [x] Database schema: competition_registrations, entries, payments, pricing_tiers, tba_listings, team_match_submissions
- [x] New enums: pricing_model (flat_fee, per_event), dance_role (leader, follower), payment_method (online, cash, check, other)
- [x] Competitions table additions: pricingModel, requirePaymentAtRegistration, stripeAccountId, stripeOnboardingComplete
- [x] Competition_events addition: entryPrice (for per-event pricing)
- [x] Shared auth helpers extracted to `src/domains/competitions/lib/auth.ts`: requireCompOrgRole, requireCompStaffRole
- [x] Registration router: register (self + optional partner by username), getMyRegistration, listByCompetition, getById, updateOrgAffiliation, updateTier, toggleCheckedIn, cancel
- [x] Entry router: create, remove, scratch (staff only), bulkCreate, listByEvent (public, with SQL joins for names/numbers), listByRegistration, listByCompetition
- [x] Payment router: recordManual, recordRefund (negative amounts), listByRegistration, summaryByCompetition (aggregate stats), createCheckoutSession (Stripe), createConnectAccount, getConnectStatus
- [x] Number router: autoAssign (respects numberStart/exclusions, leaders-with-entries only), manualAssign, unassign, listAssignments, updateSettings
- [x] TBA router: create, markFulfilled, delete (own only), listByCompetition (public, filterable by style)
- [x] Team match router: submit, delete (own only), listByCompetition (staff only)
- [x] Integration tests: 32 tests across 6 test files (registration, entry, payment, number, tba, team-match)
- [x] Stripe v22.0.0 added as dependency

**Frontend** (not yet started):
- [ ] Registration page UI
- [ ] Entries list page (public, grouped by event)
- [ ] Payment page (Stripe checkout flow + manual payment UI)
- [ ] Competitor number management page
- [ ] TBA finder page
- [ ] Team match submission page

**Key decisions**:
- Registration is per-person, not per-couple. One partner registers both by providing the other's username, creating two linked registration rows. Either partner can later modify entries.
- Entries link two registrations (leader + follower) to an event. The leader/follower distinction is enforced by schema (separate foreign keys) and used for number assignment.
- Pricing supports two models: flat_fee (single base fee) and per_event (fee per event entered). `recalcAmountOwed()` in the entry router recalculates whenever entries change under per-event pricing.
- Competitor numbers are assigned only to leaders who have at least one entry. Auto-assign starts from `numberStart` (default 1), skipping any numbers in the `numberExclusions` array.
- Stripe Connect (Express accounts) is used for online payments. Lazy `getStripe()` initialization avoids errors in environments without STRIPE_SECRET_KEY.
- Refunds are stored as negative payment amounts, keeping the payment ledger append-only.
- Auth helpers extracted to shared module (`lib/auth.ts`) for Phase 2+ routers. Phase 1 routers still have inline versions (will be consolidated in a future cleanup).
- `entry.listByEvent` uses raw SQL joins to return leader/follower display names and competitor numbers in a single query, avoiding N+1 queries.
- Partial unique index on `competitor_number` (WHERE NOT NULL) allows multiple null values while enforcing uniqueness for assigned numbers.

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
