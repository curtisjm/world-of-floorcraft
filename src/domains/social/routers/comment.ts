import { z } from "zod";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { comments, posts } from "@social/schema";
import { createNotification } from "@social/lib/notify";

export const commentRouter = router({
  listByPost: publicProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ input }) => {
      const topLevel = await db
        .select({
          id: comments.id,
          postId: comments.postId,
          authorId: comments.authorId,
          body: comments.body,
          createdAt: comments.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(
          and(
            eq(comments.postId, input.postId),
            isNull(comments.parentId)
          )
        )
        .orderBy(asc(comments.createdAt));

      const commentIds = topLevel.map((c) => c.id);
      const replyCounts = commentIds.length > 0
        ? await db
            .select({
              parentId: comments.parentId,
              count: sql<number>`count(*)::int`,
            })
            .from(comments)
            .where(inArray(comments.parentId, commentIds))
            .groupBy(comments.parentId)
        : [];

      const replyCountMap = new Map(
        replyCounts.map((r) => [r.parentId, r.count])
      );

      return topLevel.map((c) => ({
        ...c,
        replyCount: replyCountMap.get(c.id) ?? 0,
      }));
    }),

  replies: publicProcedure
    .input(z.object({ commentId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: comments.id,
          postId: comments.postId,
          authorId: comments.authorId,
          parentId: comments.parentId,
          body: comments.body,
          createdAt: comments.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.parentId, input.commentId))
        .orderBy(asc(comments.createdAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        parentId: z.number().nullable().optional(),
        body: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.parentId) {
        const [parent] = await db
          .select({ parentId: comments.parentId })
          .from(comments)
          .where(eq(comments.id, input.parentId));
        if (parent?.parentId !== null) {
          return { error: "cannot_reply_to_reply" as const };
        }
      }

      const [comment] = await db
        .insert(comments)
        .values({
          postId: input.postId,
          authorId: ctx.userId,
          parentId: input.parentId ?? null,
          body: input.body,
        })
        .returning();

      if (!input.parentId) {
        // Top-level comment — notify post author
        const post = await db.query.posts.findFirst({
          where: eq(posts.id, input.postId),
          columns: { authorId: true },
        });
        if (post?.authorId) {
          await createNotification({
            userId: post.authorId,
            type: "comment",
            actorId: ctx.userId,
            postId: input.postId,
            commentId: comment.id,
          });
        }
      } else {
        // Reply — notify parent comment author
        const parentComment = await db.query.comments.findFirst({
          where: eq(comments.id, input.parentId),
          columns: { authorId: true },
        });
        if (parentComment?.authorId) {
          await createNotification({
            userId: parentComment.authorId,
            type: "reply",
            actorId: ctx.userId,
            postId: input.postId,
            commentId: comment.id,
          });
        }
      }

      return { comment };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(comments)
        .where(
          and(eq(comments.id, input.id), eq(comments.authorId, ctx.userId))
        );
      return { success: true };
    }),
});
