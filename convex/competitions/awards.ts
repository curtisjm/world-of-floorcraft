import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCompStaffRole } from "../lib/permissions";

export const calculate = query({
  args: {
    competitionId: v.id("competitions"),
    bufferPercentage: v.optional(v.number()),
    assumedFinalSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { competition } = await requireCompStaffRole(
      ctx,
      args.competitionId,
      ["registration"],
    );

    const bufferPercentage = args.bufferPercentage ?? 10;
    const defaultFinalSize =
      args.assumedFinalSize ?? competition.maxFinalSize ?? 8;

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    const bufferMultiplier = 1 + bufferPercentage / 100;

    const perEvent = [] as {
      eventId: string;
      eventName: string;
      style: string;
      level: string;
      entryCount: number;
      finalSize: number;
      medals: number;
      ribbons: number;
    }[];

    for (const event of events) {
      const entries = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      const activeEntries = entries.filter((e) => !e.scratched);

      const finalSize = Math.min(
        activeEntries.length,
        event.maxFinalSize ?? defaultFinalSize,
      );

      const medalCount = Math.min(finalSize, 3) * 2;
      const ribbonPlaces = Math.max(0, finalSize - 3);
      const ribbonCount = ribbonPlaces * 2;

      perEvent.push({
        eventId: event._id,
        eventName: event.name,
        style: event.style,
        level: event.level,
        entryCount: activeEntries.length,
        finalSize,
        medals: medalCount,
        ribbons: ribbonCount,
      });
    }

    const totalMedals = perEvent.reduce((sum, e) => sum + e.medals, 0);
    const totalRibbons = perEvent.reduce((sum, e) => sum + e.ribbons, 0);

    return {
      perEvent,
      totals: {
        medals: totalMedals,
        ribbons: totalRibbons,
        medalsWithBuffer: Math.ceil(totalMedals * bufferMultiplier),
        ribbonsWithBuffer: Math.ceil(totalRibbons * bufferMultiplier),
      },
      bufferPercentage,
    };
  },
});
