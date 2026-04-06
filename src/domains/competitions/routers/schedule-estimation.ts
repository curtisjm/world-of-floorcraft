import { z } from "zod";
import { eq, and, asc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionDays,
  competitionEvents,
  entries,
  eventDances,
  eventTimeOverrides,
  rounds,
  scheduleBlocks,
} from "@competitions/schema";
import { requireCompOrgRole } from "@competitions/lib/auth";

/**
 * Estimate minutes for a single event based on entry count, dance count,
 * and competition settings. Accounts for multiple rounds if they exist.
 */
async function estimateEventMinutes(
  event: typeof competitionEvents.$inferSelect,
  minutesPerCouplePerDance: number,
  transitionMinutes: number,
): Promise<number> {
  // Check for manual override first
  const override = await db.query.eventTimeOverrides.findFirst({
    where: eq(eventTimeOverrides.eventId, event.id),
  });
  if (override) return parseFloat(override.estimatedMinutes);

  // Count entries
  const [{ entryCount }] = await db
    .select({ entryCount: count(entries.id) })
    .from(entries)
    .where(and(eq(entries.eventId, event.id), eq(entries.scratched, false)));

  if (entryCount === 0) return transitionMinutes;

  // Count dances in event
  const [{ danceCount }] = await db
    .select({ danceCount: count(eventDances.id) })
    .from(eventDances)
    .where(eq(eventDances.eventId, event.id));

  const dances = Math.max(danceCount, 1);

  // Check if rounds exist
  const eventRounds = await db.query.rounds.findMany({
    where: eq(rounds.eventId, event.id),
    orderBy: asc(rounds.position),
  });

  if (eventRounds.length <= 1) {
    // Simple: all couples dance all dances
    return entryCount * dances * minutesPerCouplePerDance + transitionMinutes;
  }

  // Multiple rounds: estimate each round's duration
  let total = 0;
  let couplesInRound = entryCount;
  for (const round of eventRounds) {
    total += couplesInRound * dances * minutesPerCouplePerDance + transitionMinutes;
    // Estimate ~55% advance to next round
    couplesInRound = Math.ceil(couplesInRound * 0.55);
  }

  return total;
}

export const scheduleEstimationRouter = router({
  getEstimatedSchedule: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      const minutesPerCouplePerDance = parseFloat(comp.minutesPerCouplePerDance ?? "1.5");
      const transitionMinutes = parseFloat(comp.transitionMinutes ?? "2.0");

      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, input.competitionId),
        orderBy: asc(competitionDays.position),
      });

      const schedule = [];

      for (const day of days) {
        const blocks = await db.query.scheduleBlocks.findMany({
          where: eq(scheduleBlocks.dayId, day.id),
          orderBy: asc(scheduleBlocks.position),
        });

        const daySchedule = [];
        for (const block of blocks) {
          if (block.type === "break") {
            daySchedule.push({
              blockId: block.id,
              label: block.label,
              type: block.type as string,
              events: [],
              estimatedMinutes: 0,
            });
            continue;
          }

          // Session block — get events
          const events = await db.query.competitionEvents.findMany({
            where: and(
              eq(competitionEvents.competitionId, input.competitionId),
              eq(competitionEvents.sessionId, block.id),
            ),
            orderBy: asc(competitionEvents.position),
          });

          const eventEstimates = [];
          for (const event of events) {
            const minutes = await estimateEventMinutes(
              event,
              minutesPerCouplePerDance,
              transitionMinutes,
            );

            // Get entry count for display
            const [{ entryCount }] = await db
              .select({ entryCount: count(entries.id) })
              .from(entries)
              .where(and(eq(entries.eventId, event.id), eq(entries.scratched, false)));

            eventEstimates.push({
              eventId: event.id,
              eventName: event.name,
              style: event.style,
              level: event.level,
              entryCount,
              estimatedMinutes: Math.round(minutes * 10) / 10,
            });
          }

          const totalMinutes = eventEstimates.reduce((sum, e) => sum + e.estimatedMinutes, 0);

          daySchedule.push({
            blockId: block.id,
            label: block.label,
            type: block.type as string,
            events: eventEstimates,
            estimatedMinutes: Math.round(totalMinutes * 10) / 10,
          });
        }

        schedule.push({
          dayId: day.id,
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
    }),

  updateCompSettings: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        minutesPerCouplePerDance: z.string().optional(),
        transitionMinutes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const { competitionId, ...updates } = input;
      const [updated] = await db
        .update(competitions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(competitions.id, competitionId))
        .returning();

      return updated;
    }),

  setEventOverride: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        estimatedMinutes: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      // Upsert: try update first, then insert
      const existing = await db.query.eventTimeOverrides.findFirst({
        where: eq(eventTimeOverrides.eventId, input.eventId),
      });

      if (existing) {
        const [updated] = await db
          .update(eventTimeOverrides)
          .set({ estimatedMinutes: input.estimatedMinutes })
          .where(eq(eventTimeOverrides.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(eventTimeOverrides)
        .values({
          eventId: input.eventId,
          estimatedMinutes: input.estimatedMinutes,
        })
        .returning();

      return created;
    }),

  removeEventOverride: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      await db
        .delete(eventTimeOverrides)
        .where(eq(eventTimeOverrides.eventId, input.eventId));

      return { deleted: true };
    }),
});
