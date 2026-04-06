# Phase 7 Routers: Post-comp & Global Pages

---

## Results Router (`results.ts`)

Public router — results are visible to anyone once published.

### Queries

- **getByCompetition** (public) — All published results for a competition. Available as soon as any event's results are published (not gated on competition status).
  - Input: `competition_id`
  - Returns: events grouped by session, each with:
    - Event name, style, level, dances
    - Placements: couple number, leader name, follower name, organization, placement, per-dance placements (for multi-dance)
    - Only includes events with `round_results_meta.status = 'published'`

- **getEventResults** (public) — Full results for a single event (Summary + Marks tabs).
  - Input: `event_id`
  - Returns:
    - **Summary**: placements ordered 1st→last, each with couple number, names, org, per-dance placements, sum
    - **Marks**: tabulation table per dance (judge columns with raw marks, cumulative columns, placement). For multi-dance: final summary table with per-dance placements, totals, tiebreak rules.
  - Data sourced from `final_results` + `tabulation_tables`

- **getCompetitorHistory** (public) — Full results history for a competitor across all competitions.
  - Input: `user_id`
  - Returns: competitions ordered by date (most recent first), each with:
    - Competition name, date, organization
    - Events entered with placement, partner name
  - Excludes entries hidden by approved record removal requests

- **searchCompetitors** (public) — Search for competitors to view their history.
  - Input: `query` (name search)
  - Returns: matching users with name and number of competition appearances

---

## Feedback Router (`feedback.ts`)

### Queries

- **getForm** (public) — Get the feedback form for a competition.
  - Input: `competition_id`
  - Validates: competition status is `finished`
  - Returns: form title, description, questions with types/options/required flags

- **getMyResponse** (protected) — Get the current user's submitted response.
  - Input: `competition_id`
  - Returns: response with answers, or null if not submitted

- **getResponses** (protected, org admin/owner) — All responses for the competition.
  - Input: `competition_id`
  - Returns: all responses with answers (anonymous option TBD — for now, includes user info)

- **getAnalytics** (protected, org admin/owner) — Aggregate feedback analytics.
  - Input: `competition_id`
  - Returns: per-question aggregates:
    - Rating questions: average, distribution (count per 1-5)
    - Yes/no questions: yes count, no count, percentage
    - Multiple choice: count per option
    - Text questions: all answers listed
    - Total response count

### Mutations

- **createForm** (protected, org admin/owner) — Create a feedback form for a competition.
  - Input: `competition_id`, `title?`, `description?`, `use_template` (default true)
  - Behavior: creates `feedback_forms` row. If `use_template`, populates with default questions.
  - Validates: no form exists yet for this competition

- **updateForm** (protected, org admin/owner) — Update form title/description.
  - Input: `form_id`, `title?`, `description?`

- **addQuestion** (protected, org admin/owner) — Add a question to the form.
  - Input: `form_id`, `question_type`, `label`, `options?`, `required?`, `position`

- **updateQuestion** (protected, org admin/owner) — Edit a question.
  - Input: `question_id`, `label?`, `options?`, `required?`, `position?`

- **removeQuestion** (protected, org admin/owner) — Remove a question.
  - Input: `question_id`
  - Validates: no responses have been submitted yet (can't change form after responses exist)

- **submitResponse** (protected) — Submit feedback.
  - Input: `form_id`, `answers: Array<{ question_id, value }>`
  - Validates: competition status is `finished`, user hasn't already submitted, required questions answered
  - Creates `feedback_responses` + `feedback_answers` rows

---

## Calendar Router (`calendar.ts`)

Public router for competition discovery.

### Queries

- **getUpcoming** (public) — Upcoming competitions for the calendar.
  - Input: `filters?`: `{ state?, city?, date_from?, date_to?, style? }`
  - Returns: competitions with status in (advertised, accepting_entries, entries_closed, running), ordered by earliest competition_day date
  - Each result includes: name, slug, organization name/logo, dates, city/state, styles offered, registration status

- **getPast** (public) — Archive of completed competitions.
  - Input: `filters?`: same as above, plus `year?`
  - Returns: competitions with status `finished`, ordered by date descending

- **getCompetitionPreview** (public) — Quick preview for calendar hover/click.
  - Input: `competition_id`
  - Returns: name, dates, location, organization, event count, registration count, styles offered

---

## Record Removal Router (`record-removal.ts`)

Split between competitor-facing (submit requests) and platform admin (review requests).

### Queries

- **getMyRequests** (protected) — Current user's removal requests.
  - Returns: all requests by this user with status

- **listPending** (protected, platform admin) — All pending removal requests.
  - Returns: requests with competitor info, competition info, reason, submitted date

- **getRequest** (protected, platform admin) — Detail view for a single request.
  - Input: `request_id`
  - Returns: full request details + competitor's entries and results in that competition

### Mutations

- **submit** (protected) — Request removal from a competition's results.
  - Input: `competition_id`, `entry_id?` (null = all entries), `reason`
  - Validates: competition status is `finished`, user has entries in this competition, no pending request exists

- **approve** (protected, platform admin) — Approve a removal request.
  - Input: `request_id`, `review_notes?`
  - Behavior: soft-deletes the competitor's entries/results from public views (sets a hidden flag, does not destroy data)

- **reject** (protected, platform admin) — Reject a removal request.
  - Input: `request_id`, `review_notes?`

---

## Org Competition Router (`org-competition.ts`)

Per-org view of a competition. Visible to all org members, admin actions for org admins.

### Queries

- **getOrgSchedule** (protected, org member) — Competition schedule filtered to this org's entries. Available from registration through comp day (not just post-comp).
  - Input: `competition_id`, `org_id`
  - Returns: events where the org has entries, with:
    - Event name, estimated time, round info
    - Org's couples in each event (names, numbers)
    - "Need to be at venue by" time (earliest event minus buffer)

- **getOrgEntries** (protected, org member) — All entries for this org at this competition.
  - Input: `competition_id`, `org_id`
  - Returns: entries grouped by competitor, showing events entered, payment status, check-in status

- **getOrgResults** (protected, org member) — Results for this org's competitors.
  - Input: `competition_id`, `org_id`
  - Returns: placements for org members, grouped by event

### Mutations

- **submitAddDrop** (protected, org admin) — Submit an add/drop request on behalf of an org member.
  - Input: `competition_id`, `type` (add/drop), `event_id`, `leader_registration_id`, `follower_registration_id`, `reason`
  - Validates: at least one partner is a member of this org, submitter is org admin
  - Behavior: same as Phase 3 add-drop submit, but `submitted_by` is the org admin

---

## Payment Analytics Router (`payment-analytics.ts`)

Financial overview for competition organizers. All queries available at any competition status — organizers can track payments from registration through post-comp.

### Queries

- **getSummary** (protected, org admin/owner) — Financial summary for a competition. Available at any competition status (not just post-comp).
  - Input: `competition_id`
  - Returns:
    - Total revenue (sum of all payments)
    - Outstanding balance (sum of amount_owed - amount_paid where balance > 0)
    - Payment method breakdown (Stripe vs cash vs check vs other)
    - Registration count vs paid count
    - Average revenue per competitor

- **getPaymentLog** (protected, org admin/owner) — Full payment audit trail.
  - Input: `competition_id`, `filters?`: `{ method?, date_from?, date_to? }`
  - Returns: all payments ordered by date, each with: competitor name, amount, method, processed_by, stripe reference (if applicable)

- **getOutstanding** (protected, org admin/owner) — List of competitors with unpaid balances.
  - Input: `competition_id`
  - Returns: registrations where amount_owed > amount_paid, with contact info and balance
