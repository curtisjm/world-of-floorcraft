# Figure Graph Next Features Plan

Last updated: 2026-03-19

## Scope

This plan captures the work that comes after the current baseline (schema/index hardening, route integrity checks, auth-scoped routine APIs, and docs sync).

## Immediate Work: Dagre Graph Layout

### Goal
Improve readability of full dance graphs by replacing the current row-based node placement with a directed-graph layout while keeping React Flow as the renderer.

### Implementation Notes
- Keep `@xyflow/react` as-is for rendering and interaction.
- Add `@dagrejs/dagre` for layout computation only.
- Update `layoutFull` in `src/components/graph/dance-graph.tsx` to:
  - create a Dagre graph from visible figures + edges,
  - set node dimensions and spacing,
  - run Dagre layout,
  - map Dagre coordinates back to React Flow node positions.
- Preserve level coloring, toggles, minimap, controls, and node links.
- Add a small level legend panel in full graph mode.

### Acceptance Criteria
- Full graph is materially more readable (fewer severe overlaps/crossings).
- `fitView` still frames the graph correctly.
- Local graph behavior remains unchanged.

---

## Remaining Roadmap (Post-Dagre)

### 1) Dance Figure List Search and Filters

#### Goal
Add instant client-side search and Bronze/Silver/Gold filtering on `/dances/[dance]`.

#### Primary Files
- `src/app/dances/[dance]/page.tsx`
- New client component (recommended): `src/components/dance/figure-list-filters.tsx`

#### Tasks
- Split page into server data load + client filtering UI.
- Filter by `name` and `variantName` (case-insensitive).
- Reuse graph toggle style for level filters.
- Add clear empty-state messaging.

#### Acceptance Criteria
- Typing in search updates list immediately.
- Level toggles match expected figure subsets.

### 2) Clerk Authentication and Route Protection

#### Goal
Complete auth wiring so routines and notes are tied to real signed-in users.

#### Primary Files
- `src/app/layout.tsx`
- `src/middleware.ts` (new)
- `src/server/trpc.ts`
- Header/nav components in layout

#### Tasks
- Wrap app in `<ClerkProvider>`.
- Protect `/routines(.*)` with Clerk middleware.
- Add sign in/up + user menu in header.
- Add a server-side user sync helper to ensure `users` row exists for authenticated users.

#### Acceptance Criteria
- Signed-out users are redirected from protected routine pages.
- Signed-in users can access routine routes and are represented in `users` table.

### 3) Routine Builder (Incremental)

#### Goal
Replace placeholder routine pages with a functional builder and persistence flow.

#### Primary Files
- `src/app/routines/page.tsx`
- `src/app/routines/new/page.tsx`
- `src/app/routines/[id]/page.tsx`
- `src/server/routers/routine.ts`

#### Tasks
- Expand routine router procedures (update metadata, replace/reorder entries).
- Build list/create/edit pages with ownership-safe data access.
- Add searchable figure picker by dance.
- Add drag-and-drop ordering (recommended: `@dnd-kit/core`).
- Validate each transition against `figure_edges` and display pass/warn state.
- Support optional `wallSegment` and entry notes.

#### Acceptance Criteria
- User can create, reorder, save, and reload routines.
- Validation status is visible and accurate per adjacent pair.

### 4) User Figure Notes

#### Goal
Allow authenticated users to create/edit/delete personal notes per figure.

#### Primary Files
- `src/server/routers/figure.ts`
- `src/app/dances/[dance]/figures/[id]/page.tsx`
- New client notes UI component (recommended): `src/components/figure/figure-notes.tsx`

#### Tasks
- Add note CRUD procedures with user scoping.
- Render notes section below precede/follow cards.
- Keep notes plaintext.

#### Acceptance Criteria
- Notes persist per `(user, figure)` and are not visible/editable by other users.

### 5) Data Completeness and Quality Follow-Up

#### Goal
Improve source data completeness and edge matching quality.

#### Primary Areas
- `data/` (add Viennese Waltz YAML)
- `scripts/seed.ts`

#### Tasks
- Add missing Viennese Waltz source files.
- Rerun `pnpm db:seed` and verify dance counts.
- Improve unmatched edge handling iteratively from seed report samples.

#### Acceptance Criteria
- Viennese Waltz appears with non-zero figures in UI.
- Edge match rate improves from current baseline.

---

## Verification Standard for Each Feature

- Run `pnpm lint`.
- Run `pnpm build`.
- Verify feature behavior manually in `pnpm dev`.
- Update `PROJECT_STATUS.md` after feature completion.
- Commit with conventional commit messages.
