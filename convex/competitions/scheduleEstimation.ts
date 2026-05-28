import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireCompOrgRole } from "../lib/permissions";

async function estimateEventMinutes(
  ctx: QueryCtx,
  event: Doc<"competitionEvents">,
  minutesPerCouplePerDance: number,
  transitionMinutes: number,
): Promise<number> {
  const override = await ctx.db
    .query("eventTimeOverrides")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .unique();
  if (override) return override.estimatedMinutes;

  const entries = await ctx.db
    .query("entries")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();
  const activeEntries = entries.filter((e) => !e.scratched);
  const entryCount = activeEntries.length;

  if (entryCount === 0) return transitionMinutes;

  const dancesRows = await ctx.db
    .query("eventDances")
    .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
    .collect();
  const dances = Math.max(dancesRows.length, 1);

  const roundsRows = await ctx.db
    .query("rounds")
    .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
    .collect();
  roundsRows.sort((a, b) => a.position - b.position);

  if (roundsRows.length <= 1) {
    return entryCount * dances * minutesPerCouplePerDance + transitionMinutes;
  }

  let total = 0;
  let couplesInRound = entryCount;
  for (const _round of roundsRows) {
    total +=
      couplesInRound * dances * minutesPerCouplePerDance + transitionMinutes;
    couplesInRound = Math.ceil(couplesInRound * 0.55);
  }
  return total;
}

export const getEstimatedSchedule = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Competition not found",
      });
    }

    await requireCompOrgRole(ctx, args.competitionId);

    const minutesPerCouplePerDance = comp.minutesPerCouplePerDance ?? 1.5;
    const transitionMinutes = comp.transitionMinutes ?? 2.0;

    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);

    const allEvents = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    const schedule = [];

    for (const day of days) {
      const blocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
        .collect();
      blocks.sort((a, b) => a.position - b.position);

      const daySchedule = [];
      for (const block of blocks) {
        if (block.type === "break") {
          daySchedule.push({
            blockId: block._id,
            label: block.label,
            type: block.type as string,
            events: [],
            estimatedMinutes: 0,
          });
          continue;
        }

        const events = allEvents
          .filter((e) => e.sessionId === block._id)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

        const eventEstimates = [];
        for (const event of events) {
          const minutes = await estimateEventMinutes(
            ctx,
            event,
            minutesPerCouplePerDance,
            transitionMinutes,
          );

          const entries = await ctx.db
            .query("entries")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect();
          const entryCount = entries.filter((e) => !e.scratched).length;

          eventEstimates.push({
            eventId: event._id,
            eventName: event.name,
            style: event.style,
            level: event.level,
            entryCount,
            estimatedMinutes: Math.round(minutes * 10) / 10,
          });
        }

        const totalMinutes = eventEstimates.reduce(
          (sum, e) => sum + e.estimatedMinutes,
          0,
        );

        daySchedule.push({
          blockId: block._id,
          label: block.label,
          type: block.type as string,
          events: eventEstimates,
          estimatedMinutes: Math.round(totalMinutes * 10) / 10,
        });
      }

      schedule.push({
        dayId: day._id,
        date: day.date,
        label: day.label,
        blocks: daySchedule,
      });
    }

    return {
      minutesPerCouplePerDance,
      transitionMinutes,
      schedule,
    };
  },
});

export const updateCompSettings = mutation({
  args: {
    competitionId: v.id("competitions"),
    minutesPerCouplePerDance: v.optional(v.number()),
    transitionMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const updates: Partial<Doc<"competitions">> = { updatedAt: Date.now() };
    if (args.minutesPerCouplePerDance !== undefined) {
      updates.minutesPerCouplePerDance = args.minutesPerCouplePerDance;
    }
    if (args.transitionMinutes !== undefined) {
      updates.transitionMinutes = args.transitionMinutes;
    }

    await ctx.db.patch(args.competitionId, updates);
    return await ctx.db.get(args.competitionId);
  },
});

export const setEventOverride = mutation({
  args: {
    eventId: v.id("competitionEvents"),
    estimatedMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    await requireCompOrgRole(ctx, event.competitionId);

    const found = await ctx.db
      .query("eventTimeOverrides")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (found) {
      await ctx.db.patch(found._id, { estimatedMinutes: args.estimatedMinutes });
      return await ctx.db.get(found._id);
    }

    const created = await ctx.db.insert("eventTimeOverrides", {
      eventId: args.eventId,
      estimatedMinutes: args.estimatedMinutes,
    });
    return await ctx.db.get(created);
  },
});

export const removeEventOverride = mutation({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    await requireCompOrgRole(ctx, event.competitionId);

    const overrides = await ctx.db
      .query("eventTimeOverrides")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const o of overrides) {
      await ctx.db.delete(o._id);
    }
    return { deleted: true };
  },
});
