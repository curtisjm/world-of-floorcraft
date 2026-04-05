import { z } from "zod";
import { eq, and, asc, isNull, inArray } from "drizzle-orm";
import { router, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  competitionDays,
  scheduleBlocks,
  rounds,
  entries,
  competitionRegistrations,
  activeRounds,
  announcementNotes,
  roundResultsMeta,
  finalResults,
} from "@competitions/schema";
import { users } from "@shared/schema";

export const liveViewRouter = router({
  getSchedule: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) return null;

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

      // Get active round for current event highlighting
      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, input.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });

      let activeEventId: number | null = null;
      if (active) {
        const round = await db.query.rounds.findFirst({
          where: eq(rounds.id, active.roundId),
        });
        activeEventId = round?.eventId ?? null;
      }

      // Enrich events with status and couple numbers
      const eventData = await Promise.all(
        events.map(async (event) => {
          const eventRounds = await db.query.rounds.findMany({
            where: eq(rounds.eventId, event.id),
          });

          // Determine event status
          let status: "upcoming" | "in_progress" | "completed" = "upcoming";
          if (event.id === activeEventId) {
            status = "in_progress";
          } else if (eventRounds.length > 0 && eventRounds.every((r) => r.status === "completed")) {
            status = "completed";
          } else if (eventRounds.some((r) => r.status !== "pending")) {
            status = "completed"; // Past events that finished
          }

          // Get couple numbers
          const eventEntries = await db.query.entries.findMany({
            where: and(eq(entries.eventId, event.id), eq(entries.scratched, false)),
          });

          const regIds = [
            ...new Set(eventEntries.flatMap((e) => [e.leaderRegistrationId, e.followerRegistrationId])),
          ];

          const regs =
            regIds.length > 0
              ? await db.query.competitionRegistrations.findMany({
                  where: inArray(competitionRegistrations.id, regIds),
                })
              : [];

          const coupleNumbers = [
            ...new Set(regs.map((r) => r.competitorNumber).filter((n): n is number => n !== null)),
          ].sort((a, b) => a - b);

          return {
            id: event.id,
            name: event.name,
            sessionId: event.sessionId,
            position: event.position,
            status,
            coupleNumbers,
            entryCount: eventEntries.length,
          };
        }),
      );

      // Get announcement notes (projector-visible only)
      const notes = await db.query.announcementNotes.findMany({
        where: and(
          eq(announcementNotes.competitionId, input.competitionId),
          eq(announcementNotes.visibleOnProjector, true),
        ),
        orderBy: asc(announcementNotes.createdAt),
      });

      return {
        competition: { id: comp.id, name: comp.name, slug: comp.slug },
        days,
        blocks,
        events: eventData,
        activeEventId,
        notes,
      };
    }),

  getMyEvents: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // If not authenticated, just return empty set
      if (!userId) return { myEventIds: [] };

      // Find user's registration
      const reg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.userId, userId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      if (!reg) return { myEventIds: [] };

      // Find all entries where this user is leader or follower
      const myEntries = await db.query.entries.findMany({
        where: and(
          eq(entries.leaderRegistrationId, reg.id),
          eq(entries.scratched, false),
        ),
      });

      const myFollowerEntries = await db.query.entries.findMany({
        where: and(
          eq(entries.followerRegistrationId, reg.id),
          eq(entries.scratched, false),
        ),
      });

      const allMyEntries = [...myEntries, ...myFollowerEntries];
      const myEventIds = [...new Set(allMyEntries.map((e) => e.eventId))];

      return { myEventIds };
    }),

  getAblyToken: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const { createPublicAblyToken } = await import("@competitions/lib/ably-comp");
      return createPublicAblyToken(input.competitionId);
    }),

  getPublishedResults: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) return null;

      // Find rounds with published results
      const eventRounds = await db.query.rounds.findMany({
        where: eq(rounds.eventId, input.eventId),
        orderBy: asc(rounds.position),
      });

      const publishedRounds = [];
      for (const round of eventRounds) {
        const meta = await db.query.roundResultsMeta.findFirst({
          where: and(
            eq(roundResultsMeta.roundId, round.id),
            eq(roundResultsMeta.status, "published"),
          ),
        });
        if (meta) publishedRounds.push(round);
      }

      // Get results for published rounds
      const results = await Promise.all(
        publishedRounds.map(async (round) => {
          const roundResults = await db.query.finalResults.findMany({
            where: and(
              eq(finalResults.roundId, round.id),
              isNull(finalResults.danceName),
            ),
            orderBy: asc(finalResults.placement),
          });

          // If no overall results (single dance), get all results
          const actualResults =
            roundResults.length > 0
              ? roundResults
              : await db.query.finalResults.findMany({
                  where: eq(finalResults.roundId, round.id),
                  orderBy: asc(finalResults.placement),
                });

          // Enrich with names
          const enriched = await Promise.all(
            actualResults.map(async (r) => {
              const entry = await db.query.entries.findFirst({
                where: eq(entries.id, r.entryId),
              });
              if (!entry) return { ...r, coupleNumber: null, leaderName: null, followerName: null };

              const leaderReg = await db.query.competitionRegistrations.findFirst({
                where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
              });
              const followerReg = await db.query.competitionRegistrations.findFirst({
                where: eq(competitionRegistrations.id, entry.followerRegistrationId),
              });

              const leader = leaderReg
                ? await db.query.users.findFirst({ where: eq(users.id, leaderReg.userId) })
                : null;
              const follower = followerReg
                ? await db.query.users.findFirst({ where: eq(users.id, followerReg.userId) })
                : null;

              return {
                ...r,
                coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber ?? null,
                leaderName: leader?.displayName ?? null,
                followerName: follower?.displayName ?? null,
              };
            }),
          );

          return {
            roundId: round.id,
            roundType: round.roundType,
            results: enriched,
          };
        }),
      );

      return { eventName: event.name, rounds: results };
    }),
});
