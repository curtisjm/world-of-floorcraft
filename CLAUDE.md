# World of Floorcraft

Ballroom dance figure graph app with social platform features. Next.js frontend, tRPC v11 API, Drizzle ORM, Neon Postgres (production), Clerk auth, Ably realtime messaging.

## Architecture

Modular monolith with domain-based directory structure:

```
src/
  shared/          # @shared/* — db, auth/trpc, shared schema (users)
  domains/
    syllabus/      # @syllabus/* — dances, figures, figure_edges, figure_notes
    routines/      # @routines/* — routines, routine_entries
    social/        # @social/* — posts, comments, likes, follows, saves, notifications, feeds
    orgs/          # @orgs/* — organizations, memberships, invites, join_requests
    messaging/     # @messaging/* — conversations, conversation_members, messages
```

Path aliases are defined in `tsconfig.json` and mirrored in `vitest.config.ts`.

Production `@shared/db` uses the Neon HTTP driver with a Proxy pattern aggregating all domain schemas. Tests replace this with a node-postgres pool via `vi.mock`.

## Integration Tests

### Running Tests

Tests require PostgreSQL binaries available on PATH. On NixOS:

```bash
nix develop --command bash -c "pnpm test"
```

Run a single domain:
```bash
nix develop --command bash -c "pnpm vitest run tests/domains/orgs/"
```

Run a single file:
```bash
nix develop --command bash -c "pnpm vitest run tests/domains/orgs/org.test.ts"
```

### How the Test Infrastructure Works

1. **Global setup** (`tests/setup/global-setup.ts`): Starts a temporary PostgreSQL instance on port 5433 in `.pg-test/`, creates the `floorcraft_test` database, and pushes the schema via `drizzle-kit push`.

2. **Global teardown** (`tests/setup/global-teardown.ts`): Stops the temporary PostgreSQL instance.

3. **Vitest setup** (`tests/setup/vitest-setup.ts`): Runs before each test file. Mocks:
   - `@clerk/nextjs/server` and `@clerk/nextjs` — stubs auth
   - `@messaging/lib/ably-server` — stubs realtime publishing
   - `@shared/db` — redirects all router DB access to the test database

4. **Test database** (`tests/setup/test-db.ts`): Singleton `pg.Pool` and `drizzle` instance connecting to the local test Postgres. Constructs the URL from known constants (port 5433, `.pg-test/` socket dir) to avoid env propagation issues with forked workers.

### Critical Configuration (vitest.config.ts)

```
pool: "forks"              — use OS process forking
forks: { singleFork: true } — single forked worker
fileParallelism: false      — run test files sequentially (NOT concurrently)
```

`fileParallelism: false` is **essential**. Without it, vitest runs test files concurrently via `Promise.all` within the single fork, causing race conditions on the shared database (phantom data during truncation, duplicate key errors, etc.). Do not remove this setting.

### Writing New Tests

Follow the existing pattern in `tests/domains/`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, truncateAll } from "../../setup/helpers";

describe("router-name router", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();               // wipe all tables between tests
    const user = await createUser();   // create a test user
    userId = user.id;
  });

  it("does something", async () => {
    const caller = createCaller(userId);        // authenticated caller
    const result = await caller.routerName.procedureName({ ... });
    expect(result).toBeDefined();
  });
});
```

### Available Helpers (`tests/setup/helpers.ts`)

| Helper | Purpose |
|--------|---------|
| `createCaller(userId)` | Authenticated tRPC caller — user must exist in DB first |
| `createPublicCaller()` | Unauthenticated tRPC caller for public procedures |
| `createUser(overrides?)` | Insert a user row with auto-generated unique fields |
| `createDance(overrides?)` | Insert a dance |
| `createFigure(danceId, overrides?)` | Insert a figure linked to a dance |
| `createPost(authorId, overrides?)` | Insert a post |
| `createOrg(ownerId, overrides?)` | Insert an org + owner membership |
| `createConversation(type, memberIds, overrides?)` | Insert a conversation with members |
| `truncateAll()` | Truncate all tables (CASCADE). Call in `beforeEach`. |

### Adding a New Domain's Tests

1. Create `tests/domains/<domain>/<router>.test.ts`
2. If you need a new factory, add it to `tests/setup/helpers.ts`
3. If you add new tables, add them to the `TRUNCATE` list in `truncateAll()` (order doesn't matter thanks to CASCADE, but put child tables before parent tables by convention)
4. If the new domain has a new schema file, add it to:
   - `drizzle.config.ts` (schema array)
   - `tests/setup/test-db.ts` (schema import + spread)
   - `vitest.config.ts` (resolve alias, if new path alias)

### Test Coverage (43 files, 305 tests)

- syllabus: dance, figure
- routines: routine
- social: profile, follow, post, feed, comment, like, save, notification
- orgs: org, membership, invite, join-request, org-post
- messaging: conversation, message
- competitions: competition, schedule, event, staff, judge, registration, entry, payment, number, tba, team-match, add-drop, round, schedule-estimation, stats, awards, scoring-engine, scoring, judge-session, scrutineer, registration-table, deck-captain, emcee, scrutineer-dashboard, live-view

## Schema Management

`drizzle.config.ts` must list ALL domain schema files. Missing schemas = missing tables on `db:push`. This was the root cause of org creation failures (orgs + messaging schemas were missing).

## Common Commands

```bash
pnpm dev          # Start Next.js dev server
pnpm db:push      # Push schema to Neon (production/dev)
pnpm db:studio    # Open Drizzle Studio
pnpm test         # Run all integration tests (needs nix develop on NixOS)
```
