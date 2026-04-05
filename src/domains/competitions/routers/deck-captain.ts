import { z } from "zod";
import { eq, and, asc, isNull, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitionEvents,
  competitionRegistrations,
  entries,
  rounds,
  activeRounds,
  deckCaptainCheckins,
  scheduleBlocks,
  competitionDays,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

export const deckCaptainRouter = router({
  getCheckinView: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        roundId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["deck_captain"]);

      // Find the round to show
      let roundId = input.roundId;
      if (!roundId) {
        const active = await db.query.activeRounds.findFirst({
          where: and(
            eq(activeRounds.competitionId, input.competitionId),
            isNull(activeRounds.endedAt),
          ),
        });
        if (!active) {
          return { roundId: null, eventName: null, roundType: null, entries: [] };
        }
        roundId = active.roundId;
      }

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });

      // Get all entries for this event
      const eventEntries = await db
        .select({
          entryId: entries.id,
          leaderRegId: entries.leaderRegistrationId,
          followerRegId: entries.followerRegistrationId,
          scratched: entries.scratched,
        })
        .from(entries)
        .where(and(eq(entries.eventId, round.eventId), eq(entries.scratched, false)));

      // Get registration details for leader/follower
      const regIds = [
        ...new Set(eventEntries.flatMap((e) => [e.leaderRegId, e.followerRegId])),
      ];

      const regs =
        regIds.length > 0
          ? await db
              .select({
                id: competitionRegistrations.id,
                competitorNumber: competitionRegistrations.competitorNumber,
                displayName: users.displayName,
              })
              .from(competitionRegistrations)
              .innerJoin(users, eq(users.id, competitionRegistrations.userId))
              .where(inArray(competitionRegistrations.id, regIds))
          : [];

      const regMap = new Map(regs.map((r) => [r.id, r]));

      // Get checkin status for this round
      const checkins = await db.query.deckCaptainCheckins.findMany({
        where: eq(deckCaptainCheckins.roundId, roundId),
      });
      const checkinMap = new Map(checkins.map((c) => [c.entryId, c]));

      // Compute stay-on-floor: check if entry appears in the next event in the same session
      const stayOnFloorSet = await computeStayOnFloor(
        input.competitionId,
        round.eventId,
        eventEntries.map((e) => ({
          entryId: e.entryId,
          leaderRegId: e.leaderRegId,
          followerRegId: e.followerRegId,
        })),
      );

      const result = eventEntries.map((e) => {
        const leader = regMap.get(e.leaderRegId);
        const follower = regMap.get(e.followerRegId);
        const checkin = checkinMap.get(e.entryId);
        return {
          entryId: e.entryId,
          coupleNumber: leader?.competitorNumber ?? follower?.competitorNumber,
          leaderName: leader?.displayName ?? "Unknown",
          followerName: follower?.displayName ?? "Unknown",
          status: checkin?.status ?? "not_checked_in",
          stayOnFloor: stayOnFloorSet.has(e.entryId),
        };
      });

      // Sort by couple number
      result.sort((a, b) => (a.coupleNumber ?? 999) - (b.coupleNumber ?? 999));

      return {
        roundId,
        eventName: event?.name ?? "Unknown",
        roundType: round.roundType,
        entries: result,
      };
    }),

  getScheduleView: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["deck_captain"]);

      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, input.competitionId),
        orderBy: asc(competitionDays.position),
      });

      const dayIds = days.map((d) => d.id);
      const blocks =
        dayIds.length > 0
          ? await db.query.scheduleBlocks.findMany({
              where: inArray(scheduleBlocks.dayId, dayIds),
              orderBy: asc(scheduleBlocks.position),
            })
          : [];

      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      // Get round statuses and entry counts per event
      const eventData = await Promise.all(
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
            ...event,
            rounds: eventRounds.map((r) => ({
              id: r.id,
              roundType: r.roundType,
              status: r.status,
            })),
            entryCount: entryCount?.count ?? 0,
          };
        }),
      );

      return { days, blocks, events: eventData };
    }),

  checkin: protectedProcedure
    .input(z.object({ roundId: z.number(), entryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      const comp = await requireCompStaffRole(event!.competitionId, ctx.userId, ["deck_captain"]);

      // Upsert: set status to ready
      const existing = await db.query.deckCaptainCheckins.findFirst({
        where: and(
          eq(deckCaptainCheckins.roundId, input.roundId),
          eq(deckCaptainCheckins.entryId, input.entryId),
        ),
      });

      if (existing) {
        await db
          .update(deckCaptainCheckins)
          .set({ status: "ready", checkedInBy: ctx.userId, updatedAt: new Date() })
          .where(eq(deckCaptainCheckins.id, existing.id));
      } else {
        await db.insert(deckCaptainCheckins).values({
          roundId: input.roundId,
          entryId: input.entryId,
          status: "ready",
          checkedInBy: ctx.userId,
        });
      }

      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "checkin:deck", {
          roundId: input.roundId,
          entryId: input.entryId,
          status: "ready",
        });
      } catch {
        // Ably not available
      }

      return { status: "ready" };
    }),

  scratch: protectedProcedure
    .input(z.object({ roundId: z.number(), entryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      const comp = await requireCompStaffRole(event!.competitionId, ctx.userId, ["deck_captain"]);

      // Upsert checkin with scratched status
      const existing = await db.query.deckCaptainCheckins.findFirst({
        where: and(
          eq(deckCaptainCheckins.roundId, input.roundId),
          eq(deckCaptainCheckins.entryId, input.entryId),
        ),
      });

      if (existing) {
        await db
          .update(deckCaptainCheckins)
          .set({ status: "scratched", checkedInBy: ctx.userId, updatedAt: new Date() })
          .where(eq(deckCaptainCheckins.id, existing.id));
      } else {
        await db.insert(deckCaptainCheckins).values({
          roundId: input.roundId,
          entryId: input.entryId,
          status: "scratched",
          checkedInBy: ctx.userId,
        });
      }

      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "checkin:deck", {
          roundId: input.roundId,
          entryId: input.entryId,
          status: "scratched",
        });
      } catch {
        // Ably not available
      }

      return { status: "scratched" };
    }),

  unscratch: protectedProcedure
    .input(z.object({ roundId: z.number(), entryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      const comp = await requireCompStaffRole(event!.competitionId, ctx.userId, ["deck_captain"]);

      const existing = await db.query.deckCaptainCheckins.findFirst({
        where: and(
          eq(deckCaptainCheckins.roundId, input.roundId),
          eq(deckCaptainCheckins.entryId, input.entryId),
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No check-in record to unscratch" });
      }

      await db
        .update(deckCaptainCheckins)
        .set({ status: "ready", checkedInBy: ctx.userId, updatedAt: new Date() })
        .where(eq(deckCaptainCheckins.id, existing.id));

      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "checkin:deck", {
          roundId: input.roundId,
          entryId: input.entryId,
          status: "ready",
        });
      } catch {
        // Ably not available
      }

      return { status: "ready" };
    }),
});

// ── Helper: compute stay-on-floor ──────────────────────────────────────

async function computeStayOnFloor(
  competitionId: number,
  currentEventId: number,
  currentEntries: { entryId: number; leaderRegId: number; followerRegId: number }[],
): Promise<Set<number>> {
  const stayOnFloor = new Set<number>();

  // Find the current event's session and position
  const currentEvent = await db.query.competitionEvents.findFirst({
    where: eq(competitionEvents.id, currentEventId),
  });
  if (!currentEvent?.sessionId) return stayOnFloor;

  // Find the next event in the same session
  const sessionEvents = await db.query.competitionEvents.findMany({
    where: and(
      eq(competitionEvents.competitionId, competitionId),
      eq(competitionEvents.sessionId, currentEvent.sessionId),
    ),
    orderBy: asc(competitionEvents.position),
  });

  const currentIdx = sessionEvents.findIndex((e) => e.id === currentEventId);
  if (currentIdx === -1 || currentIdx >= sessionEvents.length - 1) return stayOnFloor;

  const nextEvent = sessionEvents[currentIdx + 1]!;

  // Get entries in the next event
  const nextEntries = await db.query.entries.findMany({
    where: and(eq(entries.eventId, nextEvent.id), eq(entries.scratched, false)),
  });

  // Build sets of registration IDs in the next event
  const nextLeaderRegs = new Set(nextEntries.map((e) => e.leaderRegistrationId));
  const nextFollowerRegs = new Set(nextEntries.map((e) => e.followerRegistrationId));

  // Check if any current entry's leader or follower is in the next event
  for (const entry of currentEntries) {
    if (
      nextLeaderRegs.has(entry.leaderRegId) ||
      nextFollowerRegs.has(entry.followerRegId) ||
      nextLeaderRegs.has(entry.followerRegId) ||
      nextFollowerRegs.has(entry.leaderRegId)
    ) {
      stayOnFloor.add(entry.entryId);
    }
  }

  return stayOnFloor;
}
