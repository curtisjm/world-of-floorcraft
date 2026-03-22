# Agent Review Summary

This file summarizes the most recent project changes so another agent can quickly review code quality, correctness, and readiness.

## Recent committed changes (already in git)

- `eeafc44` `fix: enforce dance slug checks on figure routes`
  - Figure detail/local graph routes now verify figure belongs to URL dance slug.
  - Files: `src/app/dances/[dance]/figures/[id]/page.tsx`, `src/app/dances/[dance]/figures/[id]/graph/page.tsx`

- `3aa23a8` `fix: keep local graph center visible and use Next links`
  - Graph nodes use Next.js navigation.
  - Local graph center node remains visible when level filters hide its level.
  - Files: `src/components/graph/figure-node.tsx`, `src/components/graph/dance-graph.tsx`

- `2b4580b` `fix: scope routine APIs to authenticated users`
  - Added auth-aware tRPC context and protected routine procedures.
  - Files: `src/server/trpc.ts`, `src/server/routers/routine.ts`

- `2d0ddac` `fix: add DB indexes and deduplicate figure edge inserts`
  - Added indexes/uniqueness constraints and seed-time edge dedupe.
  - Files: `src/db/schema.ts`, `scripts/seed.ts`

- `c954933` `docs: sync status docs with implemented graph and API work`
  - Updated status docs to match implementation.
  - Files: `README.md`, `PROJECT_STATUS.md`

## Current uncommitted work (Dagre feature)

### 1) New dependency
- Added `@dagrejs/dagre`.
- Files: `package.json`, `pnpm-lock.yaml`

### 2) New full-graph layout utility
- Added Dagre-based layout function for full graphs.
- File: `src/components/graph/full-layout.ts`

### 3) New tests for layout utility
- Added node:test coverage for:
  - directed chain top-to-bottom ordering,
  - finite positions for disconnected graphs.
- File: `src/components/graph/full-layout.test.ts`

### 4) Full graph wiring + legend
- Full graph path now uses Dagre positioning (local graph path unchanged).
- Added a full-graph level legend panel (Bronze/Silver/Gold).
- File: `src/components/graph/dance-graph.tsx`

### 5) Roadmap document
- Added explicit next-feature plan for future work sequencing.
- File: `NEXT_FEATURES_PLAN.md`

## Validation run on current uncommitted Dagre changes

- `pnpm tsx --test "src/components/graph/full-layout.test.ts"` -> pass
- `pnpm lint` -> pass
- `pnpm build` -> pass

## Suggested review focus areas

1. Dagre configuration quality (`rankdir`, `nodesep`, `ranksep`, fallback behavior).
2. Full graph readability trade-offs vs previous row layout.
3. Regression risk between full graph and local graph code paths.
4. Legend UX consistency with existing level filters.
5. Test sufficiency for layout behavior and edge cases.

## Non-feature untracked files present in working tree

- `The Ballroom Technique.pdf`
- `data/extracted/debug_page-29.txt`
- `data/extracted/debug_page-44.txt`
- `data/extracted/debug_page-53.txt`
- `data/extracted/debug_page-67.txt`
