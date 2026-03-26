# Phase 0: Codebase Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the existing flat `src/` structure into a domain-based modular monolith (`src/domains/` + `src/shared/`) with zero feature changes.

**Architecture:** Move existing files into domain directories (syllabus, routines) and extract shared code (auth, db, ui, lib) into `src/shared/`. Update all imports to use the new paths. The app continues to work identically — this is a pure refactor.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM, tRPC v11, Clerk

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Architecture: Modular Monolith" section

---

## File Structure

### New directory layout

```
src/
  domains/
    syllabus/
      schema.ts              ← moved from src/db/schema.ts (dances, figures, figureEdges, figureNotes tables only)
      routers/
        dance.ts             ← moved from src/server/routers/dance.ts
        figure.ts            ← moved from src/server/routers/figure.ts
      components/
        graph/
          dance-graph.tsx    ← moved from src/components/graph/dance-graph.tsx
          figure-node.tsx    ← moved from src/components/graph/figure-node.tsx
          full-layout.ts     ← moved from src/components/graph/full-layout.ts
          full-layout.test.ts
        dance/
          figure-list-filters.tsx ← moved from src/components/dance/figure-list-filters.tsx
          dance-order.ts     ← moved from src/app/dances/dance-order.ts
          dance-order.test.ts
    routines/
      schema.ts              ← moved from src/db/schema.ts (routines, routineEntries tables only)
      routers/
        routine.ts           ← moved from src/server/routers/routine.ts
      components/
        routine-builder.tsx  ← moved from src/components/routine/routine-builder.tsx
        figure-picker.tsx    ← moved from src/components/routine/figure-picker.tsx
        dance-routines-list.tsx ← moved from src/components/routine/dance-routines-list.tsx
  shared/
    auth/
      trpc.ts                ← moved from src/server/trpc.ts
      auth.ts                ← moved from src/server/auth.ts
    db/
      index.ts               ← moved from src/db/index.ts
      enums.ts               ← extracted from src/db/schema.ts (levelEnum, wallSegmentEnum)
    schema.ts                ← moved from src/db/schema.ts (users table only)
    ui/                      ← moved from src/components/ui/ (all shadcn components)
    components/
      providers.tsx          ← moved from src/components/providers.tsx
    lib/
      trpc.ts                ← moved from src/lib/trpc.ts
      utils.ts               ← moved from src/lib/utils.ts
      clerk-appearance.ts    ← moved from src/lib/clerk-appearance.ts
  app/                       ← stays in place (Next.js requires src/app/)
  middleware.ts              ← stays in place (Next.js requires src/middleware.ts)
```

### Key decisions

- `src/app/` stays where it is — Next.js App Router requires this path. Pages import from domains.
- `src/middleware.ts` stays at root — Next.js requires this exact location.
- The combined `src/db/schema.ts` is split into 4 files: `shared/db/enums.ts` (shared enums), `shared/schema.ts` (users), `domains/syllabus/schema.ts` (dances, figures, edges, figureNotes), `domains/routines/schema.ts` (routines, entries).
- Each domain schema re-exports shared enums it uses so consumers don't need to know the split.
- `drizzle.config.ts` must reference all schema files.
- The tRPC router aggregation moves to `shared/auth/` since it imports from all domains.

### tsconfig path aliases

The `@/` alias currently maps to `src/`. We add additional aliases for cleaner imports:

```json
"paths": {
  "@/*": ["./src/*"],
  "@shared/*": ["./src/shared/*"],
  "@syllabus/*": ["./src/domains/syllabus/*"],
  "@routines/*": ["./src/domains/routines/*"]
}
```

---

## Tasks

### Task 1: Create directory structure and move shared files

**Files:**
- Create: `src/shared/db/enums.ts`
- Create: `src/shared/schema.ts`
- Create: `src/shared/auth/` (directory)
- Create: `src/shared/lib/` (directory)
- Create: `src/shared/ui/` (directory)
- Create: `src/shared/components/` (directory)
- Move: `src/db/index.ts` → `src/shared/db/index.ts`
- Move: `src/server/trpc.ts` → `src/shared/auth/trpc.ts`
- Move: `src/server/auth.ts` → `src/shared/auth/auth.ts`
- Move: `src/lib/trpc.ts` → `src/shared/lib/trpc.ts`
- Move: `src/lib/utils.ts` → `src/shared/lib/utils.ts`
- Move: `src/lib/clerk-appearance.ts` → `src/shared/lib/clerk-appearance.ts`
- Move: `src/lib/clerk-appearance.test.ts` → `src/shared/lib/clerk-appearance.test.ts`
- Move: `src/components/providers.tsx` → `src/shared/components/providers.tsx`
- Move: `src/components/ui/*` → `src/shared/ui/*`

- [ ] **Step 1: Create the shared directory tree**

```bash
mkdir -p src/shared/{db,auth,lib,ui,components}
```

- [ ] **Step 2: Extract shared enums from schema**

Create `src/shared/db/enums.ts`:

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const levelEnum = pgEnum("level", [
  "student_teacher",
  "associate",
  "licentiate",
  "fellow",
]);

export const wallSegmentEnum = pgEnum("wall_segment", [
  "long1",
  "short1",
  "long2",
  "short2",
]);
```

- [ ] **Step 3: Extract users table to shared schema**

Create `src/shared/schema.ts`:

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 4: Move db/index.ts**

```bash
mv src/db/index.ts src/shared/db/index.ts
```

Update the import in `src/shared/db/index.ts` — remove the schema import since it now needs to import from multiple schema files. The schema import is only used for the generic type. Change to:

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";

let _db: NeonHttpDatabase | null = null;

export function getDb() {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql);
  }
  return _db;
}

export const db = new Proxy({} as NeonHttpDatabase, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

- [ ] **Step 5: Move auth files**

```bash
mv src/server/trpc.ts src/shared/auth/trpc.ts
mv src/server/auth.ts src/shared/auth/auth.ts
```

Update `src/shared/auth/auth.ts` import:

```typescript
import { eq } from "drizzle-orm";
import { getDb } from "@shared/db";
import { users } from "@shared/schema";
```

Update `src/shared/auth/trpc.ts` import:

```typescript
import { auth } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ensureUser } from "./auth";
```

(The `ensureUser` import is already relative so it stays the same.)

- [ ] **Step 6: Move lib files**

```bash
mv src/lib/trpc.ts src/shared/lib/trpc.ts
mv src/lib/utils.ts src/shared/lib/utils.ts
mv src/lib/clerk-appearance.ts src/shared/lib/clerk-appearance.ts
mv src/lib/clerk-appearance.test.ts src/shared/lib/clerk-appearance.test.ts
```

Update `src/shared/lib/trpc.ts`:

```typescript
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@shared/auth/routers";

export const trpc = createTRPCReact<AppRouter>();
```

(The `AppRouter` type export will move in Task 3 when we create the router aggregation file.)

- [ ] **Step 7: Move UI and providers**

```bash
mv src/components/ui/* src/shared/ui/
mv src/components/providers.tsx src/shared/components/providers.tsx
```

Update `src/shared/components/providers.tsx` import:

```typescript
import { trpc } from "@shared/lib/trpc";
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: create shared directory structure and move shared files

Move db connection, auth, tRPC setup, lib utilities, UI components,
and providers into src/shared/. Extract shared enums and users table
from the monolithic schema file."
```

---

### Task 2: Create syllabus domain

**Files:**
- Create: `src/domains/syllabus/schema.ts`
- Move: `src/server/routers/dance.ts` → `src/domains/syllabus/routers/dance.ts`
- Move: `src/server/routers/figure.ts` → `src/domains/syllabus/routers/figure.ts`
- Move: `src/components/graph/*` → `src/domains/syllabus/components/graph/*`
- Move: `src/components/dance/*` → `src/domains/syllabus/components/dance/*`
- Move: `src/app/dances/dance-order.ts` → `src/domains/syllabus/components/dance/dance-order.ts`
- Move: `src/app/dances/dance-order.test.ts` → `src/domains/syllabus/components/dance/dance-order.test.ts`

- [ ] **Step 1: Create syllabus directories**

```bash
mkdir -p src/domains/syllabus/{routers,components/{graph,dance}}
```

- [ ] **Step 2: Create syllabus schema**

Create `src/domains/syllabus/schema.ts`:

```typescript
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { levelEnum } from "@shared/db/enums";
import { users } from "@shared/schema";

export { levelEnum } from "@shared/db/enums";

export const dances = pgTable("dances", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  displayName: text("display_name").notNull(),
  timeSignature: text("time_signature"),
  tempoDescription: text("tempo_description"),
});

export const figures = pgTable(
  "figures",
  {
    id: serial("id").primaryKey(),
    danceId: integer("dance_id")
      .references(() => dances.id)
      .notNull(),
    figureNumber: integer("figure_number"),
    name: text("name").notNull(),
    variantName: text("variant_name"),
    level: levelEnum("level").notNull(),
    leaderSteps: jsonb("leader_steps"),
    followerSteps: jsonb("follower_steps"),
    leaderFootwork: text("leader_footwork"),
    followerFootwork: text("follower_footwork"),
    leaderCbm: text("leader_cbm"),
    followerCbm: text("follower_cbm"),
    leaderSway: text("leader_sway"),
    followerSway: text("follower_sway"),
    timing: text("timing"),
    beatValue: text("beat_value"),
    notes: jsonb("notes").$type<string[]>(),
  },
  (table) => ({
    danceIdx: index("figures_dance_idx").on(table.danceId),
    danceLevelIdx: index("figures_dance_level_idx").on(
      table.danceId,
      table.level
    ),
  })
);

export const figureEdges = pgTable(
  "figure_edges",
  {
    id: serial("id").primaryKey(),
    sourceFigureId: integer("source_figure_id")
      .references(() => figures.id)
      .notNull(),
    targetFigureId: integer("target_figure_id")
      .references(() => figures.id)
      .notNull(),
    level: levelEnum("level").notNull(),
    conditions: text("conditions"),
  },
  (table) => ({
    sourceIdx: index("figure_edges_source_idx").on(table.sourceFigureId),
    targetIdx: index("figure_edges_target_idx").on(table.targetFigureId),
    levelIdx: index("figure_edges_level_idx").on(table.level),
    uniqueTransition: uniqueIndex("figure_edges_unique_transition_idx").on(
      table.sourceFigureId,
      table.targetFigureId,
      table.level,
      table.conditions
    ),
  })
);

export const figureNotes = pgTable(
  "figure_notes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    figureId: integer("figure_id")
      .references(() => figures.id)
      .notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("figure_notes_user_idx").on(table.userId),
    figureIdx: index("figure_notes_figure_idx").on(table.figureId),
  })
);
```

- [ ] **Step 3: Move syllabus routers**

```bash
mv src/server/routers/dance.ts src/domains/syllabus/routers/dance.ts
mv src/server/routers/figure.ts src/domains/syllabus/routers/figure.ts
```

Update `src/domains/syllabus/routers/dance.ts`:

```typescript
import { publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { dances } from "@syllabus/schema";

export const danceRouter = router({
  list: publicProcedure.query(async () => {
    return db.select().from(dances);
  }),
});
```

Update `src/domains/syllabus/routers/figure.ts` — change all imports:

```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { figures, figureEdges } from "@syllabus/schema";
```

(Keep the rest of the file as-is.)

- [ ] **Step 4: Move syllabus components**

```bash
mv src/components/graph/* src/domains/syllabus/components/graph/
mv src/components/dance/* src/domains/syllabus/components/dance/
mv src/app/dances/dance-order.ts src/domains/syllabus/components/dance/dance-order.ts
mv src/app/dances/dance-order.test.ts src/domains/syllabus/components/dance/dance-order.test.ts
```

Update imports in each moved component file to use `@shared/ui/` instead of `@/components/ui/` and `@shared/lib/utils` instead of `@/lib/utils`.

Key import changes in `src/domains/syllabus/components/graph/dance-graph.tsx`:
- `@/components/graph/figure-node` → `./figure-node`
- `@/components/graph/full-layout` → `./full-layout`

Key import changes in `src/domains/syllabus/components/graph/figure-node.tsx`:
- Any `@/lib/utils` → `@shared/lib/utils`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: create syllabus domain with schema, routers, and components

Move dances/figures/edges/figureNotes schema, dance and figure routers,
graph visualization components, and dance list components into
src/domains/syllabus/."
```

---

### Task 3: Create routines domain

**Files:**
- Create: `src/domains/routines/schema.ts`
- Move: `src/server/routers/routine.ts` → `src/domains/routines/routers/routine.ts`
- Move: `src/components/routine/*` → `src/domains/routines/components/*`

- [ ] **Step 1: Create routines directories**

```bash
mkdir -p src/domains/routines/{routers,components}
```

- [ ] **Step 2: Create routines schema**

Create `src/domains/routines/schema.ts`:

```typescript
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { wallSegmentEnum } from "@shared/db/enums";
import { users } from "@shared/schema";
import { dances, figures } from "@syllabus/schema";

export { wallSegmentEnum } from "@shared/db/enums";

export const routines = pgTable(
  "routines",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    danceId: integer("dance_id")
      .references(() => dances.id)
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("routines_user_idx").on(table.userId),
    danceIdx: index("routines_dance_idx").on(table.danceId),
  })
);

export const routineEntries = pgTable(
  "routine_entries",
  {
    id: serial("id").primaryKey(),
    routineId: integer("routine_id")
      .references(() => routines.id)
      .notNull(),
    figureId: integer("figure_id")
      .references(() => figures.id)
      .notNull(),
    position: integer("position").notNull(),
    wallSegment: wallSegmentEnum("wall_segment"),
    notes: text("notes"),
  },
  (table) => ({
    routineIdx: index("routine_entries_routine_idx").on(table.routineId),
    positionUnique: uniqueIndex("routine_entries_routine_position_idx").on(
      table.routineId,
      table.position
    ),
  })
);
```

- [ ] **Step 3: Move routine router**

```bash
mv src/server/routers/routine.ts src/domains/routines/routers/routine.ts
```

Update `src/domains/routines/routers/routine.ts` imports:

```typescript
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { routines, routineEntries } from "@routines/schema";
import { figures } from "@syllabus/schema";
```

(Keep the rest of the file as-is.)

- [ ] **Step 4: Move routine components**

```bash
mv src/components/routine/* src/domains/routines/components/
```

Update imports in each moved component:
- `@/lib/trpc` → `@shared/lib/trpc`
- `@/components/ui/*` → `@shared/ui/*`
- `@/lib/utils` → `@shared/lib/utils`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: create routines domain with schema, router, and components

Move routines/routineEntries schema, routine router, and routine
builder/picker components into src/domains/routines/."
```

---

### Task 4: Update router aggregation and tRPC client

**Files:**
- Create: `src/shared/auth/routers.ts` (replaces `src/server/routers/index.ts`)
- Modify: `src/shared/lib/trpc.ts`
- Modify: `src/app/api/trpc/[trpc]/route.ts`
- Delete: `src/server/routers/index.ts`

- [ ] **Step 1: Create router aggregation in shared/auth**

Create `src/shared/auth/routers.ts`:

```typescript
import { router } from "./trpc";
import { danceRouter } from "@syllabus/routers/dance";
import { figureRouter } from "@syllabus/routers/figure";
import { routineRouter } from "@routines/routers/routine";

export const appRouter = router({
  dance: danceRouter,
  figure: figureRouter,
  routine: routineRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 2: Update tRPC client import**

Update `src/shared/lib/trpc.ts`:

```typescript
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@shared/auth/routers";

export const trpc = createTRPCReact<AppRouter>();
```

- [ ] **Step 3: Update API route handler**

Update `src/app/api/trpc/[trpc]/route.ts`:

```typescript
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@shared/auth/routers";
import { createTRPCContext } from "@shared/auth/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 4: Delete old router index and empty directories**

```bash
rm src/server/routers/index.ts
rmdir src/server/routers src/server 2>/dev/null || true
rmdir src/components/graph src/components/dance src/components/routine src/components/ui 2>/dev/null || true
rmdir src/components 2>/dev/null || true
rmdir src/db 2>/dev/null || true
rmdir src/lib 2>/dev/null || true
```

(Some directories may not be empty yet if other files remain — the `|| true` handles that.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: update router aggregation and tRPC client for domain structure

Move appRouter creation to shared/auth/routers.ts, update API handler
and tRPC client to use new paths. Remove emptied directories."
```

---

### Task 5: Update tsconfig path aliases

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Add domain path aliases**

In `tsconfig.json`, update the `paths` object:

```json
"paths": {
  "@/*": ["./src/*"],
  "@shared/*": ["./src/shared/*"],
  "@syllabus/*": ["./src/domains/syllabus/*"],
  "@routines/*": ["./src/domains/routines/*"]
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "refactor: add tsconfig path aliases for domain directories"
```

---

### Task 6: Update all page imports

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/dances/page.tsx`
- Modify: `src/app/dances/[dance]/page.tsx`
- Modify: `src/app/dances/[dance]/graph/page.tsx`
- Modify: `src/app/dances/[dance]/figures/[id]/page.tsx`
- Modify: `src/app/dances/[dance]/figures/[id]/graph/page.tsx`
- Modify: `src/app/routines/page.tsx`
- Modify: `src/app/routines/new/page.tsx`
- Modify: `src/app/routines/[id]/page.tsx`
- Modify: `src/app/routines/[id]/edit/page.tsx`
- Modify: `src/app/routines/dance/[dance]/page.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Update root layout imports**

In `src/app/layout.tsx`, update:

```typescript
import { Providers } from "@shared/components/providers";
import { clerkAppearance } from "@shared/lib/clerk-appearance";
```

- [ ] **Step 2: Update all page files**

For every page file under `src/app/`, update imports following these patterns:

| Old import | New import |
|-----------|------------|
| `@/db` or `@/db/index` | `@shared/db` |
| `@/db/schema` | `@syllabus/schema` or `@routines/schema` (depending on which tables are used) |
| `@/server/routers/...` | `@shared/auth/routers` (only if importing AppRouter type) |
| `@/lib/trpc` | `@shared/lib/trpc` |
| `@/lib/utils` | `@shared/lib/utils` |
| `@/components/ui/*` | `@shared/ui/*` |
| `@/components/graph/*` | `@syllabus/components/graph/*` |
| `@/components/dance/*` | `@syllabus/components/dance/*` |
| `@/components/routine/*` | `@routines/components/*` |
| `@/components/providers` | `@shared/components/providers` |

Read each page file, identify which imports need updating, and apply the changes. The page file locations themselves do not move — only their imports change.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: update all page imports to use domain path aliases

All app pages now import from @shared/, @syllabus/, and @routines/
instead of the old flat src/ paths."
```

---

### Task 7: Update drizzle config for split schemas

**Files:**
- Modify: `drizzle.config.ts`

- [ ] **Step 1: Update schema paths**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/shared/schema.ts",
    "./src/shared/db/enums.ts",
    "./src/domains/syllabus/schema.ts",
    "./src/domains/routines/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add drizzle.config.ts
git commit -m "refactor: update drizzle config to reference split schema files"
```

---

### Task 8: Update seed script imports

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Read the seed script and identify imports**

Read `scripts/seed.ts` and update all imports from `@/db/schema` to the appropriate domain schema files:

| Old import | New import |
|-----------|------------|
| `dances, figures, figureEdges` from `../src/db/schema` | from `../src/domains/syllabus/schema` |
| `routines, routineEntries` from `../src/db/schema` | from `../src/domains/routines/schema` |
| `users` from `../src/db/schema` | from `../src/shared/schema` |
| `levelEnum, wallSegmentEnum` from `../src/db/schema` | from `../src/shared/db/enums` |
| db connection | from `../src/shared/db` |

Note: The seed script uses `tsx` and relative paths (not `@/` aliases) since it runs outside Next.js. Use relative paths from `scripts/` to `src/`.

- [ ] **Step 2: Commit**

```bash
git add scripts/seed.ts
git commit -m "refactor: update seed script imports for domain structure"
```

---

### Task 9: Delete old empty files and directories

**Files:**
- Delete: `src/db/schema.ts` (replaced by domain schemas)
- Delete: remaining empty directories under old structure

- [ ] **Step 1: Remove the old monolithic schema**

```bash
rm src/db/schema.ts
```

- [ ] **Step 2: Clean up any remaining empty directories**

```bash
find src/db src/server src/lib src/components -type d -empty -delete 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old monolithic schema and empty directories"
```

---

### Task 10: Verify build and tests

- [ ] **Step 1: Run TypeScript compilation check**

Run: `pnpm build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No lint errors.

- [ ] **Step 3: Run existing tests**

Run: `pnpm tsx --test "src/domains/syllabus/components/graph/full-layout.test.ts"`
Expected: All existing tests pass.

Run: `pnpm tsx --test "src/domains/syllabus/components/dance/dance-order.test.ts"`
Expected: All existing tests pass.

- [ ] **Step 4: Verify dev server loads**

Run: `pnpm dev` and check that:
- Home page loads at `http://localhost:3000`
- `/dances` page shows all dances
- A dance detail page (e.g., `/dances/waltz`) shows figures
- A graph view loads
- `/routines` redirects to sign-in if not authenticated

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "refactor: verify build, lint, and tests pass after restructure"
```

(This commit will be empty if no fixes were needed — that's fine, skip the commit in that case.)

---

### Task 11: Update components.json for shadcn CLI

**Files:**
- Modify: `components.json`

- [ ] **Step 1: Update the aliases in components.json**

The shadcn CLI uses `components.json` to know where to install new components. Update the `aliases` section:

```json
{
  "aliases": {
    "components": "@shared/ui",
    "utils": "@shared/lib/utils"
  }
}
```

Read the full `components.json` first to preserve other fields, and only change the aliases.

- [ ] **Step 2: Commit**

```bash
git add components.json
git commit -m "refactor: update shadcn component aliases for shared directory"
```
