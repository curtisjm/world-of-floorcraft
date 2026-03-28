import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { likes, posts, comments } from "@social/schema";
import { createNotification } from "@social/lib/notify";

export const likeRouter = router({
  togglePost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.userId, ctx.userId),
            eq(likes.postId, input.postId)
          )
        );

      if (existing) {
        await db.delete(likes).where(eq(likes.id, existing.id));
        return { liked: false };
      }

      await db.insert(likes).values({
        userId: ctx.userId,
        postId: input.postId,
      });

      const post = await db.query.posts.findFirst({
        where: eq(posts.id, input.postId),
        columns: { authorId: true },
      });
      if (post?.authorId) {
        await createNotification({
          userId: post.authorId,
          type: "like",
          actorId: ctx.userId,
          postId: input.postId,
        });
      }

      return { liked: true };
    }),

  toggleComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.userId, ctx.userId),
            eq(likes.commentId, input.commentId)
          )
        );

      if (existing) {
        await db.delete(likes).where(eq(likes.id, existing.id));
        return { liked: false };
      }

      await db.insert(likes).values({
        userId: ctx.userId,
        commentId: input.commentId,
      });

      const comment = await db.query.comments.findFirst({
        where: eq(comments.id, input.commentId),
        columns: { authorId: true },
      });
      if (comment?.authorId) {
        await createNotification({
          userId: comment.authorId,
          type: "like",
          actorId: ctx.userId,
          commentId: input.commentId,
        });
      }

      return { liked: true };
    }),

  postStatus: publicProcedure
    .input(z.object({ postId: z.number(), userId: z.string().nullable() }))
    .query(async ({ input }) => {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(likes)
        .where(eq(likes.postId, input.postId));

      let liked = false;
      if (input.userId) {
        const [userLike] = await db
          .select({ id: likes.id })
          .from(likes)
          .where(
            and(
              eq(likes.userId, input.userId),
              eq(likes.postId, input.postId)
            )
          );
        liked = !!userLike;
      }

      return { count: countResult?.count ?? 0, liked };
    }),
});
