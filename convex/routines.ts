import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCurrentUserId } from "./lib/auth";
import { wallSegment } from "./schema";

/**
 * Routines domain — user-owned routine plans and their ordered figure
 * entries.
 *
 * Replaces the `routineRouter` tRPC procedures
 * (`src/domains/routines/routers/routine.ts`) for the Convex migration
 * (docs/superpowers/plans/2026-05-22-convex-migration.md, Task 4). All
 * mutations require an authenticated user and confirm ownership before
 * touching routine state — public discovery lives in social posts.
 *
 * `routineEntries` ordering is dense (`position` 0..N-1) and unique per
 * `routineId`. Inserts and reorders rewrite affected positions in-place.
 */

function toRoutineSummary(doc: Doc<"routines">) {
  return {
    id: doc._id,
    userId: doc.userId,
    danceId: doc.danceId,
    name: doc.name,
    description: doc.description ?? null,
    isPublished: doc.isPublished,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function getOwnedRoutine(
  ctx: { db: { get: (id: Id<"routines">) => Promise<Doc<"routines"> | null> } },
  routineId: Id<"routines">,
  userId: Id<"users">,
): Promise<Doc<"routines"> | null> {
  const routine = await ctx.db.get(routineId);
  if (!routine || routine.userId !== userId) return null;
  return routine;
}

/**
 * List the signed-in user's routines, oldest first, across every dance.
 * Backs the routines index for users with cross-dance routines.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const routines = await ctx.db
      .query("routines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    routines.sort((a, b) => a.createdAt - b.createdAt);
    return routines.map(toRoutineSummary);
  },
});

/**
 * Public list of a user's published routines for the profile page.
 */
export const listPublishedByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const routines = await ctx.db
      .query("routines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return routines
      .filter((r) => r.isPublished)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toRoutineSummary);
  },
});

/**
 * List the signed-in user's routines for a single dance, oldest first.
 * Backs the per-dance routines list (`/routines/dance/[dance]`).
 */
export const listByDance = query({
  args: { danceId: v.id("dances") },
  handler: async (ctx, { danceId }) => {
    const userId = await requireCurrentUserId(ctx);
    const routines = await ctx.db
      .query("routines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return routines
      .filter((r) => r.danceId === danceId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toRoutineSummary);
  },
});

/**
 * Read one routine the caller owns, including its entries joined with
 * figure summary fields the builder UI needs. Returns `null` for unknown
 * routines or routines the caller does not own so callers can render 404.
 */
export const get = query({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return null;

    const entries = await ctx.db
      .query("routineEntries")
      .withIndex("by_routine_position", (q) => q.eq("routineId", routineId))
      .collect();
    entries.sort((a, b) => a.position - b.position);

    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const figure = await ctx.db.get(entry.figureId);
        return {
          id: entry._id,
          figureId: entry.figureId,
          position: entry.position,
          wallSegment: entry.wallSegment ?? null,
          notes: entry.notes ?? null,
          figureName: figure?.name ?? "",
          figureVariantName: figure?.variantName ?? null,
          figureLevel: figure?.level ?? null,
          figureNumber: figure?.figureNumber ?? null,
        };
      }),
    );

    return {
      ...toRoutineSummary(routine),
      entries: enriched,
    };
  },
});

/** Create an empty routine for a given dance. Name must be non-empty. */
export const create = mutation({
  args: {
    danceId: v.id("dances"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { danceId, name, description }) => {
    const userId = await requireCurrentUserId(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Routine name is required",
      });
    }

    const dance = await ctx.db.get(danceId);
    if (!dance) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Dance not found",
      });
    }

    const now = Date.now();
    const routineId = await ctx.db.insert("routines", {
      userId,
      danceId,
      name: trimmed,
      description,
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(routineId);
    return toRoutineSummary(created!);
  },
});

/**
 * Update a routine's name and/or description. Returns the updated
 * routine, or `null` when the caller does not own it.
 */
export const update = mutation({
  args: {
    routineId: v.id("routines"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { routineId, name, description }) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return null;

    const patch: Partial<Doc<"routines">> = { updatedAt: Date.now() };
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Routine name is required",
        });
      }
      patch.name = trimmed;
    }
    if (description !== undefined) {
      patch.description = description ?? undefined;
    }

    await ctx.db.patch(routineId, patch);
    const updated = await ctx.db.get(routineId);
    return toRoutineSummary(updated!);
  },
});

/**
 * Set a routine's `isPublished` flag explicitly. Returns the updated
 * routine, or `null` when the caller does not own it.
 */
export const setPublished = mutation({
  args: {
    routineId: v.id("routines"),
    isPublished: v.boolean(),
  },
  handler: async (ctx, { routineId, isPublished }) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return null;

    await ctx.db.patch(routineId, {
      isPublished,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(routineId);
    return toRoutineSummary(updated!);
  },
});

/**
 * Insert a figure entry at `position`, shifting existing entries at or
 * after that position by +1 so positions stay dense (0..N). Returns the
 * inserted entry document, or `null` when the caller does not own the
 * routine.
 */
export const addEntry = mutation({
  args: {
    routineId: v.id("routines"),
    figureId: v.id("figures"),
    position: v.number(),
    wallSegment: v.optional(wallSegment),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { routineId, figureId, position, wallSegment: seg, notes },
  ) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return null;

    const figure = await ctx.db.get(figureId);
    if (!figure) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Figure not found",
      });
    }

    const existing = await ctx.db
      .query("routineEntries")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .collect();

    const clampedPosition = Math.max(
      0,
      Math.min(position, existing.length),
    );

    for (const entry of existing) {
      if (entry.position >= clampedPosition) {
        await ctx.db.patch(entry._id, { position: entry.position + 1 });
      }
    }

    const entryId = await ctx.db.insert("routineEntries", {
      routineId,
      figureId,
      position: clampedPosition,
      wallSegment: seg,
      notes,
    });

    await ctx.db.patch(routineId, { updatedAt: Date.now() });
    const entry = await ctx.db.get(entryId);
    return entry;
  },
});

/**
 * Delete one entry by id and shift later entries down by 1 to keep
 * positions dense. Returns `{ success: false }` for unknown routines,
 * routines the caller does not own, or entries that do not belong to the
 * routine; `{ success: true }` otherwise.
 */
export const removeEntry = mutation({
  args: {
    routineId: v.id("routines"),
    entryId: v.id("routineEntries"),
  },
  handler: async (ctx, { routineId, entryId }) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return { success: false };

    const entry = await ctx.db.get(entryId);
    if (!entry || entry.routineId !== routineId) {
      return { success: false };
    }

    const removedPosition = entry.position;
    await ctx.db.delete(entryId);

    const remaining = await ctx.db
      .query("routineEntries")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .collect();
    for (const other of remaining) {
      if (other.position > removedPosition) {
        await ctx.db.patch(other._id, { position: other.position - 1 });
      }
    }

    await ctx.db.patch(routineId, { updatedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Rewrite the routine's entry order to match `entryIds`. The array must
 * include exactly the routine's existing entry ids (any permutation);
 * otherwise the mutation throws `BAD_REQUEST` and leaves state unchanged.
 * Positions are reassigned 0..N-1 in array order.
 */
export const reorderEntries = mutation({
  args: {
    routineId: v.id("routines"),
    entryIds: v.array(v.id("routineEntries")),
  },
  handler: async (ctx, { routineId, entryIds }) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return null;

    const existing = await ctx.db
      .query("routineEntries")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .collect();

    if (existing.length !== entryIds.length) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "reorderEntries must list every existing entry exactly once",
      });
    }

    const existingIds = new Set(existing.map((e) => e._id));
    const seen = new Set<Id<"routineEntries">>();
    for (const id of entryIds) {
      if (!existingIds.has(id) || seen.has(id)) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "reorderEntries received an unknown or duplicate entry id",
        });
      }
      seen.add(id);
    }

    for (let i = 0; i < entryIds.length; i += 1) {
      await ctx.db.patch(entryIds[i], { position: i });
    }

    await ctx.db.patch(routineId, { updatedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Delete a routine and its entries. Returns `{ success: false }` for
 * unknown routines or routines the caller does not own; `{ success: true }`
 * otherwise.
 */
export const remove = mutation({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    const userId = await requireCurrentUserId(ctx);
    const routine = await getOwnedRoutine(ctx, routineId, userId);
    if (!routine) return { success: false };

    const entries = await ctx.db
      .query("routineEntries")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
    await ctx.db.delete(routineId);
    return { success: true };
  },
});
