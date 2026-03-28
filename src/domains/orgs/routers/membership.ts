import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { organizations, memberships } from "@orgs/schema";
import { conversations, conversationMembers } from "@messaging/schema";

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

export const membershipRouter = router({
  join: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      if (org.membershipModel !== "open") {
        throw new TRPCError({ code: "FORBIDDEN", message: "This organization is not open to join directly" });
      }

      const existing = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }

      const [membership] = await db
        .insert(memberships)
        .values({
          orgId: input.orgId,
          userId: ctx.userId,
          role: "member",
        })
        .returning();

      // Add user to all org channels
      const orgChannels = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.orgId, input.orgId), eq(conversations.type, "org_channel")));
      if (orgChannels.length > 0) {
        await db.insert(conversationMembers).values(
          orgChannels.map((ch) => ({ conversationId: ch.id, userId: ctx.userId }))
        ).onConflictDoNothing();
      }

      return membership;
    }),

  leave: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      if (org.ownerId === ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner cannot leave. Transfer ownership first." });
      }

      await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, ctx.userId)
          )
        );

      return { success: true };
    }),

  kick: protectedProcedure
    .input(z.object({ orgId: z.number(), targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await requireAdminOrOwner(input.orgId, ctx.userId);

      if (org.ownerId === input.targetUserId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot kick the owner" });
      }

      await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, input.targetUserId)
          )
        );

      return { success: true };
    }),

  updateRole: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        targetUserId: z.string(),
        role: z.enum(["member", "admin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await requireAdminOrOwner(input.orgId, ctx.userId);

      if (org.ownerId === input.targetUserId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot change the owner's role" });
      }

      const [updated] = await db
        .update(memberships)
        .set({ role: input.role })
        .where(
          and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, input.targetUserId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Membership not found" });
      }

      return updated;
    }),

  transferOwnership: protectedProcedure
    .input(z.object({ orgId: z.number(), newOwnerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      if (org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can transfer ownership" });
      }

      const newOwnerMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, input.newOwnerId)
        ),
      });

      if (!newOwnerMembership || newOwnerMembership.role !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "New owner must be an admin member" });
      }

      const [updated] = await db
        .update(organizations)
        .set({ ownerId: input.newOwnerId, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId))
        .returning();

      return updated;
    }),

  getMyMembership: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      return {
        membership: membership ?? null,
        isOwner: org.ownerId === ctx.userId,
      };
    }),

  listMembers: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify caller is a member
      const callerMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      if (!callerMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Members only" });
      }

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const results = await db
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          joinedAt: memberships.createdAt,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.orgId, input.orgId));

      return results.map((r) => ({
        ...r,
        isOwner: r.userId === org.ownerId,
      }));
    }),
});
