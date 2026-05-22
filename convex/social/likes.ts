import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser, getCurrentUserOrNull } from "../lib/auth";
import { notFound } from "../lib/errors";
import { isPostAccessible } from "../lib/postAccess";
import { createNotification } from "./notifications";

/**
 * Post and comment likes. Ports the Drizzle/tRPC `like` router. Toggles
 * insert-on-miss / delete-on-hit so the client can call the same mutation to
 * like or unlike. Notifications are aggregated within an hour by
 * `createNotification`.
 */

/** Toggle a post like. Visibility check matches the original router. */
export const togglePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || !(await isPostAccessible(ctx, post, user._id))) {
      notFound("Post not found");
    }

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", user._id).eq("postId", args.postId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    }

    await ctx.db.insert("likes", {
      userId: user._id,
      postId: args.postId,
      createdAt: Date.now(),
    });
    if (post.authorId) {
      await createNotification(ctx, {
        userId: post.authorId,
        type: "like",
        actorId: user._id,
        postId: args.postId,
      });
    }
    return { liked: true };
  },
});

/** Toggle a comment like. The parent post must also be accessible. */
export const toggleComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) notFound("Comment not found");

    const post = await ctx.db.get(comment.postId);
    if (!post || !(await isPostAccessible(ctx, post, user._id))) {
      notFound("Comment not found");
    }

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", user._id).eq("commentId", args.commentId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    }

    await ctx.db.insert("likes", {
      userId: user._id,
      commentId: args.commentId,
      createdAt: Date.now(),
    });
    await createNotification(ctx, {
      userId: comment.authorId,
      type: "like",
      actorId: user._id,
      commentId: args.commentId,
    });
    return { liked: true };
  },
});

/** Total likes on a post and whether the caller has liked it. */
export const postStatus = query({
  args: {
    postId: v.id("posts"),
    userId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    const viewer = await getCurrentUserOrNull(ctx);
    if (
      !post ||
      !(await isPostAccessible(ctx, post, viewer?._id ?? null))
    ) {
      return { count: 0, liked: false };
    }

    const all = await ctx.db
      .query("likes")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const targetUserId = args.userId ?? viewer?._id ?? null;
    const liked =
      !!targetUserId &&
      all.some((l) => l.userId === targetUserId);
    return { count: all.length, liked };
  },
});

/** Total likes on a comment and whether the caller has liked it. */
export const commentStatus = query({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) return { count: 0, liked: false };
    const post = await ctx.db.get(comment.postId);
    const viewer = await getCurrentUserOrNull(ctx);
    if (!post || !(await isPostAccessible(ctx, post, viewer?._id ?? null))) {
      return { count: 0, liked: false };
    }
    const all = await ctx.db
      .query("likes")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();
    const liked =
      !!viewer && all.some((l) => l.userId === viewer._id);
    return { count: all.length, liked };
  },
});
