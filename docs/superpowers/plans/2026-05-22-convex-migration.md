# Convex Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate World of Floorcraft from Neon, Drizzle, tRPC, and most Ably usage to Convex, preserving current product behavior while enabling reactive data by domain.

**Architecture:** Build Convex as the new backend boundary first, then migrate domains in dependency waves. Foundation and schema work are serialized to avoid global-file conflicts; domain function/UI work is split for parallel polecats once the shared contracts are stable.

**Tech Stack:** Next.js 15 App Router, React 19, Clerk, Convex, Convex React hooks, Convex Node actions, Convex `convex-test` + Vitest, Stripe Checkout/Connect, Playwright.

---

## Approval Gate

Do not create implementation issues or dispatch work until the human approves
this plan. After approval, file GitHub issues from the task list below and set
dependencies before dispatching.

## Source Documents

- Design spec: `docs/superpowers/specs/2026-05-22-convex-migration-design.md`
- Current DB entry point: `src/shared/db/index.ts`
- Current tRPC entry points: `src/shared/auth/trpc.ts`, `src/shared/auth/routers.ts`, `src/app/api/trpc/[trpc]/route.ts`
- Current provider: `src/shared/components/providers.tsx`
- Current Stripe router: `src/domains/competitions/routers/payment.ts`
- Current Ably modules: `src/domains/messaging/lib/ably-client.ts`, `src/domains/messaging/lib/ably-server.ts`, `src/domains/competitions/lib/ably-comp.ts`, `src/domains/competitions/lib/ably-comp-client.ts`

## Project Convex Skills Consulted

Use these project-local skills while implementing the corresponding tasks:

- `.agents/skills/convex/SKILL.md`: routing skill for Convex work in this repo.
- `.agents/skills/convex-quickstart/SKILL.md`: Task 1 setup, `NEXT_PUBLIC_CONVEX_URL`, App Router provider wiring, and `CONVEX_AGENT_MODE=anonymous npx convex dev --once`.
- `.agents/skills/convex-setup-auth/SKILL.md` and `.agents/skills/convex-setup-auth/references/clerk.md`: Task 1 Clerk integration, `ConvexProviderWithClerk`, `CLERK_JWT_ISSUER_DOMAIN`, and Convex-side auth validation.
- `.agents/skills/convex-migration-helper/SKILL.md`: schema/data rollout rules. Because there is no production data to preserve, initial Neon-to-Convex import does not need `@convex-dev/migrations`; use this skill later if a Convex schema change requires backfill or old/new-shape handling after data exists.
- `.agents/skills/convex-performance-audit/SKILL.md`, especially `references/hot-path-rules.md` and `references/subscription-cost.md`: index-backed query design, subscription fanout, heartbeat isolation, and cost-control checks for Tasks 7-10.

## Branch And Working Tree Policy

All migration work stays on branch `convex-migration`.

Before any implementation worker starts:

```bash
git switch convex-migration
git status --short --branch
```

Expected:

- Branch is `convex-migration`.
- Pre-existing local project config files may still be dirty or untracked:
  `.gitignore`, `.agents/`, `.codex/`, `skills-lock.json`.
- Workers must not stage or revert those files unless their issue explicitly owns them.

Each issue should commit only files it owns.

## Parallelization Map

### Wave 0: Serialized Foundation

Run these in order with one worker:

1. Task 1: Convex tooling, Clerk provider, test harness.
2. Task 2: Complete Convex schema and shared helpers.

Reason: these tasks create shared contracts and the global `convex/schema.ts`.

### Wave 1: First Parallel Domain Work

After Tasks 1-2 are merged:

- Task 3: Syllabus.
- Task 5: Social identity/profile/follows.
- Task 6: Organizations.

Task 6 can start after Task 5 publishes the app-user helper contract. If Task 5
and Task 6 run at the same time, Task 6 must only call the helper names defined
in Task 2 and avoid editing Task 5-owned social files.

### Wave 2: Second Parallel Domain Work

After Wave 1:

- Task 4: Routines, depends on Task 3.
- Task 7: Social content/feed/notifications, depends on Tasks 5-6.
- Task 8: Messaging, depends on Tasks 5-6.
- Task 9: Competitions core, depends on Task 6.

These workers should avoid touching `convex/schema.ts`; schema changes after
Task 2 require a short coordination note and a dedicated schema patch.

### Wave 3: High-Coupling Domain Work

After Task 9:

- Task 10: Competition live/scoring.
- Task 11: Stripe payments and webhook fulfillment.

Task 11 depends on registration and payment tables from Task 9.

### Wave 4: Final Cleanup

After every domain is migrated and verified:

- Task 12: Remove Neon/Drizzle/tRPC/Ably remnants, update docs, run full gates.

## Work Item Dependency Graph

Use requirement-style dependencies: child needs parent.

```text
Task 2 needs Task 1
Task 3 needs Task 2
Task 5 needs Task 2
Task 6 needs Task 5
Task 4 needs Task 3
Task 7 needs Task 5 and Task 6
Task 8 needs Task 5 and Task 6
Task 9 needs Task 6
Task 10 needs Task 9
Task 11 needs Task 9
Task 12 needs Tasks 3, 4, 7, 8, 10, 11
```

When filing issues later, record these dependencies in each issue body. For
example, Task 2 should state that it requires Task 1.

## Shared File Ownership

To reduce merge conflicts:

- Task 1 owns `package.json`, `pnpm-lock.yaml`, Convex install/config files,
  `src/shared/components/providers.tsx`, and the initial test harness.
- Task 2 owns `convex/schema.ts`, `convex/lib/*`, and schema-adjacent helper
  modules.
- Domain tasks own their `convex/<domain>/*` modules, domain UI files, and
  domain tests.
- Task 12 owns deletion of old tRPC, Drizzle, Neon, Ably, Postgres test, and
  docs remnants.

No worker should perform broad formatting across files it does not own.

## Convex Performance Guardrails

These guardrails come from the project `convex-performance-audit` skill and
apply to every domain task:

- Push filters into storage with `.withIndex()` or search indexes. Do not ship
  list queries that scan and then filter in JavaScript for feed, message,
  notification, competition dashboard, or payment paths.
- Avoid redundant indexes. A compound index can often serve a prefix lookup, so
  add a separate single-field index only when `_creationTime` ordering or a
  different sort path requires it.
- Treat every `useQuery` and `usePaginatedQuery` as a live subscription. Batch
  page data into screen-level queries where it reduces total invalidation cost.
- Use `skip` for Convex React queries when route params or IDs are not ready.
- Keep frequently updated heartbeat state out of widely read documents. Presence
  and typing records must live in separate tables from users, conversations, and
  competition records.
- Do not use `Date.now()` inside cacheable Convex queries for freshness logic.
  Pass time as an argument, use stale timestamp filters carefully, or update
  coarse state with scheduled functions.
- Do not introduce digest/summary tables by default. Add them only for known hot
  paths, large payload reductions, or measured read amplification.
- After the first deployable Convex preview exists, run
  `npx convex insights --details` on high-traffic candidate screens and feed any
  findings back into the relevant domain issue before final cleanup.

---

## Task 1: Convex Foundation Tooling And Provider

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `convex/README.md`
- Create: `convex/auth.config.ts`
- Create: `convex/test.setup.ts`
- Modify: `vitest.config.ts`
- Modify: `src/shared/components/providers.tsx`
- Create: `src/shared/components/convex-client-provider.tsx`
- Modify: `.env.example` if present
- Test: `convex/foundation.test.ts`

- [ ] **Step 1: Confirm branch and current dirty files**

Run:

```bash
git switch convex-migration
git status --short --branch
```

Expected: branch is `convex-migration`. Do not stage unrelated existing
project config files.

- [ ] **Step 2: Install Convex packages**

Run:

```bash
pnpm add convex
pnpm add -D convex-test @edge-runtime/vm
```

Expected: `package.json` contains `convex` under dependencies and
`convex-test`, `@edge-runtime/vm` under dev dependencies.

- [ ] **Step 3: Refresh Convex AI/project guidance**

Run:

```bash
npx convex ai-files install
```

Expected: Convex guidance files are installed or refreshed. Stage only files
that are relevant to this repository if the command writes extra guidance.

- [ ] **Step 4: Add Convex auth config for Clerk**

Create `convex/auth.config.ts`:

```ts
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Also add `CLERK_JWT_ISSUER_DOMAIN` to the environment documentation. The value
comes from Clerk's JWT issuer domain for the Convex JWT template.

- [ ] **Step 5: Add Convex client provider**

Create `src/shared/components/convex-client-provider.tsx`. The existing
`src/app/layout.tsx` already wraps the app in `ClerkProvider`, so this component
must not create a second `ClerkProvider`.

```tsx
"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
```

Modify `src/shared/components/providers.tsx` so the app is wrapped by
`ConvexClientProvider` while keeping the existing tRPC provider during the
migration window. Keep `src/app/layout.tsx` as the single owner of
`ClerkProvider` and `clerkAppearance`.

- [ ] **Step 6: Add Convex test setup**

Create `convex/test.setup.ts`:

```ts
/// <reference types="vite/client" />

export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
```

Modify `vitest.config.ts` to add a Convex project/environment for
`convex/**/*.test.ts`, using the edge runtime environment described by Convex
testing docs.

- [ ] **Step 7: Add a foundation test**

Create `convex/foundation.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

describe("convex foundation", () => {
  it("starts with an empty test database", async () => {
    const t = convexTest(schema, modules);
    const dances = await t.run(async (ctx) => {
      return await ctx.db.query("dances").collect();
    });

    expect(dances).toEqual([]);
  });
});
```

This test will compile only after Task 2 creates the schema. If Task 1 lands
before Task 2, keep the test skipped with an explicit comment:

```ts
it.skip("starts with an empty test database", async () => {
  // Enabled by Task 2 after convex/schema.ts exists.
});
```

- [ ] **Step 8: Provision and validate Convex once schema exists**

After Task 2 or in the combined foundation branch, run:

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --once
```

Expected: Convex generates `convex/_generated/*`, validates functions/schema,
and exits cleanly.

- [ ] **Step 9: Run foundation checks**

Run:

```bash
pnpm test -- convex/foundation.test.ts
pnpm build
```

Expected: foundation tests pass once schema exists; build succeeds or failures
are documented with exact old-code dependencies that later slices will remove.

- [ ] **Step 10: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml convex src/shared/components vitest.config.ts .env.example
git commit -m "Add Convex foundation"
```

Stage `.env.example` only if it exists and was modified.

---

## Task 2: Convex Schema And Shared Helpers

**Files:**
- Create/modify: `convex/schema.ts`
- Create: `convex/lib/auth.ts`
- Create: `convex/lib/errors.ts`
- Create: `convex/lib/money.ts`
- Create: `convex/lib/time.ts`
- Create: `convex/lib/pagination.ts`
- Create: `convex/lib/permissions.ts`
- Test: `convex/lib/auth.test.ts`
- Test: `convex/lib/money.test.ts`

- [ ] **Step 1: Port the full table set into one schema**

Create `convex/schema.ts` with every current domain table represented. Use
Convex literal unions for enum-like fields and indexes matching the query paths
called out in the design.

Minimum structure:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const levels = v.union(
  v.literal("bronze"),
  v.literal("silver"),
  v.literal("gold")
);

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    competitionLevel: v.optional(v.string()),
    competitionLevelHigh: v.optional(v.string()),
    isPrivate: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_username", ["username"]),

  dances: defineTable({
    name: v.string(),
    displayName: v.string(),
    timeSignature: v.optional(v.string()),
    tempoDescription: v.optional(v.string()),
  }).index("by_name", ["name"]),

  figures: defineTable({
    danceId: v.id("dances"),
    figureNumber: v.optional(v.number()),
    name: v.string(),
    variantName: v.optional(v.string()),
    level: levels,
    leaderSteps: v.optional(v.any()),
    followerSteps: v.optional(v.any()),
    leaderFootwork: v.optional(v.string()),
    followerFootwork: v.optional(v.string()),
    leaderCbm: v.optional(v.string()),
    followerCbm: v.optional(v.string()),
    leaderSway: v.optional(v.string()),
    followerSway: v.optional(v.string()),
    timing: v.optional(v.string()),
    beatValue: v.optional(v.string()),
    notes: v.optional(v.array(v.string())),
  })
    .index("by_dance", ["danceId"])
    .index("by_dance_level", ["danceId", "level"]),

  figureEdges: defineTable({
    sourceFigureId: v.id("figures"),
    targetFigureId: v.id("figures"),
    level: levels,
    conditions: v.optional(v.string()),
  })
    .index("by_source", ["sourceFigureId"])
    .index("by_target", ["targetFigureId"])
    .index("by_source_level", ["sourceFigureId", "level"]),

});
```

Complete table inventory to implement in this step:

- Shared: `users`, `notifications`.
- Syllabus: `dances`, `figures`, `figureEdges`, `figureNotes`.
- Routines: `routines`, `routineEntries`.
- Social: `follows`, `posts`, `comments`, `likes`, `saveFolders`,
  `savedPosts`, `partnerSearchProfiles`.
- Organizations: `organizations`, `memberships`, `orgInvites`,
  `joinRequests`.
- Messaging: `conversations`, `conversationMembers`, `messages`,
  `conversationPresence`, `conversationTyping`.
- Competitions: `competitions`, `competitionDays`, `scheduleBlocks`,
  `competitionEvents`, `eventDances`, `judges`, `competitionStaff`,
  `competitionJudges`, `pricingTiers`, `competitionRegistrations`, `entries`,
  `payments`, `tbaListings`, `teamMatchSubmissions`, `addDropRequests`,
  `rounds`, `heats`, `heatAssignments`, `eventTimeOverrides`, `callbackMarks`,
  `finalMarks`, `judgeSubmissions`, `callbackResults`, `finalResults`,
  `tabulationTables`, `roundResultsMeta`, `judgeSessions`, `activeRounds`,
  `markCorrections`, `registrationCheckins`, `deckCaptainCheckins`,
  `announcementNotes`, `feedbackForms`, `feedbackQuestions`,
  `feedbackResponses`, `feedbackAnswers`, `recordRemovalRequests`.

The committed schema must include concrete fields and indexes for every table in
that inventory so domain workers avoid schema merge conflicts.

- [ ] **Step 2: Add auth helpers**

Create `convex/lib/auth.ts`:

```ts
import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return identity;
}

export async function getCurrentUser(ctx: Ctx) {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
  if (!user) {
    throw new ConvexError({ code: "ONBOARDING_REQUIRED", message: "User profile required" });
  }
  return user;
}

export async function requireCurrentUserId(ctx: Ctx): Promise<Id<"users">> {
  const user = await getCurrentUser(ctx);
  return user._id;
}
```

- [ ] **Step 3: Add shared error helper**

Create `convex/lib/errors.ts`:

```ts
import { ConvexError } from "convex/values";

export function notFound(message = "Not found"): never {
  throw new ConvexError({ code: "NOT_FOUND", message });
}

export function forbidden(message = "Forbidden"): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

export function badRequest(message = "Bad request"): never {
  throw new ConvexError({ code: "BAD_REQUEST", message });
}
```

- [ ] **Step 4: Add money helpers**

Create `convex/lib/money.ts`:

```ts
export function dollarsToCents(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid money value");
  return Math.round(parsed * 100);
}

export function centsToDollarString(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Invalid cents value");
  return (cents / 100).toFixed(2);
}
```

- [ ] **Step 5: Add time helpers**

Create `convex/lib/time.ts`:

```ts
export function now() {
  return Date.now();
}

export function minutesFromNow(minutes: number) {
  return now() + minutes * 60_000;
}

export function isFresh(timestamp: number, ttlMs: number) {
  return now() - timestamp <= ttlMs;
}
```

- [ ] **Step 6: Add pagination helper**

Create `convex/lib/pagination.ts`:

```ts
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function clampPageSize(limit: number | undefined) {
  if (!limit) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
}
```

- [ ] **Step 7: Add permission helpers**

Create `convex/lib/permissions.ts` with org and competition authorization
helpers equivalent to current `src/domains/orgs/lib/auth.ts` and
`src/domains/competitions/lib/auth.ts`.

Required exported names: `requireOrgRole`, `requireCompOrgRole`, and
`requireCompStaffRole`.

Use the same role semantics as current tRPC helpers.

- [ ] **Step 8: Write helper tests**

Create `convex/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { centsToDollarString, dollarsToCents } from "./money";

describe("money helpers", () => {
  it("converts dollars to cents", () => {
    expect(dollarsToCents("12.34")).toBe(1234);
  });

  it("formats cents as dollars", () => {
    expect(centsToDollarString(1234)).toBe("12.34");
  });
});
```

Create `convex/lib/auth.test.ts` with a `convex-test` case that inserts a user
and verifies lookup by Clerk subject through the helper.

- [ ] **Step 9: Validate schema and generated types**

Run:

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --once
pnpm test -- convex/lib/money.test.ts convex/lib/auth.test.ts convex/foundation.test.ts
```

Expected: Convex validation passes and helper tests pass.

- [ ] **Step 10: Commit**

Run:

```bash
git add convex vitest.config.ts package.json pnpm-lock.yaml
git commit -m "Define Convex schema and shared helpers"
```

---

## Task 3: Syllabus Migration

**Files:**
- Create: `convex/syllabus/dances.ts`
- Create: `convex/syllabus/figures.ts`
- Create: `convex/syllabus/import.ts`
- Create: `convex/syllabus.test.ts`
- Modify: `scripts/seed.ts` or create `scripts/seed-convex-syllabus.ts`
- Modify: `src/app/dances/page.tsx`
- Modify: `src/app/dances/[dance]/page.tsx`
- Modify: `src/app/dances/[dance]/figures/[id]/page.tsx`
- Modify: `src/app/dances/[dance]/figures/[id]/graph/page.tsx`
- Modify: `src/app/dances/[dance]/graph/page.tsx`
- Modify: `src/domains/syllabus/components/graph/dance-graph.tsx`

- [ ] **Step 1: Write Convex function tests**

Create tests for:

- listing all dances ordered by display name,
- finding a dance by slug/name,
- listing figures by dance and optional level,
- reading a figure with preceding/following edges,
- importing one dance, two figures, and one edge idempotently.

Run:

```bash
pnpm test -- convex/syllabus.test.ts
```

Expected before implementation: tests fail because functions do not exist.

- [ ] **Step 2: Implement syllabus queries and import mutation**

Implement public queries for read-only syllabus data and internal mutations for
seed/import. Use indexes from Task 2; do not scan the full `figures` table for a
dance page.

Required exported functions:

```text
// convex/syllabus/dances.ts
- `list` (query)
- `getByName` (query)

// convex/syllabus/figures.ts
- `listByDance` (query)
- `getDetail` (query)
- `neighbors` (query)

// convex/syllabus/import.ts
- `upsertDance` (internal mutation)
- `upsertFigure` (internal mutation)
- `upsertEdge` (internal mutation)
```

- [ ] **Step 3: Add current-data import script**

Create `scripts/seed-convex-syllabus.ts` that reads the existing `data/**/*.yaml`
files and calls the Convex import functions. The script should not redesign OCR
output; it should preserve current data as the test fixture.

Run:

```bash
pnpm tsx scripts/seed-convex-syllabus.ts --dry-run
```

Expected: prints counts of dances, figures, and edges that would be imported.

- [ ] **Step 4: Port syllabus UI**

Replace direct Drizzle and tRPC data access in syllabus pages/components with
Convex queries. Keep current routes and visual behavior.

- [ ] **Step 5: Validate**

Run:

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --once
pnpm test -- convex/syllabus.test.ts
pnpm build
```

Expected: syllabus tests pass and build succeeds.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/syllabus* scripts src/app/dances src/domains/syllabus
git commit -m "Migrate syllabus to Convex"
```

---

## Task 4: Routines Migration

**Files:**
- Create: `convex/routines.ts`
- Create: `convex/routines.test.ts`
- Modify: `src/app/routines/page.tsx`
- Modify: `src/app/routines/new/page.tsx`
- Modify: `src/app/routines/[id]/page.tsx`
- Modify: `src/app/routines/[id]/edit/page.tsx`
- Modify: `src/app/routines/dance/[dance]/page.tsx`
- Modify: `src/domains/routines/components/routine-builder.tsx`
- Modify: `src/domains/routines/components/dance-routines-list.tsx`

- [ ] **Step 1: Write routine function tests**

Cover create, update, publish/unpublish, add entry, remove entry, reorder
entries, and transition validation against Convex syllabus edges.

Run:

```bash
pnpm test -- convex/routines.test.ts
```

Expected before implementation: functions missing.

- [ ] **Step 2: Implement routine functions**

Required exported functions:

```text
- `listMine` (query)
- `listByDance` (query)
- `get` (query)
- `create` (mutation)
- `update` (mutation)
- `setPublished` (mutation)
- `addEntry` (mutation)
- `removeEntry` (mutation)
- `reorderEntries` (mutation)
- `remove` (mutation)
```

All mutations must derive the current user from Convex auth helpers.

- [ ] **Step 3: Port routine UI**

Replace `trpc.routine.*` and `trpc.figure.*` usage in routine screens with
Convex hooks. Keep the builder interaction model unchanged.

- [ ] **Step 4: Validate**

Run:

```bash
pnpm test -- convex/routines.test.ts
pnpm build
```

Expected: routine tests pass and no migrated routine screen imports tRPC.

- [ ] **Step 5: Commit**

Run:

```bash
git add convex/routines.ts convex/routines.test.ts src/app/routines src/domains/routines
git commit -m "Migrate routines to Convex"
```

---

## Task 5: Social Identity, Profiles, Follows, Notifications Base

**Files:**
- Create: `convex/users.ts`
- Create: `convex/social/profiles.ts`
- Create: `convex/social/follows.ts`
- Create: `convex/social/notifications.ts`
- Create: `convex/social-base.test.ts`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/settings/profile/page.tsx`
- Modify: `src/app/users/[username]/page.tsx`
- Modify: `src/domains/social/components/profile-header.tsx`
- Modify: `src/domains/social/components/profile-settings.tsx`
- Modify: `src/domains/social/components/follow-button.tsx`
- Modify: `src/domains/social/components/follow-list-dialog.tsx`
- Modify: `src/domains/social/components/notification-bell.tsx`
- Modify: `src/domains/social/components/notification-panel.tsx`

- [ ] **Step 1: Write tests**

Cover user upsert from Clerk identity, onboarding-needed detection, profile
update, username uniqueness, follow/unfollow, private-user pending follows, and
notification unread/list/mark-read behavior.
Use `identity.tokenIdentifier` as the stable Convex auth key and store
`identity.subject` as `clerkUserId` for compatibility with existing Clerk-ID
semantics.

- [ ] **Step 2: Implement user/profile/follow functions**

Required exported functions:

```text
// convex/users.ts
- `me` (query)
- `ensureCurrentUser` (mutation)
- `updateProfile` (mutation)
- `needsOnboarding` (query)

// convex/social/profiles.ts
- `getByUsername` (query)
- `search` (query)
- `followers` (query)
- `following` (query)

// convex/social/follows.ts
- `status` (query)
- `follow` (mutation)
- `unfollow` (mutation)
- `approve` (mutation)
- `reject` (mutation)
```

- [ ] **Step 3: Implement notification functions**

Required exported functions:

```text
- `unreadCount` (query)
- `list` (query)
- `markRead` (mutation)
- `markAllRead` (mutation)
- `createInternal` (internal mutation)
```

- [ ] **Step 4: Port profile/follow/notification UI**

Replace relevant `trpc.profile`, `trpc.follow`, and `trpc.notification` calls.
Keep social post/feed work for Task 7.

- [ ] **Step 5: Validate**

Run:

```bash
pnpm test -- convex/social-base.test.ts
pnpm build
rg -n 'trpc\\.(profile|follow|notification)' src/app src/domains/social
```

Expected: test passes, build succeeds, and `rg` shows only intentionally
unmigrated Task 7 references.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/users.ts convex/social src/app/onboarding src/app/settings src/app/users src/domains/social
git commit -m "Migrate social identity to Convex"
```

---

## Task 6: Organizations Migration

**Files:**
- Create: `convex/orgs.ts`
- Create: `convex/orgs.test.ts`
- Modify: `src/app/orgs/page.tsx`
- Modify: `src/app/orgs/create/page.tsx`
- Modify: `src/app/orgs/[slug]/page.tsx`
- Modify: `src/app/orgs/[slug]/settings/page.tsx`
- Modify: `src/app/orgs/invite/[token]/page.tsx`
- Modify: `src/app/invites/page.tsx`
- Modify: `src/domains/orgs/components/*`

- [ ] **Step 1: Write organization tests**

Cover org creation, owner membership, open join, invite-only flow, request flow,
role update, transfer ownership, leave, delete, invite token accept/decline, and
join request approve/reject.

- [ ] **Step 2: Implement org functions**

Required exported functions:

```text
- `discover` (query)
- `listUserOrgs` (query)
- `getBySlug` (query)
- `create` (mutation)
- `update` (mutation)
- `remove` (mutation)
- `getMyMembership` (query)
- `listMembers` (query)
- `join` (mutation)
- `leave` (mutation)
- `updateRole` (mutation)
- `transferOwnership` (mutation)
- `generateInviteLink` (mutation)
- `sendInvite` (mutation)
- `acceptInvite` (mutation)
- `declineInvite` (mutation)
- `requestJoin` (mutation)
- `approveJoinRequest` (mutation)
- `rejectJoinRequest` (mutation)
```

- [ ] **Step 3: Preserve org channel membership effects**

When a user joins an org, create or update membership in the org channel data
model needed by Task 8. If messaging is not implemented yet, create
`ensureOrgChannelMembershipInputs(orgId, userId)` in `convex/orgs.ts` returning
the org ID, user ID, and role data Task 8 needs to create the conversation
member without changing org UI behavior.

- [ ] **Step 4: Port org UI**

Replace `trpc.org`, `trpc.membership`, `trpc.invite`, and `trpc.joinRequest`
usage in org screens and components.

- [ ] **Step 5: Validate**

Run:

```bash
pnpm test -- convex/orgs.test.ts
pnpm build
rg -n 'trpc\\.(org|membership|invite|joinRequest)' src/app src/domains/orgs
```

Expected: tests pass and no org tRPC calls remain.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/orgs.ts convex/orgs.test.ts src/app/orgs src/app/invites src/domains/orgs
git commit -m "Migrate organizations to Convex"
```

---

## Task 7: Social Content, Feed, Saves, Partner Search

**Files:**
- Create: `convex/social/posts.ts`
- Create: `convex/social/comments.ts`
- Create: `convex/social/likes.ts`
- Create: `convex/social/saves.ts`
- Create: `convex/social/partnerSearch.ts`
- Create: `convex/social-content.test.ts`
- Modify: `src/app/feed/page.tsx`
- Modify: `src/app/posts/new/page.tsx`
- Modify: `src/app/posts/[id]/page.tsx`
- Modify: `src/app/posts/[id]/edit/page.tsx`
- Modify: `src/app/saved/page.tsx`
- Modify: `src/app/partners/page.tsx`
- Modify: `src/domains/social/components/*`

- [ ] **Step 1: Write tests**

Cover article creation/edit/delete, routine share posts, comment threads,
comment replies, like/unlike post, like/unlike comment, save folder CRUD,
save/unsave, public/followers/org visibility, following feed, explore feed, and
partner-search profile upsert/remove/discover.

- [ ] **Step 2: Implement post/feed functions**

Required exported functions:

```text
- `createArticle` (mutation)
- `update` (mutation)
- `publish` (mutation)
- `remove` (mutation)
- `get` (query)
- `followingFeed` (query)
- `exploreFeed` (query)
- `listByOrg` (query)
- `listDrafts` (query)
```

Use explicit pagination args and index-backed ordering.

- [ ] **Step 3: Implement comments, likes, saves, partner search**

Implement the existing tRPC behavior with Convex functions and notifications
via the internal notification helper from Task 5.

- [ ] **Step 4: Port social content UI**

Replace social content tRPC hooks with Convex hooks. Do not modify org
membership logic owned by Task 6.

- [ ] **Step 5: Validate**

Run:

```bash
pnpm test -- convex/social-content.test.ts
pnpm build
rg -n 'trpc\\.(post|feed|comment|like|save|partnerSearch|orgPost)' src/app src/domains/social src/domains/orgs
```

Expected: tests pass and no migrated social content tRPC calls remain.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/social src/app/feed src/app/posts src/app/saved src/app/partners src/domains/social src/domains/orgs
git commit -m "Migrate social content to Convex"
```

---

## Task 8: Messaging Migration

**Files:**
- Create: `convex/messaging.ts`
- Create: `convex/messaging.test.ts`
- Delete after migration: `src/domains/messaging/lib/ably-client.ts`
- Delete after migration: `src/domains/messaging/lib/ably-server.ts`
- Modify: `src/app/messages/layout.tsx`
- Modify: `src/app/messages/page.tsx`
- Modify: `src/app/messages/[conversationId]/page.tsx`
- Modify: `src/domains/messaging/components/*`

- [ ] **Step 1: Write messaging tests**

Cover get/create DM, create group, create org channel, add member, list
conversations with unread counts, message history pagination, send message,
mark read, typing heartbeat, presence heartbeat, and stale heartbeat filtering.

- [ ] **Step 2: Implement conversation and message functions**

Required exported functions:

```text
- `listConversations` (query)
- `getOrCreateDM` (mutation)
- `createGroup` (mutation)
- `createOrgChannel` (internal mutation)
- `addMember` (mutation)
- `history` (query)
- `send` (mutation)
- `markRead` (mutation)
```

- [ ] **Step 3: Implement typing and presence**

Use short-lived records with timestamps. Required functions:

```text
- `heartbeatPresence` (mutation)
- `setTyping` (mutation)
- `activePresence` (query)
- `activeTyping` (query)
- `cleanupStalePresence` (internal mutation)
```

Queries must filter by `lastSeenAt` or `updatedAt` using a TTL constant.

- [ ] **Step 4: Port messaging UI and remove Ably for messaging**

Replace `useConversationMessages`, `useConversationPresence`, and
`useTypingIndicator` with Convex-backed hooks or direct Convex query/mutation
usage.

- [ ] **Step 5: Validate**

Run:

```bash
pnpm test -- convex/messaging.test.ts
pnpm build
rg -n 'ably|Ably|trpc\\.(conversation|message|ablyAuth)' src/app/messages src/domains/messaging
```

Expected: messaging tests pass; no messaging Ably or tRPC references remain.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/messaging.ts convex/messaging.test.ts src/app/messages src/domains/messaging
git commit -m "Migrate messaging to Convex"
```

---

## Task 9: Competitions Core Migration

**Files:**
- Create: `convex/competitions/core.ts`
- Create: `convex/competitions/schedule.ts`
- Create: `convex/competitions/events.ts`
- Create: `convex/competitions/judges.ts`
- Create: `convex/competitions/staff.ts`
- Create: `convex/competitions/registration.ts`
- Create: `convex/competitions/entries.ts`
- Create: `convex/competitions/addDrop.ts`
- Create: `convex/competitions/core.test.ts`
- Modify: competition create/dashboard/register/entries/add-drop/tba/team-match pages and components.

- [ ] **Step 1: Split current competition router behavior into Convex modules**

Use the existing routers under `src/domains/competitions/routers/` as the
behavior reference. Do not try to port all competition code in one file.

- [ ] **Step 2: Write core tests**

Cover competition create/update/delete/status, schedule days/blocks, event
creation/default generation, judges/staff assignment, registration, partner
registration, entry create/remove, number assignment, TBA listing, team match,
and add/drop request approve/reject.

- [ ] **Step 3: Implement core Convex functions**

Required module groups:

```ts
// convex/competitions/core.ts
create, update, remove, getBySlug, list, getForDashboard, setupStatus, updateStatus

// convex/competitions/schedule.ts
getDays, addDay, updateDay, removeDay, addBlock, updateBlock, removeBlock,
reorderBlocks, moveBlock, applyDefaultTemplate

// convex/competitions/events.ts
listByCompetition, create, update, remove, generateDefaults

// convex/competitions/registration.ts
register, getMyRegistration, getById, listByCompetition, cancel,
ensurePartnerRegistered, updatePricingTier, toggleCheckedIn

// convex/competitions/entries.ts
bulkCreate, remove, listByCompetition, getPartnerEntries
```

- [ ] **Step 4: Port core competition UI**

Migrate setup, registration, entries, add/drop, TBA, team match, dashboard
settings, schedule, events, judges, staff, numbers, and registration list pages.
Leave live/scoring pages to Task 10 and payments to Task 11.

- [ ] **Step 5: Validate**

Run:

```bash
pnpm test -- convex/competitions/core.test.ts
pnpm build
rg -n 'trpc\\.(competition|schedule|event|staff|judge|registration|entry|number|tba|teamMatch|addDrop)' src/app/competitions src/domains/competitions
```

Expected: core tests pass; remaining tRPC references are only for live/scoring
or payments if those tasks are not done.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/competitions src/app/competitions src/domains/competitions
git commit -m "Migrate competition core to Convex"
```

---

## Task 10: Competition Live And Scoring Migration

**Files:**
- Create: `convex/competitions/rounds.ts`
- Create: `convex/competitions/scoring.ts`
- Create: `convex/competitions/judgeSession.ts`
- Create: `convex/competitions/scrutineer.ts`
- Create: `convex/competitions/liveView.ts`
- Create: `convex/competitions/compDay.ts`
- Create: `convex/competitions/feedback.ts`
- Create: `convex/competitions/results.ts`
- Create: `convex/competitions/live-scoring.test.ts`
- Delete after migration: `src/domains/competitions/lib/ably-comp.ts`
- Delete after migration: `src/domains/competitions/lib/ably-comp-client.ts`
- Modify: judge, scoring, comp-day, live, display, results, feedback pages.

- [ ] **Step 1: Write live/scoring tests**

Cover round generation, heat assignment, start/stop active round, judge session
auth, callback mark submit, final mark submit, submission status, result
computation, review/publish, correction history, check-ins, announcements,
public live schedule, public results, feedback forms, and record removal.

- [ ] **Step 2: Implement live/scoring Convex modules**

Port the behavior from current routers:

- `round.ts`
- `scoring.ts`
- `judge-session.ts`
- `scrutineer.ts`
- `scrutineer-dashboard.ts`
- `registration-table.ts`
- `deck-captain.ts`
- `emcee.ts`
- `live-view.ts`
- `results.ts`
- `feedback.ts`
- `calendar.ts`
- `record-removal.ts`
- `org-competition.ts`
- `payment-analytics.ts` only for non-Stripe-derived analytics if Task 11 has
  not moved it yet.

- [ ] **Step 3: Replace Ably live invalidation**

Replace `useCompLive` and `useCompLiveWithInvalidation` with reactive Convex
queries. Preserve visible live/freshness status where reasonable. Do not add
online-user tracking.

- [ ] **Step 4: Port live/scoring UI**

Migrate:

- `src/app/judge/page.tsx`
- `src/app/competitions/[slug]/live/page.tsx`
- `src/app/competitions/[slug]/display/page.tsx`
- `src/app/competitions/[slug]/results/page.tsx`
- `src/app/competitions/[slug]/results/[eventId]/page.tsx`
- `src/app/competitions/[slug]/dashboard/scoring/page.tsx`
- `src/app/competitions/[slug]/dashboard/comp-day/**`
- feedback/results/org competition pages tied to live outputs.

- [ ] **Step 5: Validate**

Run:

```bash
pnpm test -- convex/competitions/live-scoring.test.ts
pnpm build
rg -n 'ably|Ably|trpc\\.(round|scoring|judgeSession|scrutineer|registrationTable|deckCaptain|emcee|scrutineerDashboard|liveView|results|feedback|calendar|recordRemoval|orgCompetition|paymentAnalytics)' src/app/competitions src/app/judge src/domains/competitions
```

Expected: live/scoring tests pass; no competition Ably references remain.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/competitions src/app/competitions src/app/judge src/domains/competitions
git commit -m "Migrate competition live scoring to Convex"
```

---

## Task 11: Stripe Payments And Webhook Fulfillment

**Files:**
- Create: `convex/competitions/payments.ts`
- Create: `convex/competitions/stripeActions.ts`
- Create: `convex/competitions/payments.test.ts`
- Create: `src/app/api/stripe/webhook/route.ts`
- Modify: `src/app/competitions/[slug]/dashboard/payments/page.tsx`
- Modify: registration payment call sites.
- Delete after migration: payment tRPC usage in `src/domains/competitions/routers/payment.ts`

- [ ] **Step 1: Write payment tests**

Cover manual payment, refund record, payment summary, checkout-session record
creation, idempotent webhook fulfillment by Checkout Session ID, idempotent
fulfillment by PaymentIntent ID, and Connect status persistence.

- [ ] **Step 2: Implement payment state functions**

Required exported functions:

```text
// convex/competitions/payments.ts
- `listByRegistration` (query)
- `summaryByCompetition` (query)
- `recordManual` (mutation)
- `recordRefund` (mutation)
- `fulfillCheckoutSession` (internal mutation)
- `getConnectStatusRecord` (query)
```

- [ ] **Step 3: Implement Stripe Node actions**

Create `convex/competitions/stripeActions.ts` with `"use node";`.

Required exported functions:

```text
- `createCheckoutSession` (action)
- `createConnectAccount` (action)
- `refreshConnectStatus` (action)
```

Actions call Stripe; mutations persist source-of-truth state.

- [ ] **Step 4: Add Next.js webhook route**

Create `src/app/api/stripe/webhook/route.ts`:

```ts
import Stripe from "stripe";
import { fetchMutation } from "convex/nextjs";
import { internal } from "../../../../../convex/_generated/api";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await fetchMutation(internal.competitions.payments.fulfillCheckoutSession, {
      checkoutSessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
      amountTotal: session.amount_total ?? 0,
      metadata: session.metadata ?? {},
    });
  }

  return Response.json({ received: true });
}
```

- [ ] **Step 5: Port payment UI**

Replace `trpc.payment.*` and payment analytics call sites with Convex actions
and queries. Keep Checkout hosted by Stripe.

- [ ] **Step 6: Validate**

Run:

```bash
pnpm test -- convex/competitions/payments.test.ts
pnpm build
rg -n 'trpc\\.(payment|paymentAnalytics)' src/app src/domains/competitions
```

Expected: payment tests pass; no payment tRPC references remain.

- [ ] **Step 7: Commit**

Run:

```bash
git add convex/competitions src/app/api/stripe src/app/competitions src/domains/competitions
git commit -m "Migrate payments to Convex"
```

---

## Task 12: Final Cleanup, Docs, And Full Verification

**Files:**
- Delete: `src/shared/db/index.ts`
- Delete: `src/shared/db/enums.ts`
- Delete: `src/shared/auth/trpc.ts`
- Delete: `src/shared/auth/routers.ts`
- Delete: `src/shared/lib/trpc.ts`
- Delete: `src/app/api/trpc/[trpc]/route.ts`
- Delete: `drizzle.config.ts`
- Delete: Drizzle schema files after confirming no imports remain.
- Delete: local Postgres test setup files superseded by Convex tests.
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`
- Modify: `docs/testing.md`
- Modify: `docs/comp-organizer/**` where Neon/tRPC/Ably references are obsolete.

- [ ] **Step 1: Run dependency scans**

Run:

```bash
rg -n '@neondatabase|drizzle-orm|@trpc|trpc\\.|Ably|ably|DATABASE_URL|drizzle|PostgreSQL|Neon' src tests docs scripts package.json
```

Expected: output identifies only files to remove or docs to update.

- [ ] **Step 2: Remove old backend dependencies**

Remove packages only after scans prove no code imports them:

```bash
pnpm remove @neondatabase/serverless drizzle-orm drizzle-kit pg @types/pg @trpc/client @trpc/next @trpc/react-query @trpc/server ably superjson
```

Keep `stripe`, Clerk, Convex, React Query only if still used for non-tRPC
features. Remove React Query if no direct usage remains.

- [ ] **Step 3: Delete old backend files**

Delete old tRPC, Drizzle, Neon, Ably, and Postgres test files. Do not delete
domain UI/component files unless all migrated replacements are already committed.

- [ ] **Step 4: Update docs**

Update README setup to use Convex:

```bash
pnpm install
CONVEX_AGENT_MODE=anonymous npx convex dev --once
pnpm dev
```

Remove Neon setup as the primary path. Document Clerk Convex JWT setup and
Stripe webhook env vars.

- [ ] **Step 5: Run full verification**

Run:

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --once
pnpm test
pnpm build
pnpm test:e2e
rg -n '@neondatabase|drizzle-orm|@trpc|trpc\\.|Ably|ably|DATABASE_URL' src tests scripts
```

Expected:

- Convex validation passes.
- Unit/integration tests pass.
- Build passes.
- E2E tests pass or any failures are documented with exact migrated flow gaps.
- Final `rg` scan returns no app/test/script references.

- [ ] **Step 6: Commit**

Run:

```bash
git add -A
git commit -m "Remove Neon tRPC and Ably remnants"
```

---

## Plan Approval Checklist

Before filing or dispatching issues, confirm:

- [ ] Human has approved this plan.
- [ ] Branch is `convex-migration`.
- [ ] Foundation tasks are filed before dependent domain tasks.
- [ ] Issue dependencies match the dependency graph in this plan.
- [ ] No issue is dispatched before dependencies are set.
- [ ] Domain issues include file ownership notes to avoid staging unrelated files.
- [ ] `wof-c7p` remains future work and is not part of this migration dispatch.

## Recommended Issue Titles

Use these titles when converting the plan to work items after approval:

1. `Set up Convex foundation and Clerk provider`
2. `Define Convex schema and shared helpers`
3. `Migrate syllabus domain to Convex`
4. `Migrate routines domain to Convex`
5. `Migrate social identity to Convex`
6. `Migrate organizations domain to Convex`
7. `Migrate social content and feeds to Convex`
8. `Migrate messaging and presence to Convex`
9. `Migrate competition core workflows to Convex`
10. `Migrate competition live and scoring to Convex`
11. `Migrate Stripe payments and webhooks to Convex`
12. `Remove Neon tRPC Drizzle and Ably remnants`

## Final Handoff Notes For Polecats

Each polecat should:

- Read the design spec and this plan before editing.
- Work only on `convex-migration`.
- Use Convex official guidance installed in `.agents/skills` when touching
  Convex functions, auth, or migrations.
- Start with tests for the owned domain.
- Run the domain-specific validation command before committing.
- Commit only files owned by its issue.
- Avoid broad formatting and unrelated cleanup.
