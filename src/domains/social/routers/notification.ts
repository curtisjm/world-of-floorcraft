import { z } from "zod";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { protectedProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { notifications, users } from "@shared/schema";

export const notificationRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(notifications.userId, ctx.userId)];
      if (input.cursor) {
        conditions.push(lt(notifications.id, input.cursor));
      }

      const results = await db
        .select({
          notification: notifications,
          actor: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(notifications)
        .leftJoin(users, eq(notifications.actorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      if (hasMore) results.pop();

      return {
        notifications: results,
        nextCursor: hasMore ? results[results.length - 1].notification.id : undefined,
      };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.read, false)
        )
      );
    return result.count;
  }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.userId, ctx.userId)
          )
        );
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.read, false)
        )
      );
    return { success: true };
  }),
});
