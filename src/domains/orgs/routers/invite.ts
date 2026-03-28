import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships, orgInvites } from "@orgs/schema";
import { createNotification } from "@social/lib/notify";

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

function sevenDaysFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

export const inviteRouter = router({
  sendInvite: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const existingMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, input.userId)
        ),
      });

      if (existingMembership) {
        throw new TRPCError({ code: "CONFLICT", message: "User is already a member" });
      }

      const pendingInvite = await db.query.orgInvites.findFirst({
        where: and(
          eq(orgInvites.orgId, input.orgId),
          eq(orgInvites.invitedUserId, input.userId),
          eq(orgInvites.status, "pending")
        ),
      });

      if (pendingInvite) {
        throw new TRPCError({ code: "CONFLICT", message: "A pending invite already exists for this user" });
      }

      const [invite] = await db
        .insert(orgInvites)
        .values({
          orgId: input.orgId,
          invitedUserId: input.userId,
          invitedBy: ctx.userId,
          expiresAt: sevenDaysFromNow(),
        })
        .returning();

      await createNotification({
        userId: input.userId,
        type: "org_invite",
        actorId: ctx.userId,
        orgId: input.orgId,
      });

      return invite;
    }),

  generateLink: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const token = nanoid(24);

      const [invite] = await db
        .insert(orgInvites)
        .values({
          orgId: input.orgId,
          invitedBy: ctx.userId,
          token,
          expiresAt: sevenDaysFromNow(),
        })
        .returning();

      return invite;
    }),

  accept: protectedProcedure
    .input(
      z
        .object({
          inviteId: z.number().optional(),
          token: z.string().optional(),
        })
        .refine((d) => d.inviteId !== undefined || d.token !== undefined, {
          message: "Either inviteId or token must be provided",
        })
    )
    .mutation(async ({ ctx, input }) => {
      let invite;

      if (input.inviteId !== undefined) {
        invite = await db.query.orgInvites.findFirst({
          where: and(
            eq(orgInvites.id, input.inviteId),
            eq(orgInvites.invitedUserId, ctx.userId),
            eq(orgInvites.status, "pending")
          ),
        });
      } else {
        invite = await db.query.orgInvites.findFirst({
          where: and(
            eq(orgInvites.token, input.token!),
            eq(orgInvites.status, "pending")
          ),
        });
      }

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or already used" });
      }

      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }

      await db
        .insert(memberships)
        .values({
          orgId: invite.orgId,
          userId: ctx.userId,
          role: "member",
        })
        .onConflictDoNothing();

      // For direct invites, mark as accepted; link invites stay pending
      if (invite.invitedUserId !== null) {
        await db
          .update(orgInvites)
          .set({ status: "accepted" })
          .where(eq(orgInvites.id, invite.id));
      }

      return { success: true };
    }),

  decline: protectedProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await db.query.orgInvites.findFirst({
        where: and(
          eq(orgInvites.id, input.inviteId),
          eq(orgInvites.invitedUserId, ctx.userId),
          eq(orgInvites.status, "pending")
        ),
      });

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      await db
        .update(orgInvites)
        .set({ status: "declined" })
        .where(eq(orgInvites.id, input.inviteId));

      return { success: true };
    }),

  listMyInvites: protectedProcedure.query(async ({ ctx }) => {
    const results = await db
      .select({
        id: orgInvites.id,
        orgId: orgInvites.orgId,
        invitedBy: orgInvites.invitedBy,
        status: orgInvites.status,
        createdAt: orgInvites.createdAt,
        expiresAt: orgInvites.expiresAt,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        orgAvatarUrl: organizations.avatarUrl,
      })
      .from(orgInvites)
      .innerJoin(organizations, eq(organizations.id, orgInvites.orgId))
      .where(
        and(
          eq(orgInvites.invitedUserId, ctx.userId),
          eq(orgInvites.status, "pending")
        )
      );

    return results;
  }),
});
