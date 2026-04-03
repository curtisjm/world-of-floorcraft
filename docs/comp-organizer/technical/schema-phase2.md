# Phase 2 Schema: Registration & Entries

## New Enums

```
pricing_model: flat_fee, per_event
dance_role: leader, follower
payment_method: online, cash, check, other
```

## Additional columns on `competitions`

| Column | Type | Notes |
|--------|------|-------|
| pricing_model | pricing_model, default 'flat_fee' | flat_fee = one price per person; per_event = price per event entry |
| stripe_account_id | text | Organizer's Stripe Connect account ID |
| stripe_onboarding_complete | boolean, default false | Whether Stripe onboarding is finished |

## Additional columns on `competition_events`

| Column | Type | Notes |
|--------|------|-------|
| entry_price | numeric(10,2) | Only used when competition pricing_model = 'per_event' |

## New Tables

### `pricing_tiers`
Optional additional pricing tiers (e.g. student discount, spectator).

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| name | text, not null | e.g. "Student", "Spectator" |
| price | numeric(10,2), not null | |
| position | integer | Ordering |

### `competition_registrations`
One per person per competition. Tracks their registration, payment, and check-in status.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| user_id | text FK -> users | The registered person |
| competitor_number | integer | Assigned number (only used when person leads). Nullable until assigned. |
| pricing_tier_id | integer FK -> pricing_tiers | Nullable — null means base fee |
| amount_owed | numeric(10,2) | Calculated from tier or base fee (+ per-event fees if applicable) |
| paid_confirmed | boolean, default false | Manual toggle by registration staff (independent of actual payments) |
| checked_in | boolean, default false | Registration table check-in (received number) |
| org_id | integer FK -> organizations | Which org they're representing (nullable = unaffiliated) |
| registered_at | timestamp, default now | |
| registered_by | text FK -> users | Who submitted the registration (self or partner) |

Indexes:
- unique (competition_id, user_id)
- unique (competition_id, competitor_number) WHERE competitor_number IS NOT NULL
- (competition_id, org_id)

### `entries`
One per couple per event. The couple is identified by leader + follower registrations.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| event_id | integer FK -> competition_events (cascade) | |
| leader_registration_id | integer FK -> competition_registrations | |
| follower_registration_id | integer FK -> competition_registrations | |
| created_at | timestamp, default now | |
| created_by | text FK -> users | Who submitted this entry |
| scratched | boolean, default false | Deck captain scratch (reversible) |

Indexes:
- unique (event_id, leader_registration_id, follower_registration_id)
- (event_id)
- (leader_registration_id)
- (follower_registration_id)

Notes:
- The couple's visible number = leader's competitor_number from their registration
- A person can be a leader in some entries and a follower in others
- The follower does not display a number
- Partner notifications are handled at the application layer (not schema)

### `payments`
Individual payment records. Sum of payments for a registration = total amount paid.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| registration_id | integer FK -> competition_registrations (cascade) | |
| amount | numeric(10,2), not null | |
| method | payment_method, not null | online, cash, check, other |
| note | text | e.g. "Cash at registration table", "Refund - dropped events" |
| entry_id | integer FK -> entries | Nullable — links payment to specific entry when pricing is per-event |
| stripe_payment_intent_id | text | Stripe PaymentIntent ID (null for manual payments) |
| processed_by | text FK -> users | Staff who recorded it (null for online Stripe payments) |
| created_at | timestamp, default now | |

Index: (registration_id)

Notes:
- **Online payments**: created by Stripe webhook after successful charge. `method = online`, `stripe_payment_intent_id` populated, `processed_by = null`.
- **Manual payments**: created by registration staff via UI. `method = cash/check/card/other`, `processed_by` = staff user, `stripe_payment_intent_id = null`.
- Refunds are recorded as negative amounts (online refunds also triggered via Stripe, manual refunds recorded by staff)
- `competition_registrations.amount_paid` is removed — compute as `SUM(payments.amount)` instead
- `competition_registrations.paid_confirmed` remains as a manual staff override independent of payment records
- Registration table UI shows a summary (total paid / total owed) with a collapsible section to view individual payment records

### `tba_listings`
"To Be Announced" partner finder board.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| user_id | text FK -> users | |
| style | dance_style, not null | |
| level | competition_level, not null | |
| role | dance_role, not null | Role they want to fill (leader or follower) |
| notes | text | Any additional info |
| fulfilled | boolean, default false | Found a partner |
| created_at | timestamp, default now | |

Index: (competition_id, fulfilled)

### `team_match_submissions`
Text submissions for team match ideas.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| competition_id | integer FK -> competitions (cascade) | |
| user_id | text FK -> users | |
| content | text, not null | |
| created_at | timestamp, default now | |

## Key Design Decisions

### Number Assignment
- Numbers are per-leader, not per-couple or per-person
- A leader keeps the same number across all events they lead in
- When a person follows, no number is displayed — the event is tracked by the leader's number
- Numbers are assigned on `competition_registrations`, but only populated for people who lead in at least one event
- Auto-assignment: starting from `competitions.number_start`, skipping `competitions.number_exclusions`
- Organizer can manually assign/override

### Pricing Model
- **Flat fee** (default): each person pays `competitions.base_fee` (or their tier price) once regardless of events entered
- **Per event**: each person pays per event entry. Price set on `competition_events.entry_price`. Base fee may still apply.
- `amount_owed` on registration is calculated and updated as entries are added/removed
- Total amount paid is computed as `SUM(payments.amount)` — no denormalized field on registrations
- Individual payment records track method, who processed it, and optional link to a specific entry
- Refunds are negative-amount payment records
- `paid_confirmed` is a separate manual toggle for registration staff — independent of payment records
- Registration table UI: shows summary (paid/owed) with collapsible detail view of all payment records

### Payment Processing (Stripe Connect)
- Organizers connect their Stripe account via Stripe Connect onboarding (from the dashboard payments page)
- Online payments during registration are processed through Stripe, with funds going to the organizer's connected account
- Stripe webhooks create `payments` records automatically on successful charge
- Registration staff can manually add payment records for cash/check/card/other received at the table
- Refunds can be initiated via Stripe (online) or recorded manually (cash back)
- Organizer payment analytics page queries the `payments` table for transaction history and totals

### Registration Flow
1. Partner A registers both people → two `competition_registrations` created
2. Partner B gets a notification and can modify/remove entries
3. Either partner can add entries to events (creates `entries` rows)
4. Org affiliation is set per-registration, not per-entry
5. Number assignment can happen at registration or later (organizer controls timing)

### Partner Changes
- A person can dance with different partners in different events
- Removing an entry doesn't remove the registration (they're still registered for the competition)
- If all entries are removed, the registration remains (they still owe the flat fee unless organizer cancels)
