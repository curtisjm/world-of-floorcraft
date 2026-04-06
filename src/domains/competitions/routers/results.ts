import { z } from "zod";
import { eq, and, asc, desc, isNull, inArray, or, ilike, sql } from "drizzle-orm";
import { router, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  competitionDays,
  scheduleBlocks,
  eventDances,
  rounds,
  entries,
  competitionRegistrations,
  finalResults,
  tabulationTables,
  roundResultsMeta,
  competitionJudges,
  judges,
  recordRemovalRequests,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { organizations } from "@orgs/schema";

export const resultsRouter = router({
  // ── All published results for a competition ─────────────────────
  getByCompetition: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) return null;

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, comp.orgId),
      });

      // Get events grouped by session/block
      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      // Get days + blocks for grouping
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

      // Build results per event (only events with published results)
      const eventResults = [];
      for (const event of events) {
        const dances = await db.query.eventDances.findMany({
          where: eq(eventDances.eventId, event.id),
          orderBy: asc(eventDances.position),
        });

        // Find final round with published results
        const eventRounds = await db.query.rounds.findMany({
          where: eq(rounds.eventId, event.id),
          orderBy: desc(rounds.position),
        });

        let publishedRound = null;
        for (const round of eventRounds) {
          const meta = await db.query.roundResultsMeta.findFirst({
            where: and(
              eq(roundResultsMeta.roundId, round.id),
              eq(roundResultsMeta.status, "published"),
            ),
          });
          if (meta && round.roundType === "final") {
            publishedRound = round;
            break;
          }
          if (meta && !publishedRound) {
            publishedRound = round;
          }
        }

        if (!publishedRound) continue;

        // Get overall placements (danceName IS NULL for multi-dance summary)
        let results = await db.query.finalResults.findMany({
          where: and(
            eq(finalResults.roundId, publishedRound.id),
            isNull(finalResults.danceName),
          ),
          orderBy: asc(finalResults.placement),
        });

        // If no overall results (single dance), get all results
        if (results.length === 0) {
          results = await db.query.finalResults.findMany({
            where: eq(finalResults.roundId, publishedRound.id),
            orderBy: asc(finalResults.placement),
          });
        }

        // Get hidden entries from approved removal requests
        const removals = await db.query.recordRemovalRequests.findMany({
          where: and(
            eq(recordRemovalRequests.competitionId, input.competitionId),
            eq(recordRemovalRequests.status, "approved"),
          ),
        });
        const hiddenEntryIds = new Set(
          removals.filter((r) => r.entryId != null).map((r) => r.entryId!),
        );
        const hiddenUserIds = new Set(
          removals.filter((r) => r.entryId == null).map((r) => r.userId),
        );

        // Enrich with names
        const placements = await Promise.all(
          results.map(async (r) => {
            // Check if this entry is hidden
            if (hiddenEntryIds.has(r.entryId)) return null;

            const entry = await db.query.entries.findFirst({
              where: eq(entries.id, r.entryId),
            });
            if (!entry) return null;

            const leaderReg = await db.query.competitionRegistrations.findFirst({
              where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
            });
            const followerReg = await db.query.competitionRegistrations.findFirst({
              where: eq(competitionRegistrations.id, entry.followerRegistrationId),
            });

            // Check user-level removals
            if (leaderReg && hiddenUserIds.has(leaderReg.userId)) return null;
            if (followerReg && hiddenUserIds.has(followerReg.userId)) return null;

            const leader = leaderReg
              ? await db.query.users.findFirst({ where: eq(users.id, leaderReg.userId) })
              : null;
            const follower = followerReg
              ? await db.query.users.findFirst({ where: eq(users.id, followerReg.userId) })
              : null;

            const leaderOrg = leaderReg?.orgId
              ? await db.query.organizations.findFirst({ where: eq(organizations.id, leaderReg.orgId) })
              : null;

            return {
              placement: r.placement,
              coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber ?? null,
              leaderName: leader?.displayName ?? null,
              leaderUserId: leader?.id ?? null,
              followerName: follower?.displayName ?? null,
              followerUserId: follower?.id ?? null,
              organization: leaderOrg?.name ?? null,
            };
          }),
        );

        eventResults.push({
          eventId: event.id,
          eventName: event.name,
          style: event.style,
          level: event.level,
          sessionId: event.sessionId,
          dances: dances.map((d) => d.danceName),
          placements: placements.filter((p) => p !== null),
        });
      }

      return {
        competition: {
          id: comp.id,
          name: comp.name,
          slug: comp.slug,
          organization: org?.name ?? null,
        },
        days,
        blocks,
        events: eventResults,
      };
    }),

  // ── Full results for a single event (Summary + Marks) ───────────
  getEventResults: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) return null;

      const dances = await db.query.eventDances.findMany({
        where: eq(eventDances.eventId, input.eventId),
        orderBy: asc(eventDances.position),
      });

      // Find all rounds with published results
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

      if (publishedRounds.length === 0) return null;

      // Get hidden entries
      const removals = await db.query.recordRemovalRequests.findMany({
        where: and(
          eq(recordRemovalRequests.competitionId, event.competitionId),
          eq(recordRemovalRequests.status, "approved"),
        ),
      });
      const hiddenEntryIds = new Set(
        removals.filter((r) => r.entryId != null).map((r) => r.entryId!),
      );

      // Get competition judges for marks display
      const compJudges = await db.query.competitionJudges.findMany({
        where: eq(competitionJudges.competitionId, event.competitionId),
      });
      const judgeIds = compJudges.map((cj) => cj.judgeId);
      const judgeRows =
        judgeIds.length > 0
          ? await db.query.judges.findMany({ where: inArray(judges.id, judgeIds) })
          : [];
      // judgeMap available for future marks enrichment

      // Build per-round data
      const roundData = await Promise.all(
        publishedRounds.map(async (round) => {
          // Summary: overall placements
          let summaryResults = await db.query.finalResults.findMany({
            where: and(
              eq(finalResults.roundId, round.id),
              isNull(finalResults.danceName),
            ),
            orderBy: asc(finalResults.placement),
          });

          // For single dance, get all results
          if (summaryResults.length === 0) {
            summaryResults = await db.query.finalResults.findMany({
              where: eq(finalResults.roundId, round.id),
              orderBy: asc(finalResults.placement),
            });
          }

          // Filter hidden entries
          const visibleResults = summaryResults.filter(
            (r) => !hiddenEntryIds.has(r.entryId),
          );

          // Enrich summary placements
          const summary = await Promise.all(
            visibleResults.map(async (r) => {
              const entry = await db.query.entries.findFirst({
                where: eq(entries.id, r.entryId),
              });
              const leaderReg = entry
                ? await db.query.competitionRegistrations.findFirst({
                    where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
                  })
                : null;
              const followerReg = entry
                ? await db.query.competitionRegistrations.findFirst({
                    where: eq(competitionRegistrations.id, entry.followerRegistrationId),
                  })
                : null;
              const leader = leaderReg
                ? await db.query.users.findFirst({ where: eq(users.id, leaderReg.userId) })
                : null;
              const follower = followerReg
                ? await db.query.users.findFirst({ where: eq(users.id, followerReg.userId) })
                : null;
              const leaderOrg = leaderReg?.orgId
                ? await db.query.organizations.findFirst({ where: eq(organizations.id, leaderReg.orgId) })
                : null;

              // Per-dance placements for multi-dance events
              const perDance =
                dances.length > 1
                  ? await db.query.finalResults.findMany({
                      where: and(
                        eq(finalResults.roundId, round.id),
                        eq(finalResults.entryId, r.entryId),
                      ),
                    })
                  : [];

              return {
                placement: r.placement,
                placementValue: r.placementValue,
                tiebreakRule: r.tiebreakRule,
                coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber ?? null,
                leaderName: leader?.displayName ?? null,
                followerName: follower?.displayName ?? null,
                organization: leaderOrg?.name ?? null,
                perDancePlacements: perDance
                  .filter((pd) => pd.danceName !== null)
                  .map((pd) => ({
                    danceName: pd.danceName!,
                    placement: pd.placement,
                  })),
              };
            }),
          );

          // Marks: tabulation data
          const tabulation = await db.query.tabulationTables.findMany({
            where: eq(tabulationTables.roundId, round.id),
          });

          return {
            roundId: round.id,
            roundType: round.roundType,
            summary,
            tabulation: tabulation
              .filter((t) => !hiddenEntryIds.has(t.entryId))
              .map((t) => ({
                entryId: t.entryId,
                danceName: t.danceName,
                tableData: t.tableData,
              })),
            judges: judgeRows.map((j) => ({
              id: j.id,
              initials: j.initials ?? `${j.firstName[0]}${j.lastName[0]}`,
              name: `${j.firstName} ${j.lastName}`,
            })),
          };
        }),
      );

      return {
        eventName: event.name,
        style: event.style,
        level: event.level,
        dances: dances.map((d) => d.danceName),
        rounds: roundData,
      };
    }),

  // ── Competitor history across all competitions ──────────────────
  getCompetitorHistory: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });
      if (!user) return null;

      // Find all registrations for this user
      const regs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.userId, input.userId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      // Get approved removals for this user
      const removals = await db.query.recordRemovalRequests.findMany({
        where: and(
          eq(recordRemovalRequests.userId, input.userId),
          eq(recordRemovalRequests.status, "approved"),
        ),
      });
      const hiddenCompIds = new Set(
        removals.filter((r) => r.entryId == null).map((r) => r.competitionId),
      );
      const hiddenEntryIds = new Set(
        removals.filter((r) => r.entryId != null).map((r) => r.entryId!),
      );

      const compResults = [];
      for (const reg of regs) {
        if (hiddenCompIds.has(reg.competitionId)) continue;

        const comp = await db.query.competitions.findFirst({
          where: eq(competitions.id, reg.competitionId),
        });
        if (!comp || comp.status !== "finished") continue;

        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, comp.orgId),
        });

        // Get earliest day date for sorting
        const firstDay = await db.query.competitionDays.findFirst({
          where: eq(competitionDays.competitionId, comp.id),
          orderBy: asc(competitionDays.position),
        });

        // Find all entries where this user participated
        const userEntries = await db.query.entries.findMany({
          where: and(
            or(
              eq(entries.leaderRegistrationId, reg.id),
              eq(entries.followerRegistrationId, reg.id),
            ),
            eq(entries.scratched, false),
          ),
        });

        const eventPlacements = [];
        for (const entry of userEntries) {
          if (hiddenEntryIds.has(entry.id)) continue;

          const event = await db.query.competitionEvents.findFirst({
            where: eq(competitionEvents.id, entry.eventId),
          });
          if (!event) continue;

          // Find published final round result for this entry
          const eventRounds = await db.query.rounds.findMany({
            where: eq(rounds.eventId, entry.eventId),
            orderBy: desc(rounds.position),
          });

          let placement: number | null = null;
          for (const round of eventRounds) {
            const meta = await db.query.roundResultsMeta.findFirst({
              where: and(
                eq(roundResultsMeta.roundId, round.id),
                eq(roundResultsMeta.status, "published"),
              ),
            });
            if (!meta) continue;

            // Get overall placement (danceName IS NULL)
            let result = await db.query.finalResults.findFirst({
              where: and(
                eq(finalResults.roundId, round.id),
                eq(finalResults.entryId, entry.id),
                isNull(finalResults.danceName),
              ),
            });
            // Single dance fallback
            if (!result) {
              result = await db.query.finalResults.findFirst({
                where: and(
                  eq(finalResults.roundId, round.id),
                  eq(finalResults.entryId, entry.id),
                ),
              });
            }
            if (result) {
              placement = result.placement;
              break;
            }
          }

          // Get partner name
          const isLeader = entry.leaderRegistrationId === reg.id;
          const partnerRegId = isLeader
            ? entry.followerRegistrationId
            : entry.leaderRegistrationId;
          const partnerReg = await db.query.competitionRegistrations.findFirst({
            where: eq(competitionRegistrations.id, partnerRegId),
          });
          const partner = partnerReg
            ? await db.query.users.findFirst({ where: eq(users.id, partnerReg.userId) })
            : null;

          eventPlacements.push({
            eventId: event.id,
            eventName: event.name,
            placement,
            partnerName: partner?.displayName ?? null,
          });
        }

        if (eventPlacements.length > 0) {
          compResults.push({
            competitionId: comp.id,
            competitionName: comp.name,
            competitionSlug: comp.slug,
            organizationName: org?.name ?? null,
            date: firstDay?.date ?? null,
            events: eventPlacements,
          });
        }
      }

      // Sort by date descending
      compResults.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });

      return {
        user: { id: user.id, displayName: user.displayName },
        competitions: compResults,
      };
    }),

  // ── Search competitors ──────────────────────────────────────────
  searchCompetitors: publicProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      // Search users who have at least one competition registration
      const matchingUsers = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          username: users.username,
          competitionCount: sql<number>`count(distinct ${competitionRegistrations.competitionId})`.as("competition_count"),
        })
        .from(users)
        .innerJoin(
          competitionRegistrations,
          and(
            eq(competitionRegistrations.userId, users.id),
            eq(competitionRegistrations.cancelled, false),
          ),
        )
        .where(
          or(
            ilike(users.displayName, `%${input.query}%`),
            ilike(users.username, `%${input.query}%`),
          ),
        )
        .groupBy(users.id, users.displayName, users.username)
        .orderBy(desc(sql`competition_count`))
        .limit(20);

      return matchingUsers.map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        username: u.username,
        competitionCount: Number(u.competitionCount),
      }));
    }),
});
