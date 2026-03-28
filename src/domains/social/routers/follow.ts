import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { follows } from "@social/schema";
import { createNotification } from "@social/lib/notify";

export const followRouter = router({
  follow: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId === input.targetUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot follow yourself" });
      }

      const [target] = await db
        .select({ isPrivate: users.isPrivate })
        .from(users)
        .where(eq(users.id, input.targetUserId));

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const status = target.isPrivate ? "pending" : "active";

      await db
        .insert(follows)
        .values({
          followerId: ctx.userId,
          followingId: input.targetUserId,
          status,
        })
        .onConflictDoNothing();

      await createNotification({
        userId: input.targetUserId,
        type: status === "active" ? "follow" : "follow_request",
        actorId: ctx.userId,
      });

      return { status };
    }),

  unfollow: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, ctx.userId),
            eq(follows.followingId, input.targetUserId)
          )
        );

      return { success: true };
    }),

  acceptRequest: protectedProcedure
    .input(z.object({ requesterId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, input.requesterId),
            eq(follows.followingId, ctx.userId),
            eq(follows.status, "pending")
          )
        );

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending follow request found" });
      }

      await db
        .update(follows)
        .set({ status: "active" })
        .where(
          and(
            eq(follows.followerId, input.requesterId),
            eq(follows.followingId, ctx.userId)
          )
        );

      await createNotification({
        userId: input.requesterId,
        type: "follow_accepted",
        actorId: ctx.userId,
      });

      return { success: true };
    }),

  declineRequest: protectedProcedure
    .input(z.object({ requesterId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, input.requesterId),
            eq(follows.followingId, ctx.userId),
            eq(follows.status, "pending")
          )
        );

      return { success: true };
    }),

  pendingRequests: protectedProcedure.query(async ({ ctx }) => {
    const requests = await db
      .select({
        id: follows.id,
        followerId: follows.followerId,
        createdAt: follows.createdAt,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followerId))
      .where(
        and(
          eq(follows.followingId, ctx.userId),
          eq(follows.status, "pending")
        )
      );

    return requests;
  }),

  status: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [follow] = await db
        .select({ status: follows.status })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, ctx.userId),
            eq(follows.followingId, input.targetUserId)
          )
        );

      return { status: follow?.status ?? null };
    }),
});
