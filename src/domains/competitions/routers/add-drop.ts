import { z } from "zod";
import { eq, and, count, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  competitionRegistrations,
  entries,
  addDropRequests,
} from "@competitions/schema";
import { memberships } from "@orgs/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

/**
 * Compute whether an add/drop request would affect round structure.
 * An "add" affects rounds if adding the couple would push entry count past maxFinalSize.
 * A "drop" affects rounds if removing the couple would make a preliminary round unnecessary.
 */
async function computeAffectsRounds(
  eventId: number,
  type: "add" | "drop",
  compMaxFinalSize: number | null,
): Promise<boolean> {
  const event = await db.query.competitionEvents.findFirst({
    where: eq(competitionEvents.id, eventId),
  });
  if (!event) return false;

  const maxFinal = event.maxFinalSize ?? compMaxFinalSize ?? 8;

  const [{ entryCount }] = await db
    .select({ entryCount: count(entries.id) })
    .from(entries)
    .where(and(eq(entries.eventId, eventId), eq(entries.scratched, false)));

  if (type === "add") {
    // Adding would push past final size (needs a prelim round that doesn't exist yet)
    return entryCount === maxFinal;
  } else {
    // Dropping would bring count to exactly maxFinalSize (could eliminate a prelim round)
    return entryCount === maxFinal + 1;
  }
}

export const addDropRouter = router({
  listByCompetition: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const requests = await db.query.addDropRequests.findMany({
        where: eq(addDropRequests.competitionId, input.competitionId),
        orderBy: addDropRequests.createdAt,
      });

      const safe = requests.filter((r) => r.status === "pending" && !r.affectsRounds);
      const needsReview = requests.filter((r) => r.status === "pending" && r.affectsRounds);
      const resolved = requests.filter((r) => r.status !== "pending");

      return { safe, needsReview, resolved };
    }),

  listByRegistration: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      // Must be the registrant or staff
      if (reg.userId !== ctx.userId) {
        await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);
      }

      return db.query.addDropRequests.findMany({
        where: and(
          eq(addDropRequests.competitionId, reg.competitionId),
          eq(addDropRequests.leaderRegistrationId, input.registrationId),
        ),
        orderBy: addDropRequests.createdAt,
      });
    }),

  submit: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        type: z.enum(["add", "drop"]),
        eventId: z.number(),
        leaderRegistrationId: z.number(),
        followerRegistrationId: z.number(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      if (comp.status !== "entries_closed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add/drop requests can only be submitted when entries are closed",
        });
      }

      // Verify submitter is a partner in the couple or an org admin for the couple's org
      const leaderReg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.leaderRegistrationId),
      });
      const followerReg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.followerRegistrationId),
      });
      if (!leaderReg || !followerReg) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }

      const isPartner = ctx.userId === leaderReg.userId || ctx.userId === followerReg.userId;
      let isOrgAdmin = false;
      if (!isPartner && leaderReg.orgId) {
        const mem = await db.query.memberships.findFirst({
          where: and(
            eq(memberships.orgId, leaderReg.orgId),
            eq(memberships.userId, ctx.userId),
          ),
        });
        isOrgAdmin = mem?.role === "admin";
      }

      if (!isPartner && !isOrgAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be a partner or org admin to submit add/drop requests",
        });
      }

      // Validate: for drop, entry must exist; for add, entry must not exist
      const existingEntry = await db.query.entries.findFirst({
        where: and(
          eq(entries.eventId, input.eventId),
          eq(entries.leaderRegistrationId, input.leaderRegistrationId),
          eq(entries.followerRegistrationId, input.followerRegistrationId),
        ),
      });

      if (input.type === "add" && existingEntry) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Entry already exists for this event" });
      }
      if (input.type === "drop" && !existingEntry) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No entry exists for this event" });
      }

      const affectsRounds = await computeAffectsRounds(
        input.eventId,
        input.type,
        comp.maxFinalSize,
      );

      const [request] = await db
        .insert(addDropRequests)
        .values({
          competitionId: input.competitionId,
          submittedBy: ctx.userId,
          type: input.type,
          eventId: input.eventId,
          leaderRegistrationId: input.leaderRegistrationId,
          followerRegistrationId: input.followerRegistrationId,
          reason: input.reason,
          affectsRounds,
        })
        .returning();

      return request;
    }),

  approve: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.addDropRequests.findFirst({
        where: eq(addDropRequests.id, input.requestId),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      await requireCompStaffRole(request.competitionId, ctx.userId, ["registration"]);

      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request already resolved" });
      }

      // Execute the add or drop
      if (request.type === "add") {
        await db.insert(entries).values({
          eventId: request.eventId,
          leaderRegistrationId: request.leaderRegistrationId,
          followerRegistrationId: request.followerRegistrationId,
          createdBy: ctx.userId,
        });
      } else {
        await db
          .delete(entries)
          .where(
            and(
              eq(entries.eventId, request.eventId),
              eq(entries.leaderRegistrationId, request.leaderRegistrationId),
              eq(entries.followerRegistrationId, request.followerRegistrationId),
            ),
          );
      }

      const [updated] = await db
        .update(addDropRequests)
        .set({
          status: "approved",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(addDropRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ requestId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.addDropRequests.findFirst({
        where: eq(addDropRequests.id, input.requestId),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      await requireCompStaffRole(request.competitionId, ctx.userId, ["registration"]);

      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request already resolved" });
      }

      const [updated] = await db
        .update(addDropRequests)
        .set({
          status: "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(addDropRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  approveAllSafe: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const pending = await db.query.addDropRequests.findMany({
        where: and(
          eq(addDropRequests.competitionId, input.competitionId),
          eq(addDropRequests.status, "pending"),
        ),
      });

      const safe = pending.filter((r) => !r.affectsRounds);
      let approved = 0;

      for (const request of safe) {
        if (request.type === "add") {
          await db.insert(entries).values({
            eventId: request.eventId,
            leaderRegistrationId: request.leaderRegistrationId,
            followerRegistrationId: request.followerRegistrationId,
            createdBy: ctx.userId,
          });
        } else {
          await db
            .delete(entries)
            .where(
              and(
                eq(entries.eventId, request.eventId),
                eq(entries.leaderRegistrationId, request.leaderRegistrationId),
                eq(entries.followerRegistrationId, request.followerRegistrationId),
              ),
            );
        }

        await db
          .update(addDropRequests)
          .set({
            status: "approved",
            reviewedBy: ctx.userId,
            reviewedAt: new Date(),
          })
          .where(eq(addDropRequests.id, request.id));

        approved++;
      }

      return { approved };
    }),
});
