# Testing Guide

## Quick Start

Convex function tests run in an edge-runtime environment using `convex-test` — no external services needed.

### Running Tests

```bash
# All Convex tests
pnpm test

# One file
pnpm vitest run convex/syllabus.test.ts

# Watch mode
pnpm vitest convex/messaging.test.ts
```

End-to-end tests run with Playwright:

```bash
pnpm test:e2e         # Headless
pnpm test:e2e:ui      # Interactive UI mode
```

## How Convex Tests Work

`convex-test` loads `convex/schema.ts` and a glob of function modules
(`convex/test.setup.ts` builds the glob) into an in-memory database. Each
test creates a fresh `convexTest(schema, modules)` instance, so tests are
isolated without truncation hooks.

Auth is faked through `t.withIdentity({ tokenIdentifier, subject })`, which
maps to the `users.tokenIdentifier`/`clerkUserId` index keys used by
`convex/lib/auth.ts`.

## Test Layout

```
convex/
  schema.ts                  # Tables and indexes shared by every test
  test.setup.ts              # `import.meta.glob` of function modules
  foundation.test.ts         # Sanity check that schema loads
  lib/
    auth.test.ts
    money.test.ts
  syllabus.test.ts
  routines.test.ts
  social-base.test.ts
  social-content.test.ts
  orgs.test.ts
  messaging.test.ts
  competitions/
    core.test.ts
    live-scoring.test.ts
    payments.test.ts
```

## Writing a Test

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

describe("example", () => {
  it("creates a row", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        tokenIdentifier: "fake|user1",
        clerkUserId: "user1",
        isPrivate: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ tokenIdentifier: "fake|user1", subject: "user1" })
      .query(api.users.me, {});

    expect(result?._id).toEqual(userId);
  });
});
```

Key patterns:
- **`convexTest(schema, modules)`** per test — fresh in-memory database
- **`t.run(ctx)`** — direct database access for arrange/setup
- **`t.withIdentity({...})`** — fake an authenticated caller
- **`t.query(api.x.y, args)` / `t.mutation(...)`** — invoke a Convex function

## Convex Dev Server

For local manual testing, run the Convex dev server:

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --once   # one-shot regen
pnpm convex:dev                                     # watch mode
```

The first run generates `convex/_generated/`. Keep `pnpm convex:dev` open
while developing so Convex re-validates as you edit functions.
