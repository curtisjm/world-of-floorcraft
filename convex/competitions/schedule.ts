import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import { scheduleBlockType } from "../schema";

/**
 * Competition schedule — days and ordered session/break blocks. Ported from
 * `src/domains/competitions/routers/schedule.ts` for Task 9 of the Convex
 * migration (docs/superpowers/plans/2026-05-22-convex-migration.md).
 *
 * Ordering uses an explicit `position` integer per parent. Reorder calls
 * use a two-pass negative-then-positive write so position stays unique even
 * under partial failure (mirrors the Drizzle behavior that worked around
 * unique-constraint conflicts).
 */

const DEFAULT_SESSIONS = [
  "Smooth",
  "Standard",
  "Latin",
  "Rhythm",
  "Nightclub",
  "Open Events",
];

async function getDay(
  ctx: QueryCtx,
  dayId: Id<"competitionDays">,
): Promise<Doc<"competitionDays">> {
  const day = await ctx.db.get(dayId);
  if (!day) notFound("Day not found");
  return day;
}

async function getBlock(
  ctx: QueryCtx,
  blockId: Id<"scheduleBlocks">,
): Promise<Doc<"scheduleBlocks">> {
  const block = await ctx.db.get(blockId);
  if (!block) notFound("Block not found");
  return block;
}

// ── Queries ─────────────────────────────────────────────────────────

/** Days with their blocks for the schedule builder. */
export const getDays = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);

    const result = await Promise.all(
      days.map(async (day) => {
        const blocks = await ctx.db
          .query("scheduleBlocks")
          .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
          .collect();
        blocks.sort((a, b) => a.position - b.position);
        return { ...day, blocks };
      }),
    );
    return result;
  },
});

/**
 * Days with blocks + events grouped by session, for public read-only schedule
 * displays. Break blocks have no events; sessions list their assigned events.
 */
export const getSchedule = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);
    if (days.length === 0) return [];

    const result = [];
    for (const day of days) {
      const blocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
        .collect();
      blocks.sort((a, b) => a.position - b.position);

      const enrichedBlocks = await Promise.all(
        blocks.map(async (block) => {
          if (block.type !== "session") return { ...block, events: [] };
          const events = await ctx.db
            .query("competitionEvents")
            .withIndex("by_session", (q) => q.eq("sessionId", block._id))
            .collect();
          events.sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
          );
          return { ...block, events };
        }),
      );
      result.push({ ...day, blocks: enrichedBlocks });
    }
    return result;
  },
});

// ── Day mutations ───────────────────────────────────────────────────

export const addDay = mutation({
  args: {
    competitionId: v.id("competitions"),
    date: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const maxPos = days.reduce((max, d) => Math.max(max, d.position), 0);
    const id = await ctx.db.insert("competitionDays", {
      competitionId: args.competitionId,
      date: args.date,
      label: args.label,
      position: maxPos + 1,
    });
    return await ctx.db.get(id);
  },
});

export const updateDay = mutation({
  args: {
    dayId: v.id("competitionDays"),
    date: v.optional(v.string()),
    label: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const day = await getDay(ctx, args.dayId);
    await requireCompOrgRole(ctx, day.competitionId);

    const patch: Partial<Doc<"competitionDays">> = {};
    if (args.date !== undefined) patch.date = args.date;
    if (args.label !== undefined) patch.label = args.label ?? undefined;
    await ctx.db.patch(args.dayId, patch);
    return await ctx.db.get(args.dayId);
  },
});

export const removeDay = mutation({
  args: { dayId: v.id("competitionDays") },
  handler: async (ctx, args) => {
    const day = await getDay(ctx, args.dayId);
    await requireCompOrgRole(ctx, day.competitionId);
    // Cascade blocks
    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_day_position", (q) => q.eq("dayId", args.dayId))
      .collect();
    for (const b of blocks) {
      // Unlink events from each session before deletion
      const events = await ctx.db
        .query("competitionEvents")
        .withIndex("by_session", (q) => q.eq("sessionId", b._id))
        .collect();
      for (const e of events) await ctx.db.patch(e._id, { sessionId: undefined });
      await ctx.db.delete(b._id);
    }
    await ctx.db.delete(args.dayId);
    return { success: true };
  },
});

/**
 * Two-pass reorder of days within a competition. The first pass writes
 * negative positions to release the unique slot, the second pass writes the
 * final positions. Convex doesn't enforce uniqueness, but the pattern
 * matches the Postgres source so future schema changes are safe.
 */
export const reorderDays = mutation({
  args: {
    competitionId: v.id("competitions"),
    dayIds: v.array(v.id("competitionDays")),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    for (let i = 0; i < args.dayIds.length; i++) {
      const id = args.dayIds[i]!;
      const day = await ctx.db.get(id);
      if (!day || day.competitionId !== args.competitionId) continue;
      await ctx.db.patch(id, { position: -(i + 1) });
    }
    for (let i = 0; i < args.dayIds.length; i++) {
      const id = args.dayIds[i]!;
      const day = await ctx.db.get(id);
      if (!day || day.competitionId !== args.competitionId) continue;
      await ctx.db.patch(id, { position: i + 1 });
    }
    return { success: true };
  },
});

// ── Block mutations ─────────────────────────────────────────────────

export const addBlock = mutation({
  args: {
    dayId: v.id("competitionDays"),
    type: scheduleBlockType,
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const day = await getDay(ctx, args.dayId);
    await requireCompOrgRole(ctx, day.competitionId);

    if (args.label.length === 0) {
      // Validation parity with Zod min(1)
      throw new Error("Block label is required");
    }

    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_day_position", (q) => q.eq("dayId", args.dayId))
      .collect();
    const maxPos = blocks.reduce((max, b) => Math.max(max, b.position), 0);

    const id = await ctx.db.insert("scheduleBlocks", {
      dayId: args.dayId,
      type: args.type,
      label: args.label,
      position: maxPos + 1,
    });
    return await ctx.db.get(id);
  },
});

export const updateBlock = mutation({
  args: {
    blockId: v.id("scheduleBlocks"),
    label: v.optional(v.string()),
    type: v.optional(scheduleBlockType),
    estimatedStartTime: v.optional(v.union(v.number(), v.null())),
    estimatedEndTime: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const block = await getBlock(ctx, args.blockId);
    const day = await getDay(ctx, block.dayId);
    await requireCompOrgRole(ctx, day.competitionId);

    const patch: Partial<Doc<"scheduleBlocks">> = {};
    if (args.label !== undefined) patch.label = args.label;
    if (args.type !== undefined) patch.type = args.type;
    if (args.estimatedStartTime !== undefined) {
      patch.estimatedStartTime = args.estimatedStartTime ?? undefined;
    }
    if (args.estimatedEndTime !== undefined) {
      patch.estimatedEndTime = args.estimatedEndTime ?? undefined;
    }
    await ctx.db.patch(args.blockId, patch);
    return await ctx.db.get(args.blockId);
  },
});

export const removeBlock = mutation({
  args: { blockId: v.id("scheduleBlocks") },
  handler: async (ctx, args) => {
    const block = await getBlock(ctx, args.blockId);
    const day = await getDay(ctx, block.dayId);
    await requireCompOrgRole(ctx, day.competitionId);

    // Unlink events that referenced this session
    const linked = await ctx.db
      .query("competitionEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", args.blockId))
      .collect();
    for (const e of linked) {
      await ctx.db.patch(e._id, { sessionId: undefined });
    }
    await ctx.db.delete(args.blockId);
    return { success: true };
  },
});

export const reorderBlocks = mutation({
  args: {
    dayId: v.id("competitionDays"),
    blockIds: v.array(v.id("scheduleBlocks")),
  },
  handler: async (ctx, args) => {
    const day = await getDay(ctx, args.dayId);
    await requireCompOrgRole(ctx, day.competitionId);
    for (let i = 0; i < args.blockIds.length; i++) {
      const id = args.blockIds[i]!;
      const block = await ctx.db.get(id);
      if (!block || block.dayId !== args.dayId) continue;
      await ctx.db.patch(id, { position: -(i + 1) });
    }
    for (let i = 0; i < args.blockIds.length; i++) {
      const id = args.blockIds[i]!;
      const block = await ctx.db.get(id);
      if (!block || block.dayId !== args.dayId) continue;
      await ctx.db.patch(id, { position: i + 1 });
    }
    return { success: true };
  },
});

/**
 * Move a block between days, reordering the target day to the given order
 * and compacting the remaining positions in the source day.
 */
export const moveBlock = mutation({
  args: {
    blockId: v.id("scheduleBlocks"),
    toDayId: v.id("competitionDays"),
    blockIds: v.array(v.id("scheduleBlocks")),
  },
  handler: async (ctx, args) => {
    const block = await getBlock(ctx, args.blockId);
    const fromDay = await getDay(ctx, block.dayId);
    const toDay = await getDay(ctx, args.toDayId);
    if (fromDay.competitionId !== toDay.competitionId) {
      throw new Error("Days must belong to the same competition");
    }
    await requireCompOrgRole(ctx, fromDay.competitionId);

    // Move block to the target day
    await ctx.db.patch(args.blockId, { dayId: args.toDayId });

    // Reorder blocks in the target day
    for (let i = 0; i < args.blockIds.length; i++) {
      const id = args.blockIds[i]!;
      const b = await ctx.db.get(id);
      if (!b || b.dayId !== args.toDayId) continue;
      await ctx.db.patch(id, { position: -(i + 1) });
    }
    for (let i = 0; i < args.blockIds.length; i++) {
      const id = args.blockIds[i]!;
      const b = await ctx.db.get(id);
      if (!b || b.dayId !== args.toDayId) continue;
      await ctx.db.patch(id, { position: i + 1 });
    }

    // Compact remaining blocks in the source day
    const remaining = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_day_position", (q) => q.eq("dayId", fromDay._id))
      .collect();
    remaining.sort((a, b) => a.position - b.position);
    for (let i = 0; i < remaining.length; i++) {
      await ctx.db.patch(remaining[i]!._id, { position: -(i + 1) });
    }
    for (let i = 0; i < remaining.length; i++) {
      await ctx.db.patch(remaining[i]!._id, { position: i + 1 });
    }

    return { success: true };
  },
});

/**
 * Bootstrap a competition with one day containing the standard six session
 * blocks. Convenience entry point for organizers — the UI calls this on
 * "use template" from an empty schedule.
 */
export const applyDefaultTemplate = mutation({
  args: {
    competitionId: v.id("competitions"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const dayId = await ctx.db.insert("competitionDays", {
      competitionId: args.competitionId,
      date: args.date,
      label: "Day 1",
      position: 1,
    });
    const day = await ctx.db.get(dayId);

    const blocks: Doc<"scheduleBlocks">[] = [];
    for (let i = 0; i < DEFAULT_SESSIONS.length; i++) {
      const id = await ctx.db.insert("scheduleBlocks", {
        dayId,
        type: "session",
        label: DEFAULT_SESSIONS[i]!,
        position: i + 1,
      });
      const block = await ctx.db.get(id);
      if (block) blocks.push(block);
    }
    return { day, blocks };
  },
});
