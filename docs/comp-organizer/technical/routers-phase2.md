# Phase 2 Routers

## Additional columns on `competitions` (settings)

| Column | Type | Notes |
|--------|------|-------|
| require_payment_at_registration | boolean, default false | If true, registration requires payment to complete |

---

## Registration Router (`registration.ts`)

### Queries
- **getMyRegistration** (protected) — get current user's registration for a competition (includes amount owed, payment summary, entries)
- **listByCompetition** (protected, org admin/staff) — all registrations for a competition, with payment summaries. Sortable by org, name, paid status, checked-in status.
- **getById** (protected, org admin/staff) — single registration with full details (entries, payment history)

### Mutations
- **register** (protected) — register one or two people for a competition.
  - Input: competition_id, user_id (self), partner_user_id (optional, looked up by username), org_id (nullable for unaffiliated)
  - Creates `competition_registrations` for both people
  - If partner provided, sends notification to partner
  - Calculates `amount_owed` based on pricing model and tier
  - If `require_payment_at_registration` is true, returns a Stripe checkout URL instead of completing immediately
- **updateOrgAffiliation** (protected) — change which org a registration is under
- **updateTier** (protected, org admin/staff) — change pricing tier for a registration (recalculates amount_owed)
- **toggleCheckedIn** (protected, staff) — mark/unmark as checked in at registration table
- **cancel** (protected) — cancel a registration. Doesn't delete — marks as cancelled. Only by the registered user or org admin/staff.

### Permission checks
- register: any authenticated user (competition must be in `accepting_entries` status)
- list/getById: org admin/owner of host org, or assigned staff
- toggleCheckedIn/updateTier: assigned registration table staff, scrutineer, or org admin

---

## Entry Router (`entry.ts`)

### Queries
- **listByEvent** (public) — all entries for an event (couple numbers, names)
- **listByRegistration** (protected) — all entries for a given registration (what events is this person in)
- **listByCompetition** (public) — all entries grouped by event

### Mutations
- **create** (protected) — enter a couple into an event.
  - Input: event_id, leader_registration_id, follower_registration_id
  - Validates both registrations exist and belong to the same competition
  - If pricing is per-event, updates `amount_owed` on both registrations
  - Notifies partner if entry was created by the other person
- **remove** (protected) — remove an entry. Only by one of the registered couple or org admin/staff.
  - If pricing is per-event, updates `amount_owed`
- **scratch** (protected, deck captain/scrutineer) — toggle scratched status on an entry (comp day)
- **bulkCreate** (protected) — enter a couple into multiple events at once. Convenience for registration flow.

### Validation
- Can't enter the same couple in the same event twice
- Competition must be in `accepting_entries` (or `entries_closed` via add/drop, but that's Phase 3)
- A person can be leader in some entries and follower in others

---

## Payment Router (`payment.ts`)

### Queries
- **listByRegistration** (protected) — all payments for a registration (the collapsible detail view)
- **summaryByCompetition** (protected, org admin/staff) — aggregate payment stats (total collected, outstanding, by method)

### Mutations
- **createCheckoutSession** (protected) — create a Stripe Checkout session for online payment.
  - Input: registration_id (or list of registration_ids if paying for self + partner)
  - Creates Stripe Checkout via the organizer's connected account
  - Returns the Stripe checkout URL
- **recordManual** (protected, staff) — record a manual payment (cash, check, card at table).
  - Input: registration_id, amount, method, note, entry_id (optional)
- **recordRefund** (protected, staff) — record a refund (negative amount).
  - Input: registration_id, amount, method, note
  - For online payments, can optionally trigger Stripe refund
- **handleWebhook** (public, verified) — Stripe webhook endpoint.
  - On `checkout.session.completed`: create payment record, link to registration
  - On `charge.refunded`: create negative payment record

### Stripe Connect
- **createConnectAccount** (protected, org admin) — initiate Stripe Connect onboarding for the org. Returns onboarding URL.
- **getConnectStatus** (protected, org admin) — check if Stripe Connect onboarding is complete.

---

## Number Router (`number.ts`)

### Queries
- **listAssignments** (protected, staff) — all number assignments for a competition

### Mutations
- **autoAssign** (protected, org admin/staff) — auto-assign numbers to all leaders who don't have one yet. Uses `competitions.number_start`, skips `competitions.number_exclusions`, assigns sequentially.
- **manualAssign** (protected, org admin/staff) — manually set a competitor's number. Input: registration_id, number. Validates uniqueness.
- **unassign** (protected, org admin/staff) — remove a number assignment.
- **updateSettings** (protected, org admin) — update number_start and number_exclusions on the competition.

---

## TBA Router (`tba.ts`)

### Queries
- **listByCompetition** (public) — all unfulfilled TBA listings for a competition, filterable by style/level/role

### Mutations
- **create** (protected) — post a TBA listing. Input: competition_id, style, level, role, notes.
- **markFulfilled** (protected) — mark a listing as fulfilled (found a partner).
- **delete** (protected) — remove own listing.

---

## Team Match Router (`team-match.ts`)

### Queries
- **listByCompetition** (protected, org admin/staff) — all team match submissions

### Mutations
- **submit** (protected) — submit a team match idea. Input: competition_id, content.
- **delete** (protected) — remove own submission.

---

## Registration Page Flow (Competitor)

### If `require_payment_at_registration = false`:
1. Select events to enter (with partner if applicable)
2. Review entries
3. Submit → registrations + entries created
4. Payment can happen later (from "My Registration" page or at the registration table)

### If `require_payment_at_registration = true`:
1. Select events to enter (with partner if applicable)
2. Review entries + total cost
3. Submit → redirected to Stripe Checkout
4. On successful payment → webhook creates payment record, registrations + entries confirmed

### Registration Table UI (Staff)
- Table sorted by org, partners grouped
- Each row shows: name, number, paid summary (amount paid / amount owed), checked-in status, paid_confirmed toggle
- Click row to expand: full entry list, payment history (collapsible), actions (record payment, change tier, check in)
- Can record manual payments inline
- Can approve add/drop requests (Phase 3)
