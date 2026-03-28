import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { organizations, memberships, joinRequests } from "@orgs/schema";

async function requireAdminOrOwner(orgId: number, userId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
  }

  const isOwner = org.ownerId === userId;

  if (!isOwner) {
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
    });

    if (!membership || membership.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner required" });
    }
  }

  return org;
}

export const joinRequestRouter = router({
  request: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      if (org.membershipModel !== "request") {
        throw new TRPCError({ code: "FORBIDDEN", message: "This organization does not accept join requests" });
      }

      const existingMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      if (existingMembership) {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }

      const pendingRequest = await db.query.joinRequests.findFirst({
        where: and(
          eq(joinRequests.orgId, input.orgId),
          eq(joinRequests.userId, ctx.userId),
          eq(joinRequests.status, "pending")
        ),
      });

      if (pendingRequest) {
        throw new TRPCError({ code: "CONFLICT", message: "A pending join request already exists" });
      }

      const [joinRequest] = await db
        .insert(joinRequests)
        .values({
          orgId: input.orgId,
          userId: ctx.userId,
        })
        .returning();

      return joinRequest;
    }),

  approve: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const joinRequest = await db.query.joinRequests.findFirst({
        where: eq(joinRequests.id, input.requestId),
      });

      if (!joinRequest) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
      }

      await requireAdminOrOwner(joinRequest.orgId, ctx.userId);

      if (joinRequest.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });
      }

      await db
        .insert(memberships)
        .values({
          orgId: joinRequest.orgId,
          userId: joinRequest.userId,
          role: "member",
        })
        .onConflictDoNothing();

      const [updated] = await db
        .update(joinRequests)
        .set({
          status: "approved",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(joinRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const joinRequest = await db.query.joinRequests.findFirst({
        where: eq(joinRequests.id, input.requestId),
      });

      if (!joinRequest) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
      }

      await requireAdminOrOwner(joinRequest.orgId, ctx.userId);

      if (joinRequest.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });
      }

      const [updated] = await db
        .update(joinRequests)
        .set({
          status: "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(joinRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  listPending: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const results = await db
        .select({
          id: joinRequests.id,
          orgId: joinRequests.orgId,
          userId: joinRequests.userId,
          status: joinRequests.status,
          createdAt: joinRequests.createdAt,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(joinRequests)
        .innerJoin(users, eq(users.id, joinRequests.userId))
        .where(
          and(
            eq(joinRequests.orgId, input.orgId),
            eq(joinRequests.status, "pending")
          )
        );

      return results;
    }),

  getMyRequest: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const joinRequest = await db.query.joinRequests.findFirst({
        where: and(
          eq(joinRequests.orgId, input.orgId),
          eq(joinRequests.userId, ctx.userId),
          eq(joinRequests.status, "pending")
        ),
      });

      return joinRequest ?? null;
    }),
});
