import { z } from "zod";
import { eq, and, count, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  entries,
  rounds,
  heats,
  heatAssignments,
} from "@competitions/schema";
import { requireCompOrgRole, requireCompStaffRole } from "@competitions/lib/auth";

/**
 * Determine the round structure needed for an event based on entry count
 * and max sizes. Returns array of round types from first to last.
 */
function determineRoundStructure(
  entryCount: number,
  maxFinalSize: number,
): string[] {
  if (entryCount <= maxFinalSize) return ["final"];

  // Work backward from the final
  const roundTypes: string[] = ["final"];
  let remaining = entryCount;
  const recallRate = 0.55; // ~55% advance from each prelim round

  // How many couples feed into the final?
  remaining = Math.ceil(remaining * recallRate);
  if (remaining > maxFinalSize) {
    // Need semi-final
    roundTypes.unshift("semi_final");
    remaining = Math.ceil(entryCount * recallRate);
    if (remaining > maxFinalSize * 2) {
      // Need quarter-final
      roundTypes.unshift("quarter_final");
      remaining = Math.ceil(entryCount * recallRate);
      if (remaining > maxFinalSize * 3) {
        // Need 2nd round
        roundTypes.unshift("2nd_round");
        remaining = Math.ceil(entryCount * recallRate);
        if (remaining > maxFinalSize * 4) {
          // Need 1st round
          roundTypes.unshift("1st_round");
        }
      }
    }
  } else {
    roundTypes.unshift("semi_final");
  }

  return roundTypes;
}

/**
 * Distribute entries evenly across heats.
 */
function distributeToHeats(entryIds: number[], maxHeatSize: number): number[][] {
  if (entryIds.length <= maxHeatSize) return [entryIds];

  const numHeats = Math.ceil(entryIds.length / maxHeatSize);
  const heatsArr: number[][] = Array.from({ length: numHeats }, () => []);

  // Round-robin distribute
  entryIds.forEach((id, i) => {
    heatsArr[i % numHeats]!.push(id);
  });

  return heatsArr;
}

export const roundRouter = router({
  listByEvent: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const eventRounds = await db.query.rounds.findMany({
        where: eq(rounds.eventId, input.eventId),
        orderBy: asc(rounds.position),
      });

      const result = [];
      for (const round of eventRounds) {
        const roundHeats = await db.query.heats.findMany({
          where: eq(heats.roundId, round.id),
          orderBy: asc(heats.heatNumber),
        });

        const heatsWithAssignments = [];
        for (const heat of roundHeats) {
          const assignments = await db.query.heatAssignments.findMany({
            where: eq(heatAssignments.heatId, heat.id),
          });
          heatsWithAssignments.push({
            ...heat,
            entries: assignments.map((a) => a.entryId),
          });
        }

        result.push({
          ...round,
          heats: heatsWithAssignments,
        });
      }

      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .query(async ({ input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const roundHeats = await db.query.heats.findMany({
        where: eq(heats.roundId, round.id),
        orderBy: asc(heats.heatNumber),
      });

      const heatsWithAssignments = [];
      for (const heat of roundHeats) {
        const assignments = await db.query.heatAssignments.findMany({
          where: eq(heatAssignments.heatId, heat.id),
        });
        heatsWithAssignments.push({
          ...heat,
          entries: assignments.map((a) => a.entryId),
        });
      }

      return { ...round, heats: heatsWithAssignments };
    }),

  generateForCompetition: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const comp = await requireCompStaffRole(input.competitionId, ctx.userId, ["chairman"]);

      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
      });

      let totalRounds = 0;
      let totalHeats = 0;

      for (const event of events) {
        const result = await generateRoundsForEvent(event, comp);
        totalRounds += result.rounds;
        totalHeats += result.heats;
      }

      return { events: events.length, totalRounds, totalHeats };
    }),

  generateForEvent: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const comp = await requireCompStaffRole(event.competitionId, ctx.userId, ["chairman"]);

      return generateRoundsForEvent(event, comp);
    }),

  update: protectedProcedure
    .input(
      z.object({
        roundId: z.number(),
        callbacksRequested: z.number().min(1).optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      const { roundId, ...updates } = input;
      const [updated] = await db
        .update(rounds)
        .set(updates)
        .where(eq(rounds.id, roundId))
        .returning();

      return updated;
    }),

  addRound: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        roundType: z.enum(["1st_round", "2nd_round", "quarter_final", "semi_final", "final"]),
        position: z.number().min(1),
        callbacksRequested: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      const [round] = await db
        .insert(rounds)
        .values({
          eventId: input.eventId,
          roundType: input.roundType,
          position: input.position,
          callbacksRequested: input.callbacksRequested,
        })
        .returning();

      return round;
    }),

  removeRound: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      await db.delete(rounds).where(eq(rounds.id, input.roundId));
      return { deleted: true };
    }),

  reassignHeats: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const comp = await requireCompOrgRole(event.competitionId, ctx.userId);
      const maxHeatSize = event.maxHeatSize ?? comp.maxHeatSize ?? 20;

      // Get all current entries for this event
      const eventEntries = await db.query.entries.findMany({
        where: and(eq(entries.eventId, event.id), eq(entries.scratched, false)),
      });
      const entryIds = eventEntries.map((e) => e.id);

      // Delete existing heats for this round (cascade deletes assignments)
      const existingHeats = await db.query.heats.findMany({
        where: eq(heats.roundId, round.id),
      });
      for (const h of existingHeats) {
        await db.delete(heats).where(eq(heats.id, h.id));
      }

      // Redistribute
      const heatGroups = distributeToHeats(entryIds, maxHeatSize);
      let created = 0;
      for (let i = 0; i < heatGroups.length; i++) {
        const [heat] = await db
          .insert(heats)
          .values({ roundId: round.id, heatNumber: i + 1 })
          .returning();

        if (heatGroups[i]!.length > 0) {
          await db.insert(heatAssignments).values(
            heatGroups[i]!.map((entryId) => ({ heatId: heat.id, entryId })),
          );
        }
        created++;
      }

      return { heats: created, entries: entryIds.length };
    }),

  moveEntry: protectedProcedure
    .input(
      z.object({
        entryId: z.number(),
        fromHeatId: z.number(),
        toHeatId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify both heats belong to the same round
      const fromHeat = await db.query.heats.findFirst({
        where: eq(heats.id, input.fromHeatId),
      });
      const toHeat = await db.query.heats.findFirst({
        where: eq(heats.id, input.toHeatId),
      });
      if (!fromHeat || !toHeat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Heat not found" });
      }
      if (fromHeat.roundId !== toHeat.roundId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Heats must be in the same round" });
      }

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, fromHeat.roundId),
      });
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round!.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      // Remove from old heat
      await db
        .delete(heatAssignments)
        .where(
          and(
            eq(heatAssignments.heatId, input.fromHeatId),
            eq(heatAssignments.entryId, input.entryId),
          ),
        );

      // Add to new heat
      const [assignment] = await db
        .insert(heatAssignments)
        .values({ heatId: input.toHeatId, entryId: input.entryId })
        .returning();

      return assignment;
    }),
});

/**
 * Generate rounds and heats for a single event.
 */
async function generateRoundsForEvent(
  event: typeof competitionEvents.$inferSelect,
  comp: typeof competitions.$inferSelect,
) {
  const maxFinal = event.maxFinalSize ?? comp.maxFinalSize ?? 8;
  const maxHeatSize = event.maxHeatSize ?? comp.maxHeatSize ?? 20;

  // Count non-scratched entries
  const [{ entryCount }] = await db
    .select({ entryCount: count(entries.id) })
    .from(entries)
    .where(and(eq(entries.eventId, event.id), eq(entries.scratched, false)));

  if (entryCount === 0) return { rounds: 0, heats: 0 };

  // Delete existing rounds for this event (cascade deletes heats + assignments)
  await db.delete(rounds).where(eq(rounds.eventId, event.id));

  const structure = determineRoundStructure(entryCount, maxFinal);

  let totalHeats = 0;
  for (let i = 0; i < structure.length; i++) {
    const roundType = structure[i]!;
    const [round] = await db
      .insert(rounds)
      .values({
        eventId: event.id,
        roundType: roundType as typeof rounds.$inferInsert.roundType,
        position: i + 1,
      })
      .returning();

    // Only assign heats for the first round (subsequent rounds are filled as couples advance)
    if (i === 0) {
      const eventEntries = await db.query.entries.findMany({
        where: and(eq(entries.eventId, event.id), eq(entries.scratched, false)),
      });
      const entryIds = eventEntries.map((e) => e.id);
      const heatGroups = distributeToHeats(entryIds, maxHeatSize);

      for (let h = 0; h < heatGroups.length; h++) {
        const [heat] = await db
          .insert(heats)
          .values({ roundId: round.id, heatNumber: h + 1 })
          .returning();

        if (heatGroups[h]!.length > 0) {
          await db.insert(heatAssignments).values(
            heatGroups[h]!.map((entryId) => ({ heatId: heat.id, entryId })),
          );
        }
        totalHeats++;
      }
    } else if (roundType === "final" && structure.length === 1) {
      // Straight final — assign all entries to one heat
      const eventEntries = await db.query.entries.findMany({
        where: and(eq(entries.eventId, event.id), eq(entries.scratched, false)),
      });

      const [heat] = await db
        .insert(heats)
        .values({ roundId: round.id, heatNumber: 1 })
        .returning();

      if (eventEntries.length > 0) {
        await db.insert(heatAssignments).values(
          eventEntries.map((e) => ({ heatId: heat.id, entryId: e.id })),
        );
      }
      totalHeats++;
    }
  }

  return { rounds: structure.length, heats: totalHeats };
}
