import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";

/**
 * Public profile reads for the social domain. Ported from the Drizzle/tRPC
 * `profile` router (the `me`/`updateProfile`/`needsOnboarding` mutations live
 * in `convex/users.ts`; this module holds the public-facing lookups).
 *
 * Lookups by username return `null`/`[]` for an unknown user rather than
 * throwing — these queries drive whole pages, and a thrown error would crash
 * the route instead of letting it render a not-found state.
 */

const SEARCH_LIMIT = 20;

/** Compact projection of a user for follow lists and search results. */
function publicCard(user: Doc<"users">) {
  return {
    _id: user._id,
    username: user.username ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/** Resolve a user by username, or `null` when none matches. */
async function userByUsername(
  ctx: QueryCtx,
  username: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();
}

/** Count the active follows on one side of a relationship. */
function activeFollowCount(follows: Doc<"follows">[]): number {
  return follows.filter((f) => f.status === "active").length;
}

/**
 * Full public profile for a username, with active follower/following counts.
 * Returns `null` when the username is unknown.
 */
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await userByUsername(ctx, args.username);
    if (!user) return null;

    const followers = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", user._id))
      .collect();
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", user._id))
      .collect();

    return {
      _id: user._id,
      username: user.username ?? null,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      competitionLevel: user.competitionLevel ?? null,
      competitionLevelHigh: user.competitionLevelHigh ?? null,
      isPrivate: user.isPrivate,
      createdAt: user.createdAt,
      followerCount: activeFollowCount(followers),
      followingCount: activeFollowCount(following),
    };
  },
});

/**
 * Search users by username or display name, excluding the caller. There is no
 * Convex search index on `users` (the schema is owned by the foundation
 * task), so this scans and substring-matches in memory — the behavior of the
 * previous SQL `ILIKE` query.
 */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    const needle = args.query.trim().toLowerCase();
    if (needle.length === 0) return [];

    const users = await ctx.db.query("users").collect();
    const matches = users.filter((u) => {
      if (u._id === currentUser._id) return false;
      const username = u.username?.toLowerCase() ?? "";
      const displayName = u.displayName?.toLowerCase() ?? "";
      return username.includes(needle) || displayName.includes(needle);
    });
    return matches.slice(0, SEARCH_LIMIT).map(publicCard);
  },
});

/** Active followers of the user with the given username. */
export const followers = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await userByUsername(ctx, args.username);
    if (!user) return [];
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", user._id))
      .collect();
    const followerUsers = await Promise.all(
      follows
        .filter((f) => f.status === "active")
        .map((f) => ctx.db.get(f.followerId)),
    );
    return followerUsers
      .filter((u): u is Doc<"users"> => u !== null)
      .map(publicCard);
  },
});

/** Users actively followed by the user with the given username. */
export const following = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await userByUsername(ctx, args.username);
    if (!user) return [];
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", user._id))
      .collect();
    const followingUsers = await Promise.all(
      follows
        .filter((f) => f.status === "active")
        .map((f) => ctx.db.get(f.followingId)),
    );
    return followingUsers
      .filter((u): u is Doc<"users"> => u !== null)
      .map(publicCard);
  },
});
