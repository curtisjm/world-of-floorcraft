# World of Floorcraft

Ballroom dance figure graph app with social platform features. Next.js 15 App Router frontend, Convex backend, Clerk auth.

## Architecture

Domain-based UI structure with a Convex backend:

```
src/
  shared/          # @shared/* — UI primitives, components, lib helpers
  domains/
    syllabus/      # @syllabus/* — dance browsing, figure graph UI
    routines/      # @routines/* — routine builder UI
    social/        # @social/* — feed, posts, comments, likes, follows, saves UI
    orgs/          # @orgs/* — organizations UI
    messaging/     # @messaging/* — conversation UI
    competitions/  # @competitions/* — competition organizer UI
convex/
  schema.ts                  # All tables and indexes
  lib/                       # Auth, permission, money, time helpers
  syllabus/                  # Syllabus queries and import mutations
  routines.ts                # Routine queries and mutations
  social/                    # Profile, post, comment, like, save, notification functions
  orgs.ts                    # Organization functions
  messaging.ts               # Conversation, message, presence functions
  competitions/              # Competition core, scoring, payments, Stripe actions
```

Path aliases are defined in `tsconfig.json` and mirrored in `vitest.config.ts`.

Convex is the source of truth: queries/mutations are called from the UI via
`useQuery`/`useMutation` (client components) and `fetchQuery`/`fetchMutation`
from `convex/nextjs` (server components, route handlers). Clerk authentication
maps to Convex via a JWT template (`CLERK_JWT_ISSUER_DOMAIN`).

## Tests

Convex function tests run in vitest's edge-runtime environment using
`convex-test`. No external services required.

```bash
pnpm test                                # Run all Convex tests
pnpm vitest run convex/syllabus.test.ts  # Run one file
pnpm test:e2e                            # Playwright end-to-end tests
```

See `docs/testing.md` for the full test guide.

## Schema Management

`convex/schema.ts` defines every table and index. Adding a new domain table
means editing that one file, then `npx convex dev --once` to regenerate
`convex/_generated/*` and validate the schema.

## Common Commands

```bash
pnpm dev                                            # Start Next.js dev server
pnpm convex:dev                                      # Watch-mode Convex codegen
CONVEX_AGENT_MODE=anonymous npx convex dev --once    # One-shot Convex codegen
pnpm seed                                            # Seed Convex syllabus from YAML
pnpm test                                            # Run Convex function tests
```
