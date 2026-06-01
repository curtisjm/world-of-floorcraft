# Convex Backend

This directory is the current backend for World of Floorcraft. The Convex
migration has landed: schema, generated types, shared helpers, domain functions,
Stripe actions, and Convex function tests all live here.

## Current state

| Path | Purpose |
| --- | --- |
| `schema.ts` | Full application data model and indexes for syllabus, social, orgs, messaging, and competitions. |
| `auth.config.ts` | Tells Convex to trust Clerk-issued JWTs (`applicationID: "convex"`). Requires `CLERK_JWT_ISSUER_DOMAIN` in Convex deployment env. |
| `_generated/` | Convex-generated API and data model types. Regenerate with `npx convex dev`. |
| `lib/` | Shared auth, permissions, error, money, pagination, and time helpers. |
| `syllabus/`, `social/`, `competitions/`, `routines.ts`, `orgs.ts`, `messaging.ts`, `users.ts` | Backend queries, mutations, and actions consumed by the app. |
| `competitions/stripeActions.ts` | Node.js Convex actions for Stripe Connect and webhook fulfillment. |
| `*.test.ts`, `test.setup.ts` | `convex-test` coverage for the migrated backend. |

Convex reactive queries now provide live updates for messaging and competition
views; the old Drizzle/tRPC/Ably backend is no longer the primary path.

## Node version

Use Node 22 for local Convex work. Convex Node actions currently support Node
18, 20, 22, and 24; Node 26 is not supported for the Stripe Node actions.

The Nix flake provides Node 22. Without Nix, run Convex commands through mise:

```bash
mise exec node@22 -- npx convex dev --once
```

## Environment variables

Keep browser/server Next.js variables in `.env.local`, and set backend-only
values on the Convex deployment with `npx convex env set`.

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Deployment URL. Written by `npx convex dev`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Clerk publishable key used by Next.js. |
| `CLERK_SECRET_KEY` | `.env.local` | Clerk secret key used by Next.js/server routes. |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex deployment env | Clerk Frontend API URL / JWT issuer from https://dashboard.clerk.com/apps/setup/convex. Required by `auth.config.ts`. |
| `JUDGE_JWT_SECRET` | Convex deployment env | Strong random signing secret for judge tablet JWTs. Required by `competitions/lib/judgeAuth.ts`; must be at least 32 characters long. |
| `STRIPE_SECRET_KEY` | Convex deployment env, optional | Used by Stripe Node actions when online competition payments are enabled. |
| `STRIPE_CHECKOUT_ALLOWED_ORIGINS` | Convex deployment env, optional | Comma-separated list of allowed app origins for Stripe Checkout success/cancel redirects, for example `https://your-app.example.com,http://localhost:3000`. |
| `STRIPE_WEBHOOK_SECRET` | Convex deployment env, optional | Stripe webhook signing secret. |

Set required Convex deployment env before validating functions:

```bash
mise exec node@22 -- npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
mise exec node@22 -- npx convex env set JUDGE_JWT_SECRET "$(openssl rand -base64 32)"
```

Stripe is intentionally optional. Manual payment recording and analytics work
without it. When you are ready to enable online competition registration
payments, set the Stripe values on the Convex deployment:

```bash
mise exec node@22 -- npx convex env set STRIPE_SECRET_KEY sk_test_...
mise exec node@22 -- npx convex env set STRIPE_CHECKOUT_ALLOWED_ORIGINS https://your-app.example.com,http://localhost:3000
mise exec node@22 -- npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
```

## Provisioning and validation

From a fresh checkout:

```bash
pnpm install
cp .env.example .env.local
# Fill Clerk/Stripe values in .env.local as needed for the Next.js app.

# Link/create the Convex dev deployment and write NEXT_PUBLIC_CONVEX_URL.
# On a fresh deployment, this may stop after creation because required Convex
# env values such as CLERK_JWT_ISSUER_DOMAIN or JUDGE_JWT_SECRET are not set
# yet; continue with `convex env set` and rerun validation.
mise exec node@22 -- npx convex dev --once

# Set the required Convex deployment env values, then validate again.
mise exec node@22 -- npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
mise exec node@22 -- npx convex env set JUDGE_JWT_SECRET "$(openssl rand -base64 32)"
mise exec node@22 -- npx convex dev --once
```

Use `pnpm convex:dev` for watch mode after the deployment env is configured.
Set Stripe env later only when you want to enable online competition checkout.

## Billing decision

Keep competition registration payments on direct Stripe Connect for now. Clerk
Billing is useful for recurring SaaS subscriptions to the application itself,
but it does not replace this app's per-competition checkout + organizer payout
flow. Clerk Billing is also a separate beta product from Stripe Billing, with
plans/subscriptions managed in Clerk rather than synced to Stripe. If World of
Floorcraft later adds platform subscriptions, evaluate Clerk Billing there;
for competition registration money movement, keep the Stripe integration
isolated behind optional Convex actions.

## Tests

Convex tests run under the `convex` vitest project (`edge-runtime` environment)
configured in `vitest.config.ts`:

```bash
pnpm test
pnpm vitest run convex/competitions/payments.test.ts
```

The tests use `convex-test` and do not require live Clerk, Stripe, or Convex
services.
