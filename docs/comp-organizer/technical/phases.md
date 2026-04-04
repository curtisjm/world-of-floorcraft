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

**Backend** (implemented):
- [x] Database schema: add_drop_requests, rounds, heats, heat_assignments, event_time_overrides
- [x] New enums: add_drop_type (add, drop), add_drop_status (pending, approved, rejected), round_status (pending, in_progress, completed), round_type (1st_round, 2nd_round, quarter_final, semi_final, final)
- [x] Competitions table additions: minutesPerCouplePerDance (default 1.5), transitionMinutes (default 2.0)
- [x] Add/drop router: submit (partner or org admin), approve, reject, approveAllSafe (bulk approve non-round-affecting requests), listByCompetition (grouped: safe/needsReview/resolved), listByRegistration
- [x] Round router: generateForCompetition, generateForEvent (auto round structure + heat assignments), addRound, removeRound, update, reassignHeats, moveEntry, listByEvent (public), getById
- [x] Schedule estimation router: getEstimatedSchedule (public, computed from entries/dances/settings), updateCompSettings, setEventOverride, removeEventOverride
- [x] Stats router: getCompetitionStats (registrations, entries, events, entries per event, registrations by org, payment summary)
- [x] Awards router: calculate (medals + ribbons per event and aggregate, with configurable buffer percentage, no database writes)
- [x] Integration tests: 28 tests across 5 test files (add-drop, round, schedule-estimation, stats, awards)

**Frontend** (not yet started):
- [ ] Add/drop form (competitor-facing)
- [ ] Add/drop management page (organizer-facing, with safe/needs-review grouping)
- [ ] Schedule estimation page with time visualization
- [ ] Round/heat management page
- [ ] Stats dashboard
- [ ] Award calculator page

**Key decisions**:
- Add/drop requests can only be submitted when competition is in `entries_closed` status. Either partner or an org admin for the couple's affiliated org can submit.
- `affectsRounds` is computed at submission time: an "add" affects rounds if it would push entry count past maxFinalSize; a "drop" affects rounds if it would bring count back down to maxFinalSize.
- `approveAllSafe` bulk-approves only requests where `affectsRounds` is false, providing a fast path for routine changes.
- Round generation works backward from the final: if entries > maxFinalSize, preliminary rounds are added. Each prelim assumes ~55% advancement rate. Only the first round gets heat assignments; subsequent rounds are populated as couples advance.
- Heats are distributed round-robin across `ceil(entries / maxHeatSize)` heats for even distribution.
- Schedule estimation formula: `entries × dances × minutesPerCouplePerDance + transitionMinutes`. Per-event overrides via `event_time_overrides` table take precedence. Multi-round events sum all round estimates.
- Award calculator is pure computation (no database writes): medals for places 1-3, finalist ribbons for places 4+, 2 awards per couple (leader + follower), with configurable buffer percentage.
- round_type and round_status promoted from plain text to pgEnums for type safety.

---

## Phase 4: Scoring Engine
Port skating system to TypeScript. Scoring router for mark submission and result computation.

**Goal**: Fully tested scoring engine that can compute results for any round type.

**Backend** (implemented):
- [x] Database schema: callback_marks, final_marks, judge_submissions, callback_results, final_results, tabulation_tables, round_results_meta
- [x] New enums: mark_status (pending, submitted, confirmed), result_status (computed, reviewed, published)
- [x] Scoring engine library (`src/domains/competitions/lib/scoring/`):
  - [x] `placeCouples()` — Rules 5-8: recursive majority-based single dance placement
  - [x] `singleDance()` — Score a single dance, compute point values for ties
  - [x] `multiDance()` — Rules 9-11: multi-dance event scoring (sum point values, tiebreak with place counts, Rule 11 smushed marks)
  - [x] `tallyCallbacks()` — Preliminary round callback counting
  - [x] Ties through Rule 11 simply stand (no further resolution)
- [x] Scoring router: submitCallbackMarks, submitFinalMarks, getSubmissionStatus, computeCallbackResults, computeFinalResults, getResults, getCallbackResults, reviewResults, publishResults
- [x] Unit tests: 15 tests covering Rules 5-11, callbacks, ties, edge cases, multi-dance scenarios
- [x] Integration tests: 14 tests covering mark submission, result computation, workflow, authorization

**Frontend** (not yet started):
- [ ] Results display page with tabulation tables
- [ ] Scrutineer results review and publish UI

**Key decisions**:
- Marks (raw judge input) and results (computed output) are stored separately. Results can be recomputed if marks are corrected.
- Tabulation tables are stored as JSONB for display, avoiding recomputation on every view.
- Final mark submission uses delete-then-insert per dance/judge to avoid unique constraint violations when swapping placements.
- Results workflow: computed → reviewed (by scrutineer) → published (visible to competitors).
- The scoring engine is a pure library with no database dependencies — the router handles all DB interaction.
- Point values for ties use averaged positions (e.g., tied for 1st/2nd → both get 1.5), critical for multi-dance scoring.

---

## Phase 5: Judge UI
Tablet-optimized marking pages with real-time submission.

**Goal**: Judges can mark preliminary callbacks and rank finals on tablets.

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
