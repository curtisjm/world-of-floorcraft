import { z } from "zod";
import { eq, and, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  competitionDays,
  rounds,
  entries,
  competitionRegistrations,
  finalResults,
  roundResultsMeta,
  addDropRequests,
  payments,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { organizations, memberships } from "@orgs/schema";

async function requireOrgMember(orgId: number, userId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

  if (org.ownerId === userId) return org;

  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Must be an org member" });
  }

  return org;
}

async function requireOrgAdmin(orgId: number, userId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

  if (org.ownerId === userId) return org;

  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
  });
  if (membership?.role === "admin") return org;

  throw new TRPCError({ code: "FORBIDDEN", message: "Org admin required" });
}

export const orgCompetitionRouter = router({
  // ── Org schedule for a competition ──────────────────────────────
  getOrgSchedule: protectedProcedure
    .input(z.object({ competitionId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.userId);

      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      // Get org's registrations
      const orgRegs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.orgId, input.orgId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      const regIdSet = new Set(orgRegs.map((r) => r.id));

      // Batch: fetch all events, then all non-scratched entries for those events
      const allEvents = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const eventIds = allEvents.map((e) => e.id);
      const allEntries =
        eventIds.length > 0
          ? await db.query.entries.findMany({
              where: and(inArray(entries.eventId, eventIds), eq(entries.scratched, false)),
            })
          : [];

      // Group entries by event and filter to org entries
      const orgEntriesByEvent = new Map<number, typeof allEntries>();
      for (const e of allEntries) {
        if (!regIdSet.has(e.leaderRegistrationId) && !regIdSet.has(e.followerRegistrationId)) continue;
        const arr = orgEntriesByEvent.get(e.eventId) ?? [];
        arr.push(e);
        orgEntriesByEvent.set(e.eventId, arr);
      }

      // Batch: fetch all registrations and users needed for enrichment
      const allRegIds = [
        ...new Set(
          [...orgEntriesByEvent.values()]
            .flat()
            .flatMap((e) => [e.leaderRegistrationId, e.followerRegistrationId]),
        ),
      ];

      const allRegsData =
        allRegIds.length > 0
          ? await db.query.competitionRegistrations.findMany({
              where: inArray(competitionRegistrations.id, allRegIds),
            })
          : [];
      const regMap = new Map(allRegsData.map((r) => [r.id, r]));

      const allUserIds = [...new Set(allRegsData.map((r) => r.userId))];
      const allUsers =
        allUserIds.length > 0
          ? await db.query.users.findMany({ where: inArray(users.id, allUserIds) })
          : [];
      const userMap = new Map(allUsers.map((u) => [u.id, u]));

      // Assemble org events
      const orgEvents = [];
      for (const event of allEvents) {
        const orgEntries = orgEntriesByEvent.get(event.id);
        if (!orgEntries || orgEntries.length === 0) continue;

        const couples = orgEntries.map((entry) => {
          const leaderReg = regMap.get(entry.leaderRegistrationId);
          const followerReg = regMap.get(entry.followerRegistrationId);
          const leader = leaderReg ? userMap.get(leaderReg.userId) : null;
          const follower = followerReg ? userMap.get(followerReg.userId) : null;

          return {
            entryId: entry.id,
            coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber ?? null,
            leaderName: leader?.displayName ?? null,
            followerName: follower?.displayName ?? null,
          };
        });

        orgEvents.push({
          eventId: event.id,
          eventName: event.name,
          sessionId: event.sessionId,
          position: event.position,
          couples,
        });
      }

      // Get schedule structure for time estimation
      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, input.competitionId),
        orderBy: asc(competitionDays.position),
      });

      return {
        competitionName: comp.name,
        events: orgEvents,
        days,
      };
    }),

  // ── Org entries for a competition ──���────────────────────────────
  getOrgEntries: protectedProcedure
    .input(z.object({ competitionId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.userId);

      const orgRegs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.orgId, input.orgId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      if (orgRegs.length === 0) return [];

      const regIds = orgRegs.map((r) => r.id);

      // Batch: fetch all users, entries, events, and payments in parallel
      const [allUsersData, allLeaderEntries, allFollowerEntries, allEventsData, allPaymentsData] =
        await Promise.all([
          db.query.users.findMany({
            where: inArray(users.id, orgRegs.map((r) => r.userId)),
          }),
          db.query.entries.findMany({
            where: and(inArray(entries.leaderRegistrationId, regIds), eq(entries.scratched, false)),
          }),
          db.query.entries.findMany({
            where: and(
              inArray(entries.followerRegistrationId, regIds),
              eq(entries.scratched, false),
            ),
          }),
          db.query.competitionEvents.findMany({
            where: eq(competitionEvents.competitionId, input.competitionId),
          }),
          db.query.payments.findMany({
            where: inArray(payments.registrationId, regIds),
          }),
        ]);

      const userMap = new Map(allUsersData.map((u) => [u.id, u]));
      const eventMap = new Map(allEventsData.map((e) => [e.id, e]));

      // Group entries by registration
      const entriesByReg = new Map<number, typeof allLeaderEntries>();
      for (const e of allLeaderEntries) {
        const arr = entriesByReg.get(e.leaderRegistrationId) ?? [];
        arr.push(e);
        entriesByReg.set(e.leaderRegistrationId, arr);
      }
      for (const e of allFollowerEntries) {
        const arr = entriesByReg.get(e.followerRegistrationId) ?? [];
        arr.push(e);
        entriesByReg.set(e.followerRegistrationId, arr);
      }

      // Group payments by registration
      const paymentsByReg = new Map<number, typeof allPaymentsData>();
      for (const p of allPaymentsData) {
        const arr = paymentsByReg.get(p.registrationId) ?? [];
        arr.push(p);
        paymentsByReg.set(p.registrationId, arr);
      }

      // Assemble results
      const enriched = orgRegs.map((reg) => {
        const user = userMap.get(reg.userId);
        const regEntries = entriesByReg.get(reg.id) ?? [];
        const eventNames = regEntries.map(
          (e) => eventMap.get(e.eventId)?.name ?? "Unknown",
        );
        const regPayments = paymentsByReg.get(reg.id) ?? [];
        const totalPaid = regPayments.reduce(
          (sum, p) => sum + parseFloat(p.amount),
          0,
        );

        return {
          registrationId: reg.id,
          userId: reg.userId,
          displayName: user?.displayName ?? null,
          competitorNumber: reg.competitorNumber,
          checkedIn: reg.checkedIn,
          amountOwed: parseFloat(reg.amountOwed),
          totalPaid,
          eventCount: regEntries.length,
          eventNames,
        };
      });

      return enriched;
    }),

  // ── Org results for a competition ───────────────────────────────
  getOrgResults: protectedProcedure
    .input(z.object({ competitionId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.userId);

      const orgRegs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.orgId, input.orgId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      if (orgRegs.length === 0) return [];

      const regIdSet = new Set(orgRegs.map((r) => r.id));

      // Batch: fetch events, all rounds, and all published meta
      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const eventIds = events.map((e) => e.id);
      if (eventIds.length === 0) return [];

      const allRounds = await db.query.rounds.findMany({
        where: inArray(rounds.eventId, eventIds),
        orderBy: asc(rounds.position),
      });

      const roundIds = allRounds.map((r) => r.id);
      const allMeta =
        roundIds.length > 0
          ? await db.query.roundResultsMeta.findMany({
              where: and(
                inArray(roundResultsMeta.roundId, roundIds),
                eq(roundResultsMeta.status, "published"),
              ),
            })
          : [];

      const publishedRoundIds = new Set(allMeta.map((m) => m.roundId));

      // Find the last published round per event (the "final" published round)
      const roundsByEvent = new Map<number, typeof allRounds>();
      for (const r of allRounds) {
        const arr = roundsByEvent.get(r.eventId) ?? [];
        arr.push(r);
        roundsByEvent.set(r.eventId, arr);
      }

      const publishedRoundByEvent = new Map<number, (typeof allRounds)[0]>();
      for (const [eventId, eventRounds] of roundsByEvent) {
        for (const round of eventRounds) {
          if (publishedRoundIds.has(round.id)) {
            publishedRoundByEvent.set(eventId, round);
          }
        }
      }

      const publishedFinalRoundIds = [...publishedRoundByEvent.values()].map((r) => r.id);
      if (publishedFinalRoundIds.length === 0) return [];

      // Batch: fetch all final results for published rounds
      const allResults = await db.query.finalResults.findMany({
        where: inArray(finalResults.roundId, publishedFinalRoundIds),
        orderBy: asc(finalResults.placement),
      });

      // Batch: fetch all entries referenced by results
      const allEntryIds = [...new Set(allResults.map((r) => r.entryId))];
      const allEntriesData =
        allEntryIds.length > 0
          ? await db.query.entries.findMany({ where: inArray(entries.id, allEntryIds) })
          : [];
      const entryMap = new Map(allEntriesData.map((e) => [e.id, e]));

      // Batch: fetch all registrations and users
      const allRegIds = [
        ...new Set(
          allEntriesData.flatMap((e) => [e.leaderRegistrationId, e.followerRegistrationId]),
        ),
      ];
      const allRegsData =
        allRegIds.length > 0
          ? await db.query.competitionRegistrations.findMany({
              where: inArray(competitionRegistrations.id, allRegIds),
            })
          : [];
      const regMap = new Map(allRegsData.map((r) => [r.id, r]));

      const allUserIds = [...new Set(allRegsData.map((r) => r.userId))];
      const allUsersData =
        allUserIds.length > 0
          ? await db.query.users.findMany({ where: inArray(users.id, allUserIds) })
          : [];
      const userMap = new Map(allUsersData.map((u) => [u.id, u]));

      // Group results by round
      const resultsByRound = new Map<number, typeof allResults>();
      for (const r of allResults) {
        const arr = resultsByRound.get(r.roundId) ?? [];
        arr.push(r);
        resultsByRound.set(r.roundId, arr);
      }

      // Assemble event results
      const eventResults = [];
      for (const event of events) {
        const publishedRound = publishedRoundByEvent.get(event.id);
        if (!publishedRound) continue;

        const results = resultsByRound.get(publishedRound.id) ?? [];

        const orgResults = [];
        for (const r of results) {
          if (r.danceName !== null) continue; // Only overall placements

          const entry = entryMap.get(r.entryId);
          if (!entry) continue;

          const isOrgEntry =
            regIdSet.has(entry.leaderRegistrationId) ||
            regIdSet.has(entry.followerRegistrationId);
          if (!isOrgEntry) continue;

          const leaderReg = regMap.get(entry.leaderRegistrationId);
          const followerReg = regMap.get(entry.followerRegistrationId);
          const leader = leaderReg ? userMap.get(leaderReg.userId) : null;
          const follower = followerReg ? userMap.get(followerReg.userId) : null;

          orgResults.push({
            placement: r.placement,
            coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber ?? null,
            leaderName: leader?.displayName ?? null,
            followerName: follower?.displayName ?? null,
          });
        }

        if (orgResults.length > 0) {
          eventResults.push({
            eventId: event.id,
            eventName: event.name,
            results: orgResults,
          });
        }
      }

      return eventResults;
    }),

  // ── Submit add/drop on behalf of org member ─────────────────────
  submitAddDrop: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        orgId: z.number(),
        type: z.enum(["add", "drop"]),
        eventId: z.number(),
        leaderRegistrationId: z.number(),
        followerRegistrationId: z.number(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrgAdmin(input.orgId, ctx.userId);

      // Verify at least one partner is from this org
      const leaderReg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.leaderRegistrationId),
      });
      const followerReg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.followerRegistrationId),
      });

      const isOrgMember =
        leaderReg?.orgId === input.orgId || followerReg?.orgId === input.orgId;
      if (!isOrgMember) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one partner must be a member of this organization",
        });
      }

      const [request] = await db
        .insert(addDropRequests)
        .values({
          competitionId: input.competitionId,
          submittedBy: ctx.userId,
          type: input.type,
          eventId: input.eventId,
          leaderRegistrationId: input.leaderRegistrationId,
          followerRegistrationId: input.followerRegistrationId,
          reason: input.reason ?? null,
        })
        .returning();

      return request;
    }),
});
