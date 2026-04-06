import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
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

      const regIds = orgRegs.map((r) => r.id);

      // Find all entries with org members
      const allEvents = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const orgEvents = [];
      for (const event of allEvents) {
        const eventEntries = await db.query.entries.findMany({
          where: and(eq(entries.eventId, event.id), eq(entries.scratched, false)),
        });

        // Filter to entries involving org members
        const orgEntries = eventEntries.filter(
          (e) => regIds.includes(e.leaderRegistrationId) || regIds.includes(e.followerRegistrationId),
        );

        if (orgEntries.length === 0) continue;

        // Enrich with names and numbers
        const couples = await Promise.all(
          orgEntries.map(async (entry) => {
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
              entryId: entry.id,
              coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber ?? null,
              leaderName: leader?.displayName ?? null,
              followerName: follower?.displayName ?? null,
            };
          }),
        );

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

      const enriched = await Promise.all(
        orgRegs.map(async (reg) => {
          const user = await db.query.users.findFirst({
            where: eq(users.id, reg.userId),
          });

          // Get entries for this registration
          const leaderEntries = await db.query.entries.findMany({
            where: and(eq(entries.leaderRegistrationId, reg.id), eq(entries.scratched, false)),
          });
          const followerEntries = await db.query.entries.findMany({
            where: and(eq(entries.followerRegistrationId, reg.id), eq(entries.scratched, false)),
          });
          const allEntries = [...leaderEntries, ...followerEntries];

          const eventNames = await Promise.all(
            allEntries.map(async (e) => {
              const event = await db.query.competitionEvents.findFirst({
                where: eq(competitionEvents.id, e.eventId),
              });
              return event?.name ?? "Unknown";
            }),
          );

          // Get payment info
          const regPayments = await db.query.payments.findMany({
            where: eq(payments.registrationId, reg.id),
          });
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
            eventCount: allEntries.length,
            eventNames,
          };
        }),
      );

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

      const regIds = orgRegs.map((r) => r.id);
      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const eventResults = [];
      for (const event of events) {
        // Find published final round
        const eventRounds = await db.query.rounds.findMany({
          where: eq(rounds.eventId, event.id),
          orderBy: asc(rounds.position),
        });

        let publishedRound = null;
        for (const round of eventRounds) {
          const meta = await db.query.roundResultsMeta.findFirst({
            where: and(
              eq(roundResultsMeta.roundId, round.id),
              eq(roundResultsMeta.status, "published"),
            ),
          });
          if (meta) publishedRound = round;
        }
        if (!publishedRound) continue;

        // Get results for org members only
        const results = await db.query.finalResults.findMany({
          where: eq(finalResults.roundId, publishedRound.id),
          orderBy: asc(finalResults.placement),
        });

        const orgResults = [];
        for (const r of results) {
          if (r.danceName !== null) continue; // Only overall placements

          const entry = await db.query.entries.findFirst({
            where: eq(entries.id, r.entryId),
          });
          if (!entry) continue;

          // Check if either partner is in org
          const isOrgEntry =
            regIds.includes(entry.leaderRegistrationId) ||
            regIds.includes(entry.followerRegistrationId);
          if (!isOrgEntry) continue;

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
