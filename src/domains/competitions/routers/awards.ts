import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  entries,
} from "@competitions/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

export const awardsRouter = router({
  calculate: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        bufferPercentage: z.number().min(0).max(100).default(10),
        assumedFinalSize: z.number().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const comp = await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const defaultFinalSize = input.assumedFinalSize ?? comp.maxFinalSize ?? 8;

      // Get all events with entry counts
      const eventsWithCounts = await db
        .select({
          eventId: competitionEvents.id,
          eventName: competitionEvents.name,
          style: competitionEvents.style,
          level: competitionEvents.level,
          maxFinalSize: competitionEvents.maxFinalSize,
          entryCount: count(entries.id),
        })
        .from(competitionEvents)
        .leftJoin(
          entries,
          and(eq(entries.eventId, competitionEvents.id), eq(entries.scratched, false)),
        )
        .where(eq(competitionEvents.competitionId, input.competitionId))
        .groupBy(
          competitionEvents.id,
          competitionEvents.name,
          competitionEvents.style,
          competitionEvents.level,
          competitionEvents.maxFinalSize,
        );

      const bufferMultiplier = 1 + input.bufferPercentage / 100;

      const perEvent = eventsWithCounts.map((event) => {
        const finalSize = Math.min(
          event.entryCount,
          event.maxFinalSize ?? defaultFinalSize,
        );

        // Medals: places 1-3, 2 per couple (leader + follower)
        const medalCount = Math.min(finalSize, 3) * 2;

        // Finalist ribbons: places 4 through final_size, 2 per couple
        const ribbonPlaces = Math.max(0, finalSize - 3);
        const ribbonCount = ribbonPlaces * 2;

        return {
          eventId: event.eventId,
          eventName: event.eventName,
          style: event.style,
          level: event.level,
          entryCount: event.entryCount,
          finalSize,
          medals: medalCount,
          ribbons: ribbonCount,
        };
      });

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
        bufferPercentage: input.bufferPercentage,
      };
    }),
});
