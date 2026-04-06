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

**Frontend** (implemented):
- [x] Competition discovery page (`/competitions`) with status filter tabs and cursor pagination
- [x] Competition public info page (`/competitions/[slug]`) with venue, rules, pricing, quick links
- [x] Dashboard layout with sectioned sidebar nav (Setup, Entries, Competition)
- [x] Dashboard overview page with status transitions, stat cards, setup checklist
- [x] Creation wizard (`/competitions/create`) — 4-step flow: basic info → schedule → events → review
- [x] Schedule builder with @dnd-kit/react v2 drag-and-drop, day/block CRUD, default template
- [x] Event management with session grouping, generate defaults, create dialog with react-hook-form
- [x] Staff assignment with user search (profile.search), role selector, grouped by role
- [x] Judge management with global directory search, create/edit judges, assign/remove
- [x] Settings page with 4 form sections (general, venue, scoring, pricing) + tablet auth + danger zone

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

**Frontend** (implemented):
- [x] Registration page (`/competitions/[slug]/register`) with partner entry, org selection, bulk event entry, payment info
- [x] Entries list page (`/competitions/[slug]/entries`) — public, grouped by event with couple names
- [x] Payment management dashboard page with summary cards, Stripe Connect setup, manual payment recording
- [x] Competitor number management with auto-assign, manual assign, settings dialog
- [x] TBA finder page (`/competitions/[slug]/tba`) with style/level/role filters, create/delete listings
- [x] Team match page (`/competitions/[slug]/team-match`) with submit/delete ideas

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

**Frontend** (implemented):
- [x] Add/drop form (`/competitions/[slug]/add-drop`) — competitor-facing, submit add/drop requests with event selector
- [x] Add/drop management (dashboard) — organizer-facing, safe/needs-review grouping, batch approve safe, individual approve/reject
- [x] Schedule estimation page with day/block/event time breakdown, configurable settings
- [x] Round management page with generate all/per-event, expandable event cards, heat display, start/complete rounds
- [x] Stats dashboard with stat cards, entries per event, registrations by org
- [x] Award calculator with medals/ribbons per event, buffer percentage, aggregate totals

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

**Frontend** (implemented):
- [x] Public results page (`/competitions/[slug]/results`) with expandable event cards, placement list, tabulation table
- [x] Scoring dashboard page with per-event round list, round detail dialog (submission status, compute callbacks/final, review, publish)

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

**Backend** (implemented):
- [x] Database schema: judge_sessions, active_rounds, mark_corrections
- [x] New enums: judge_session_status, mark_correction_source
- [x] Judge auth library (`src/domains/competitions/lib/judge-auth.ts`): JWT creation/verification with jose, token hashing, session validation
- [x] Ably competition library (`src/domains/competitions/lib/ably-comp.ts`): channel helpers, publishing, scoped token creation for judges and scrutineers
- [x] Judge session router (`judge-session.ts`): authenticate (comp code + master password + judge ID), logout, submitCallbackMarks, submitFinalMarks, getActiveRound, getMySubmission, getAblyToken
- [x] Scrutineer router (`scrutineer.ts`): startRound, stopRound, overrideMarks, unlockJudgeSubmission, reviewResults, publishResults, recomputeResults, getSubmissionStatus, viewJudgeMarks, getResults, getNextRound, getCorrectionHistory
- [x] Competition code validation tightened to 3-4 uppercase characters
- [x] Integration tests: 26 tests across 2 test files (judge-session, scrutineer)

**Frontend** (implemented):
- [x] Judge tablet page (`/judge`) — standalone route, no Clerk auth
  - [x] Auth screen with comp code, master password, judge ID
  - [x] Callback marking page: tap-to-toggle grid (mark/maybe/unmarked), heat dividers, count validation, submit/edit flow
  - [x] Final marking page: tap-to-rank interface with per-dance tabs, placement list, submit/edit flow
  - [x] Waiting screen with auto-refresh for round activation
  - [x] JWT persistence in localStorage for session continuity
- [x] Enhanced scoring dashboard page with scrutineer controls
  - [x] Live panel: active round status, judge submission monitoring (3s polling), start/stop/advance controls
  - [x] Next round preview with auto-determination
  - [x] Round detail dialog with compute/review/publish workflow, callback and final results display, correction history

**Key decisions**:
- Judge authentication is separate from Clerk: judges use a 3-4 character comp code + master password + judge ID. This avoids requiring judges to have platform accounts.
- JWTs are created with `jose` (edge-compatible), expire after 24h, and are scoped to a single competition.
- Only one active session per judge per competition (enforced by partial unique index). Re-login ends the previous session.
- Only one active round per competition at a time (enforced by partial unique index on `active_rounds`).
- Mark corrections use delete-then-insert for final marks to avoid unique constraint violations when swapping placements.
- Ably integration is best-effort: failures don't block mark submission. Judge tablets poll for active round as fallback.
- The scoring dashboard polling (3s) provides near-real-time feedback without requiring Ably subscription on the scrutineer side (Ably subscription can be added as enhancement).

---

## Phase 6: Comp Day Operations
All day-of views and workflows.

**Goal**: Full day-of-competition experience for all staff roles.

**Backend** (implemented):
- [x] Database schema: registration_checkins, deck_captain_checkins, announcement_notes
- [x] Enums: checkin_type, announcement_note_type
- [x] Ably live channel: `comp:{compId}:live` with publishToLive, createPublicAblyToken
- [x] Scrutineer dashboard router: getDashboard, getEventProgress, markEventComplete, updateScheduleLive
- [x] Deck captain router: getCheckinView (with stay-on-floor indicators), getScheduleView, checkin/scratch/unscratch
- [x] Emcee router: getEmceeView, getEventResults, createNote/updateNote/deleteNote
- [x] Registration table router: getRegistrationTable (grouped by org), checkinRegistration/undoCheckin, recordPayment, approveAddDrop/rejectAddDrop
- [x] Live view router (public): getSchedule, getMyEvents (optional auth), getAblyToken, getPublishedResults
- [x] Integration tests: 42 tests across 5 test files (registration-table, deck-captain, emcee, scrutineer-dashboard, live-view)

**Frontend** (implemented):
- [x] Ably competition client hook (`useCompLive`, `useCompLiveWithInvalidation`) — singleton with ref counting, subscribes to live + results channels
- [x] Dashboard nav update — new "Comp Day" section with 4 nav items
- [x] Scrutineer dashboard page — active round card, judge submissions, check-in stats, event progress
- [x] Registration table page — grouped by org, check-in checkboxes, payment recording, add/drop management
- [x] Deck captain page — touch-optimized couple card grid, tap to cycle status, stay-on-floor indicators
- [x] Emcee page — schedule timeline, inline announcements CRUD, results readout for completed events
- [x] Projector display (`/competitions/[slug]/display`) — full-screen dark theme, auto-scroll to active event
- [x] Competitor live view (`/competitions/[slug]/live`) — public schedule, my events toggle, published results

**Key decisions**:
- Two check-in systems: registration (once per person, arrival) vs deck captain (per couple per round, floor readiness)
- `registrationCheckins` table provides audit trail; keeps existing `checkedIn` boolean in sync for backward compat
- Deck captain scratches are operational/cosmetic — don't affect scoring
- Announcement notes are positioned inline in the schedule (anchored to `positionAfterEventId`)
- Stay-on-floor indicator computed at query time by checking if entry's leader/follower appears in next session event
- All mutations publish to `comp:{compId}:live` Ably channel (best-effort)
- Live view uses `publicProcedure` with optional auth for `getMyEvents`
- Public Ably token is subscribe-only on `live` + `results` channels

---

## Phase 7: Post-comp & Global Pages
Results, history, feedback, and discovery.

**Goal**: Complete the competitor experience with results and global navigation.

**Backend** (implemented):
- [x] Results router: getByCompetition, getEventResults (Summary + Marks tabs), getCompetitorHistory, searchCompetitors
- [x] Feedback router: form builder (CRUD), default template, submitResponse, getMyResponse, getResponses, getAnalytics
- [x] Calendar router: getUpcoming (with filters), getPast (paginated), getCompetitionPreview
- [x] Record removal router: submit, listPending, getRequest, approve, reject
- [x] Org competition router: getOrgSchedule, getOrgEntries, getOrgResults, submitAddDrop
- [x] Payment analytics router: getSummary, getPaymentLog (filtered), getOutstanding
- [x] Schema: feedback_forms, feedback_questions, feedback_responses, feedback_answers, record_removal_requests
- [x] Enums: feedback_question_type, record_removal_status
- [x] Integration tests: 64 tests across 6 test files

**Frontend** (implemented):
- [x] Results list page: events grouped by session, top-3 preview, medal colors
- [x] Event results detail: Summary + Marks tabs, per-dance placements, judge tabulation
- [x] Competitor search page: debounced search, competition count badges
- [x] Competitor history page: cross-competition results, record removal dialog (own profile)
- [x] Results browsing page: past competitions with year/style filters, pagination
- [x] Competition discovery: Active/Past tabs, past tab with calendar filters
- [x] Feedback form page: star ratings, yes/no, multiple choice, text questions
- [x] Feedback dashboard: form creation, per-question analytics (ratings, distributions, text)
- [x] Analytics dashboard: entries by event + registrations by org, financial summary + outstanding balances + payment log
- [x] Org competition view: schedule, entries, results tabs for org members
- [x] Dashboard nav: added Analytics and Post-Comp sections
- [x] Competition page: added feedback, live view, and org view quick links

**Key decisions**:
- Results pages (per-competition and per-competitor history) are read-only views built from existing Phase 4 tables (final_results, tabulation_tables). No additional schema needed.
- Calendar and archive are query-time views on the existing competitions table with location/date/style filters.
- Record removal is platform-admin-only review (not organizer) to keep the process neutral. Approval soft-hides entries from public display.
- Feedback forms are one-per-competition, organizer-configurable. Default template with 6 questions (4 ratings, 1 yes/no, 1 text). Rating scale is always 1-5.
- All answers stored as text strings for uniform storage, parsed by type for analytics display.
