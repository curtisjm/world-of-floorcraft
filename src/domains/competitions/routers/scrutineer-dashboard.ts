import { z } from "zod";
import { eq, and, asc, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitionEvents,
  competitionRegistrations,
  scheduleBlocks,
  rounds,
  entries,
  activeRounds,
  judgeSubmissions,
  roundResultsMeta,
  addDropRequests,
} from "@competitions/schema";
import { requireCompOrgRole } from "@competitions/lib/auth";

export const scrutineerDashboardRouter = router({
  getDashboard: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const comp = await requireCompOrgRole(input.competitionId, ctx.userId);

      // Get current active round
      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, input.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });

      let activeRoundInfo = null;
      let submissions: { judgeId: number; status: string; submittedAt: Date | null }[] = [];
      if (active) {
        const round = await db.query.rounds.findFirst({
          where: eq(rounds.id, active.roundId),
        });
        const event = round
          ? await db.query.competitionEvents.findFirst({
              where: eq(competitionEvents.id, round.eventId),
            })
          : null;

        activeRoundInfo = {
          roundId: active.roundId,
          eventName: event?.name ?? "Unknown",
          roundType: round?.roundType,
          startedAt: active.startedAt,
        };

        submissions = (
          await db.query.judgeSubmissions.findMany({
            where: eq(judgeSubmissions.roundId, active.roundId),
          })
        ).map((s) => ({
          judgeId: s.judgeId,
          status: s.status,
          submittedAt: s.submittedAt,
        }));
      }

      // Registration check-in counts
      const [regCounts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          checkedIn: sql<number>`count(case when ${competitionRegistrations.checkedIn} then 1 end)::int`,
        })
        .from(competitionRegistrations)
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        );

      // Pending add/drops
      const [addDropCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(addDropRequests)
        .where(
          and(
            eq(addDropRequests.competitionId, input.competitionId),
            eq(addDropRequests.status, "pending"),
          ),
        );

      // Event summary with round statuses
      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const eventSummaries = await Promise.all(
        events.map(async (event) => {
          const eventRounds = await db.query.rounds.findMany({
            where: eq(rounds.eventId, event.id),
            orderBy: asc(rounds.position),
          });

          const [entryCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(entries)
            .where(and(eq(entries.eventId, event.id), eq(entries.scratched, false)));

          return {
            id: event.id,
            name: event.name,
            sessionId: event.sessionId,
            position: event.position,
            entryCount: entryCount?.count ?? 0,
            rounds: eventRounds.map((r) => ({
              id: r.id,
              roundType: r.roundType,
              status: r.status,
            })),
          };
        }),
      );

      return {
        competition: comp,
        activeRound: activeRoundInfo,
        submissions,
        registrations: regCounts ?? { total: 0, checkedIn: 0 },
        pendingAddDrops: addDropCount?.count ?? 0,
        events: eventSummaries,
      };
    }),

  getEventProgress: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      const eventRounds = await db.query.rounds.findMany({
        where: eq(rounds.eventId, input.eventId),
        orderBy: asc(rounds.position),
      });

      const roundDetails = await Promise.all(
        eventRounds.map(async (round) => {
          const [entryCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(entries)
            .where(and(eq(entries.eventId, input.eventId), eq(entries.scratched, false)));

          const meta = await db.query.roundResultsMeta.findFirst({
            where: eq(roundResultsMeta.roundId, round.id),
          });

          return {
            id: round.id,
            roundType: round.roundType,
            status: round.status,
            position: round.position,
            callbacksRequested: round.callbacksRequested,
            entryCount: entryCount?.count ?? 0,
            resultStatus: meta?.status ?? null,
          };
        }),
      );

      return {
        event: { id: event.id, name: event.name },
        rounds: roundDetails,
      };
    }),

  markEventComplete: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const comp = await requireCompOrgRole(event.competitionId, ctx.userId);

      // Verify all rounds have published results
      const eventRounds = await db.query.rounds.findMany({
        where: eq(rounds.eventId, input.eventId),
      });

      if (eventRounds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event has no rounds" });
      }

      for (const round of eventRounds) {
        const meta = await db.query.roundResultsMeta.findFirst({
          where: eq(roundResultsMeta.roundId, round.id),
        });
        if (!meta || meta.status !== "published") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Round ${round.roundType} results not published yet`,
          });
        }
      }

      // Mark all rounds as completed
      for (const round of eventRounds) {
        await db
          .update(rounds)
          .set({ status: "completed" })
          .where(eq(rounds.id, round.id));
      }

      // Ably broadcast
      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "event:completed", { eventId: input.eventId });
      } catch {
        // Ably not available
      }

      return { completed: true };
    }),

  updateScheduleLive: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        updates: z.array(
          z.object({
            blockId: z.number(),
            estimatedStartTime: z.string().datetime().optional(),
            estimatedEndTime: z.string().datetime().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comp = await requireCompOrgRole(input.competitionId, ctx.userId);

      for (const update of input.updates) {
        const changes: Record<string, unknown> = {};
        if (update.estimatedStartTime) changes.estimatedStartTime = new Date(update.estimatedStartTime);
        if (update.estimatedEndTime) changes.estimatedEndTime = new Date(update.estimatedEndTime);

        if (Object.keys(changes).length > 0) {
          await db
            .update(scheduleBlocks)
            .set(changes)
            .where(eq(scheduleBlocks.id, update.blockId));
        }
      }

      // Ably broadcast
      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "schedule:updated", {});
      } catch {
        // Ably not available
      }

      return { updated: input.updates.length };
    }),
});
