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


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
