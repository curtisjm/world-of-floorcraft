import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser, getCurrentUserOrNull } from "../lib/auth";
import { forbidden } from "../lib/errors";
import { isPostAccessible } from "../lib/postAccess";
import { createNotification } from "./notifications";

/**
 * Comments and one-deep replies on social posts. Ports the Drizzle/tRPC
 * `comment` router. The thread depth is intentionally limited to two levels —
 * a top-level comment and direct replies — matching the original semantics.
 */

const BODY_MAX = 2000;

interface CommentCard {
  id: Id<"comments">;
  postId: Id<"posts">;
  authorId: Id<"users">;
  parentId: Id<"comments"> | null;
  body: string;
  createdAt: number;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
}

function projectComment(
  comment: Doc<"comments">,
  author: Doc<"users"> | null,
): CommentCard {
  return {
    id: comment._id,
    postId: comment.postId,
    authorId: comment.authorId,
    parentId: comment.parentId ?? null,
    body: comment.body,
    createdAt: comment.createdAt,
    authorUsername: author?.username ?? null,
    authorDisplayName: author?.displayName ?? null,
    authorAvatarUrl: author?.avatarUrl ?? null,
  };
}

/** Top-level comments on a post, with reply counts. Empty if not visible. */
export const listByPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return [];
    const viewer = await getCurrentUserOrNull(ctx);
    if (!(await isPostAccessible(ctx, post, viewer?._id ?? null))) return [];

    const all = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const topLevel = all
      .filter((c) => c.parentId === undefined)
      .sort((a, b) => a.createdAt - b.createdAt);

    const replyCounts = new Map<Id<"comments">, number>();
    for (const c of all) {
      if (c.parentId) {
        replyCounts.set(c.parentId, (replyCounts.get(c.parentId) ?? 0) + 1);
      }
    }

    const enriched = await Promise.all(
      topLevel.map(async (c) => ({
        ...projectComment(c, await ctx.db.get(c.authorId)),
        replyCount: replyCounts.get(c._id) ?? 0,
      })),
    );
    return enriched;
  },
});

/** Replies to a top-level comment. Empty if the parent post isn't visible. */
export const replies = query({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.commentId);
    if (!parent) return [];
    const post = await ctx.db.get(parent.postId);
    if (!post) return [];
    const viewer = await getCurrentUserOrNull(ctx);
    if (!(await isPostAccessible(ctx, post, viewer?._id ?? null))) return [];

    const all = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", args.commentId))
      .collect();

    return await Promise.all(
      all
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (c) => projectComment(c, await ctx.db.get(c.authorId))),
    );
  },
});

/**
 * Create a top-level comment or a reply. Replies to replies are rejected with
 * an `{ error: "cannot_reply_to_reply" }` sentinel to mirror the tRPC contract.
 */
export const create = mutation({
  args: {
    postId: v.id("posts"),
    parentId: v.optional(v.union(v.id("comments"), v.null())),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const body = args.body;
    if (body.length === 0 || body.length > BODY_MAX) {
      forbidden("Body must be 1-2000 characters");
    }
    const post = await ctx.db.get(args.postId);
    if (!post || !(await isPostAccessible(ctx, post, user._id))) {
      forbidden("Post not found or not accessible");
    }

    const parentId = args.parentId ?? undefined;
    if (parentId) {
      const parent = await ctx.db.get(parentId);
      if (parent?.parentId) {
        return { error: "cannot_reply_to_reply" as const };
      }
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("comments", {
      postId: args.postId,
      authorId: user._id,
      parentId,
      body,
      createdAt: now,
      updatedAt: now,
    });

    if (!parentId) {
      if (post.authorId) {
        await createNotification(ctx, {
          userId: post.authorId,
          type: "comment",
          actorId: user._id,
          postId: args.postId,
          commentId,
        });
      }
    } else {
      const parent = await ctx.db.get(parentId);
      if (parent?.authorId) {
        await createNotification(ctx, {
          userId: parent.authorId,
          type: "reply",
          actorId: user._id,
          postId: args.postId,
          commentId,
        });
      }
    }

    const comment = await ctx.db.get(commentId);
    return { comment };
  },
});

/** Delete the current user's own comment. */
export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.authorId !== user._id) {
      return { success: true };
    }
    const likes = await ctx.db
      .query("likes")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();
    for (const l of likes) await ctx.db.delete(l._id);
    await ctx.db.delete(args.commentId);
    return { success: true };
  },
});
