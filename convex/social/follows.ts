import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { createNotification } from "./notifications";

/**
 * Follow graph for the social domain. Ported from the Drizzle/tRPC `follow`
 * router. A follow of a private user starts `pending` until the target
 * approves; a follow of a public user is immediately `active`.
 */

/** The current user's follow relationship toward `targetUserId`. */
export const status = query({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", user._id).eq("followingId", args.targetUserId),
      )
      .unique();
    return { status: follow?.status ?? null };
  },
});

/** Follow a user. Pending if the target is private, active otherwise. */
export const follow = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user._id === args.targetUserId) {
      badRequest("Cannot follow yourself");
    }

    const target = await ctx.db.get(args.targetUserId);
    if (!target) {
      notFound("User not found");
    }

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", user._id).eq("followingId", args.targetUserId),
      )
      .unique();
    if (existing) {
      // Already following (or already requested) — no duplicate, no notice.
      return { status: existing.status };
    }

    const status = target.isPrivate ? "pending" : "active";
    await ctx.db.insert("follows", {
      followerId: user._id,
      followingId: args.targetUserId,
      status,
      createdAt: Date.now(),
    });

    await createNotification(ctx, {
      userId: args.targetUserId,
      type: status === "active" ? "follow" : "follow_request",
      actorId: user._id,
    });

    return { status };
  },
});

/** Remove the current user's follow of `targetUserId`. Idempotent. */
export const unfollow = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", user._id).eq("followingId", args.targetUserId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { success: true };
  },
});

/** Approve a pending follow request from `requesterId`. */
export const approve = mutation({
  args: { requesterId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", args.requesterId).eq("followingId", user._id),
      )
      .unique();
    if (!request || request.status !== "pending") {
      notFound("No pending follow request found");
    }

    await ctx.db.patch(request._id, { status: "active" });

    await createNotification(ctx, {
      userId: args.requesterId,
      type: "follow_accepted",
      actorId: user._id,
    });

    return { success: true };
  },
});

/** Decline a pending follow request from `requesterId`. */
export const reject = mutation({
  args: { requesterId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", args.requesterId).eq("followingId", user._id),
      )
      .unique();
    if (request && request.status === "pending") {
      await ctx.db.delete(request._id);
    }
    return { success: true };
  },
});
