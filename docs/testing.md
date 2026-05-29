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

## Convex Dev Server and Validation

Use Node 22 for Convex CLI validation. Convex Node actions support Node
18/20/22/24; Node 26 is not supported for the Stripe Node actions in
`convex/competitions/stripeActions.ts`.

```bash
# One-shot type generation and schema/function validation
mise exec node@22 -- npx convex dev --once

# Watch mode after the deployment is configured
pnpm convex:dev
```

`convex dev` writes `NEXT_PUBLIC_CONVEX_URL` to `.env.local` and regenerates
`convex/_generated/`.

Convex-side auth, judge tablet JWTs, and Stripe validation need deployment
environment variables, not just local `.env.local` entries:

```bash
mise exec node@22 -- npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
mise exec node@22 -- npx convex env set JUDGE_JWT_SECRET "$(openssl rand -base64 32)"
mise exec node@22 -- npx convex env set STRIPE_SECRET_KEY sk_test_...
mise exec node@22 -- npx convex env set STRIPE_CHECKOUT_ALLOWED_ORIGINS https://your-app.example.com,http://localhost:3000
mise exec node@22 -- npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
mise exec node@22 -- npx convex dev --once
```

Keep `pnpm convex:dev` open while developing so Convex re-validates as you edit
functions. Convex function tests (`pnpm test`) use `convex-test` and do not need
live Convex, Clerk, or Stripe services.
