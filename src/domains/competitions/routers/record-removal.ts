import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionRegistrations,
  entries,
  recordRemovalRequests,
} from "@competitions/schema";
import { users } from "@shared/schema";

export const recordRemovalRouter = router({
  // ── Current user's requests ─────────────────────────────────────
  getMyRequests: protectedProcedure
    .query(async ({ ctx }) => {
      const requests = await db.query.recordRemovalRequests.findMany({
        where: eq(recordRemovalRequests.userId, ctx.userId),
      });

      const enriched = await Promise.all(
        requests.map(async (r) => {
          const comp = await db.query.competitions.findFirst({
            where: eq(competitions.id, r.competitionId),
          });
          return {
            ...r,
            competitionName: comp?.name ?? null,
            competitionSlug: comp?.slug ?? null,
          };
        }),
      );

      return enriched;
    }),

  // ── List pending requests (platform admin) ──────────────────────
  // Note: For now, any authenticated user can access this. A proper platform
  // admin check should be added when role-based access is implemented.
  listPending: protectedProcedure
    .query(async () => {
      const requests = await db.query.recordRemovalRequests.findMany({
        where: eq(recordRemovalRequests.status, "pending"),
      });

      const enriched = await Promise.all(
        requests.map(async (r) => {
          const user = await db.query.users.findFirst({
            where: eq(users.id, r.userId),
          });
          const comp = await db.query.competitions.findFirst({
            where: eq(competitions.id, r.competitionId),
          });
          return {
            ...r,
            userName: user?.displayName ?? null,
            competitionName: comp?.name ?? null,
            competitionSlug: comp?.slug ?? null,
          };
        }),
      );

      return enriched;
    }),

  // ── Get request detail ──────────────────────────────────────────
  getRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .query(async ({ input }) => {
      const request = await db.query.recordRemovalRequests.findFirst({
        where: eq(recordRemovalRequests.id, input.requestId),
      });
      if (!request) return null;

      const user = await db.query.users.findFirst({
        where: eq(users.id, request.userId),
      });
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, request.competitionId),
      });

      // Get user's entries in this competition
      const reg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.competitionId, request.competitionId),
          eq(competitionRegistrations.userId, request.userId),
        ),
      });

      let userEntries: { entryId: number; eventName: string }[] = [];
      if (reg) {
        const allEntries = await db.query.entries.findMany({
          where: eq(entries.leaderRegistrationId, reg.id),
        });
        const followerEntries = await db.query.entries.findMany({
          where: eq(entries.followerRegistrationId, reg.id),
        });

        const entryList = [...allEntries, ...followerEntries];
        const { competitionEvents } = await import("@competitions/schema");

        userEntries = await Promise.all(
          entryList.map(async (e) => {
            const event = await db.query.competitionEvents.findFirst({
              where: eq(competitionEvents.id, e.eventId),
            });
            return { entryId: e.id, eventName: event?.name ?? "Unknown" };
          }),
        );
      }

      return {
        ...request,
        userName: user?.displayName ?? null,
        competitionName: comp?.name ?? null,
        entries: userEntries,
      };
    }),

  // ── Submit removal request ──────────────────────────────────────
  submit: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        entryId: z.number().optional(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
      if (comp.status !== "finished") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Competition must be finished" });
      }

      // Verify user has entries in this competition
      const reg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.userId, ctx.userId),
        ),
      });
      if (!reg) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You have no entries in this competition" });
      }

      // Check no pending request exists
      const existing = await db.query.recordRemovalRequests.findFirst({
        where: and(
          eq(recordRemovalRequests.userId, ctx.userId),
          eq(recordRemovalRequests.competitionId, input.competitionId),
          eq(recordRemovalRequests.status, "pending"),
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You already have a pending removal request" });
      }

      const [request] = await db
        .insert(recordRemovalRequests)
        .values({
          userId: ctx.userId,
          competitionId: input.competitionId,
          entryId: input.entryId ?? null,
          reason: input.reason,
        })
        .returning();

      return request;
    }),

  // ── Approve request ─────────────────────────────────────────────
  approve: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        reviewNotes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.recordRemovalRequests.findFirst({
        where: eq(recordRemovalRequests.id, input.requestId),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });
      }

      const [updated] = await db
        .update(recordRemovalRequests)
        .set({
          status: "approved",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
        })
        .where(eq(recordRemovalRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  // ── Reject request ──────────────────────────────────────────────
  reject: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        reviewNotes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.recordRemovalRequests.findFirst({
        where: eq(recordRemovalRequests.id, input.requestId),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });
      }

      const [updated] = await db
        .update(recordRemovalRequests)
        .set({
          status: "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
        })
        .where(eq(recordRemovalRequests.id, input.requestId))
        .returning();

      return updated;
    }),
});
