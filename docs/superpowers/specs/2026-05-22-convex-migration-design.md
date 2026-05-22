# Convex Migration Design

## Summary

World of Floorcraft will migrate from Neon, Drizzle, tRPC, and most Ably usage
to Convex as the primary database and backend API. The migration will happen on
the `convex-migration` branch and will be sliced by domain so each unit can be
planned, reviewed, tested, and dispatched independently.

The app has no production data that must be preserved. Existing Neon data is
test data plus the current syllabus extraction. The migration will support
importing the current syllabus data for testing, but the OCR/extraction redesign
is out of scope and will happen after this migration.

## Goals

- Replace Neon and Drizzle with Convex tables, indexes, queries, mutations, and
  actions.
- Replace tRPC domain by domain with Convex functions and `convex/react`
  client hooks.
- Keep Clerk as the auth provider and map Clerk identities to Convex users.
- Replace Ably where Convex reactive queries preserve existing behavior.
- Preserve messaging typing and presence behavior.
- Replace competition live event-bus invalidation with Convex reactive data.
- Add reliable Stripe webhook fulfillment as part of the payments migration.
- Keep the migration organized so later implementation work can be dispatched as
  domain-level beads.

## Non-Goals

- Redesigning the syllabus OCR pipeline.
- Preserving existing Neon test rows or Postgres serial IDs.
- Adding new competition-day online-user or edit-presence indicators.
- Keeping tRPC as a long-term compatibility layer.
- Reworking Clerk auth or switching to Convex Auth.
- Replacing Stripe Checkout with a custom payment UI.

## Current State

The app is a Next.js App Router application organized as a modular monolith:

- `src/shared/db/index.ts` creates one Drizzle/Neon client from all domain
  schema files.
- `src/shared/auth/trpc.ts` provides the tRPC context, public procedures, and
  protected procedures backed by Clerk.
- `src/shared/auth/routers.ts` aggregates domain routers.
- Domain schema and routers live under `src/domains/*`.
- Ably handles realtime messaging and competition event broadcasts.
- Integration tests run against a local PostgreSQL instance and Drizzle schema.

The current data model has 59 Postgres tables and 33 SQL enums across syllabus,
routines, social, orgs, messaging, and competitions.

## Target Architecture

Convex becomes the backend boundary:

- `convex/schema.ts` defines all tables and indexes.
- `convex/_generated/*` is committed and used by the app.
- Domain functions live in domain-oriented Convex modules, matching the current
  domain structure where practical.
- Shared Convex helpers handle auth, authorization, pagination, app errors,
  money values, and time/date normalization.
- Client components use Convex React hooks directly for reactive data.
- Server-rendered pages may use Convex server utilities for non-reactive initial
  data, but interactive product surfaces should use reactive client queries when
  freshness matters.

Clerk remains the identity provider:

- The app uses Convex's Clerk integration on the client.
- Backend functions read identity through Convex auth.
- A Convex `users` table stores app profile data keyed by Clerk identity.
- Protected functions never trust client-provided user IDs for the current user.

tRPC, Drizzle, Neon, and Ably are removed after replacement:

- tRPC routers are deleted once their domain's UI and tests move to Convex.
- Drizzle schema files are deleted after all domain schemas have Convex
  equivalents.
- Neon dependencies and `DATABASE_URL` requirements are removed at the end.
- Ably remains only if a specific behavior cannot be preserved with Convex
  without degrading functionality.

## Data Modeling Principles

The Convex schema should model the product, not mirror Postgres mechanics.

- Use Convex document IDs internally.
- Use explicit slugs or public keys for user-visible URLs.
- Do not preserve Postgres `serial` IDs unless a feature truly needs a stable
  public numeric value.
- Replace SQL enums with validated string unions in Convex schemas.
- Keep nested JSON where it is product-shaped, especially current figure step
  data.
- Use separate tables for high-cardinality child records, many-to-many
  relationships, event streams, and records that need independent indexes.
- Design every list/detail query around an index before implementation.
- Avoid reactive broad scans for feeds, competition dashboards, message history,
  payment analytics, and notifications.

## Domain Slice Order

### 1. Foundation

Add the Convex project structure and shared infrastructure:

- Install and configure Convex.
- Configure Clerk auth for Convex.
- Add provider wiring to the app root.
- Add shared Convex helpers for identity, app users, permissions, errors,
  pagination, money, timestamps, and slug/public-key lookup.
- Establish the test strategy and local validation commands.
- Add a seed/import path for current syllabus data.

This slice should be closely supervised because every later slice depends on it.

### 2. Syllabus

Move syllabus browsing and graph data first:

- Tables: `dances`, `figures`, `figureEdges`, `figureNotes`.
- Preserve current dance, figure, edge, and note behavior.
- Keep leader/follower step payloads flexible enough for the later OCR redesign.
- Port dance and figure queries.
- Port graph and routine-builder figure lookup consumers.
- Import current syllabus data from the existing YAML/seed source.

### 3. Routines

Move routine building and routine publication data:

- Tables: `routines`, `routineEntries`.
- Depends on users and syllabus.
- Port routine CRUD, entry add/remove/reorder, publish state, and dance-filtered
  routine lists.
- Ensure transition validation still uses syllabus edges.

### 4. Social

Move user profile and social product surfaces:

- Tables: `posts`, `comments`, `likes`, `follows`, `saveFolders`,
  `savedPosts`, `partnerSearchProfiles`, `notifications`.
- Port profile, follow, feed, post, comment, like, save, notification, and
  partner-search functions.
- Use reactive notifications carefully; prefer screen-level queries over many
  tiny subscriptions.
- Preserve public/followers/organization visibility rules.

### 5. Organizations

Move organization membership and org-scoped publishing:

- Tables: `organizations`, `memberships`, `orgInvites`, `joinRequests`.
- Preserve slug-based org URLs.
- Preserve open, invite-only, and request-to-join membership models.
- Preserve org channel membership effects needed by messaging.
- Reuse social post records for org-scoped posts where that remains the
  cleanest model.

### 6. Messaging

Move conversations and direct messaging:

- Tables: `conversations`, `conversationMembers`, `messages`.
- Add ephemeral typing/presence records with heartbeat timestamps and cleanup.
- Replace Ably message delivery with reactive Convex message queries.
- Preserve DM, group chat, org channels, unread state, typing indicators, and
  basic presence.

### 7. Competitions Core

Move competition setup and registration workflows:

- Tables: competitions, competition days, schedule blocks, competition events,
  event dances, judges, competition staff, competition judges, pricing tiers,
  registrations, entries, TBA listings, team match submissions, add/drop
  requests.
- Preserve organizer setup, schedule builder, events, judges, staff,
  registration, entries, add/drop, TBA, team match, and number assignment
  workflows.
- Keep competition slug routes stable.

### 8. Competition Live And Scoring

Move competition-day and scoring workflows:

- Tables: rounds, heats, heat assignments, event time overrides, callback marks,
  final marks, judge submissions, callback results, final results, tabulation
  tables, round results metadata, judge sessions, active rounds, mark
  corrections, registration check-ins, deck captain check-ins, announcement
  notes, feedback forms, feedback questions, feedback responses, feedback
  answers, record removal requests.
- Replace Ably publish/invalidate flows with reactive persisted state.
- Use screen-specific aggregate queries for live view, display, scrutineer,
  deck captain, registration table, emcee, and results views.
- Preserve existing connection/freshness UX where Convex supports it cleanly.
- Do not add new online-user indicators in this slice.

### 9. Payments

Move payment state and add robust Stripe fulfillment:

- Convex owns payment state, Stripe account IDs, onboarding state, checkout
  session IDs, payment intent IDs, and payment summaries.
- Convex Node actions create Checkout Sessions, Connect accounts, account
  onboarding links, and status-refresh calls.
- Next.js route handlers verify Stripe webhooks using the official Stripe SDK
  and raw signatures.
- Verified webhooks call internal Convex mutations to fulfill payments.
- Fulfillment is idempotent by Stripe Checkout Session or PaymentIntent ID.
- Replayed webhook events must not duplicate payment records.
- Keep Checkout Sessions as the primary payment surface.

### 10. Cleanup

After all domains are converted:

- Remove Drizzle schemas, migration config, Neon client code, and Neon
  dependencies.
- Remove tRPC routers, client provider, API route, and tRPC dependencies.
- Remove Ably client/server code and Ably dependencies if no longer used.
- Remove local Postgres test harness and documentation.
- Update README, docs, env examples, and deployment instructions for Convex.
- Verify no application code imports Drizzle, Neon, tRPC, or Ably.

## Realtime Design

Messaging uses reactive Convex queries for message history and new message
delivery. Typing and presence use short-lived records that clients refresh on an
interval. Cleanup can run through a scheduled function or be handled by queries
filtering out stale heartbeat timestamps.

Competition live screens use reactive persisted state instead of event
broadcasts. Mutations update source-of-truth records, and subscribed queries
refresh automatically. This removes the current mutation-write, Ably-publish,
client-invalidate pattern.

The migration should preserve existing realtime user value:

- Messages appear without manual refresh.
- Typing indicators and basic conversation presence remain.
- Judge tablets and competition dashboards update when active rounds,
  submissions, check-ins, announcements, schedules, and results change.
- Public live and display screens update when relevant competition state
  changes.

## Stripe Design

The payment migration includes cleanup that the current implementation needs:
reliable webhook-based fulfillment.

Payment flow:

1. User or staff starts payment from the app.
2. Convex action validates the registration state and calls Stripe to create a
   Checkout Session.
3. Convex stores enough session metadata to correlate fulfillment.
4. Stripe redirects the user through Checkout.
5. Stripe sends a webhook to a Next.js route.
6. The route verifies the Stripe signature.
7. The route calls an internal Convex mutation with the verified event details.
8. The mutation records payment state idempotently and updates registration
   payment status.

Connect flow:

1. Organizer starts online payment setup.
2. Convex action creates or refreshes the connected account and onboarding link.
3. Convex stores account IDs and onboarding state.
4. Status checks call Stripe from Convex actions and persist relevant state in
   Convex.

## Testing Strategy

During migration, the active slice may temporarily have both old and new tests.
The final state should not depend on local Postgres.

Each domain slice should include:

- Convex function tests for auth, authorization, validation, and core data
  workflows.
- Tests for important index-backed list/detail queries.
- Tests for idempotent mutations where retries or webhook replays are possible.
- Client or component tests where UI behavior changes materially.

Keep Playwright for critical end-to-end flows:

- Auth and onboarding.
- Syllabus browsing and routine building.
- Social posting and feed interactions.
- Messaging, including typing/presence if practical.
- Competition registration.
- Competition-day scoring and live views.
- Stripe webhook happy path with mocked Stripe inputs.

## Cost And Performance Constraints

Convex cost control is part of the design:

- Every production query must have an index-backed access path.
- Avoid reactive queries that subscribe to entire high-churn tables.
- Prefer screen-specific aggregate queries over many independent subscriptions
  when a screen naturally refreshes as a unit.
- Keep feed, notification, message, and competition dashboard pagination
  explicit.
- Avoid duplicating expensive derived state unless the derived record is
  intentional and updated transactionally.
- Review query fanout before moving high-traffic live screens.

## Dispatch Plan

After this design is accepted and an implementation plan is written, create
domain beads in dependency order:

1. Convex foundation and Clerk auth.
2. Syllabus schema/functions/import.
3. Routines schema/functions/UI.
4. Social schema/functions/UI.
5. Organization schema/functions/UI.
6. Messaging schema/functions/realtime.
7. Competitions core setup and registration.
8. Competition live/scoring.
9. Stripe payments and webhook fulfillment.
10. Final cleanup and docs.

Foundation should be completed first. Syllabus, routines, social, orgs, and
messaging can then be parallelized where dependencies allow. Competitions should
be split into multiple smaller beads because the current competition surface is
too large for one worker. Cleanup must remain last.

## Acceptance Criteria

- The app runs from Convex for all migrated domain data.
- Clerk-authenticated users map to Convex users.
- tRPC, Drizzle, Neon, and local Postgres are removed from final app code.
- Ably is removed unless a documented gap remains.
- Existing user-visible functionality is preserved unless explicitly deferred.
- Current syllabus data can be imported for testing.
- Syllabus OCR redesign remains out of scope.
- Stripe payments are fulfilled via verified webhooks and idempotent Convex
  mutations.
- Tests cover each migrated domain and critical end-to-end flows.
- Migration work is split into dispatchable domain beads.
