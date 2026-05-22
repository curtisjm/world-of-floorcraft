import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { forbidden, notFound } from "../lib/errors";
import { competitionLevel, danceRole, danceStyle } from "../schema";

/**
 * "To be advised" partner listings. Users who don't have a partner can post
 * a listing; other users browse and pair up. Ported from
 * `src/domains/competitions/routers/tba.ts` for Task 9 of the Convex
 * migration.
 */

export const listByCompetition = query({
  args: {
    competitionId: v.id("competitions"),
    style: v.optional(danceStyle),
    level: v.optional(competitionLevel),
    role: v.optional(danceRole),
  },
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("tbaListings")
      .withIndex("by_competition_fulfilled", (q) =>
        q.eq("competitionId", args.competitionId).eq("fulfilled", false),
      )
      .collect();
    const filtered = listings.filter((l) => {
      if (args.style && l.style !== args.style) return false;
      if (args.level && l.level !== args.level) return false;
      if (args.role && l.role !== args.role) return false;
      return true;
    });
    return await Promise.all(
      filtered.map(async (l) => {
        const user = await ctx.db.get(l.userId);
        return {
          _id: l._id,
          style: l.style,
          level: l.level,
          role: l.role,
          notes: l.notes ?? null,
          createdAt: l.createdAt,
          displayName: user?.displayName ?? null,
          username: user?.username ?? null,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    competitionId: v.id("competitions"),
    style: danceStyle,
    level: competitionLevel,
    role: danceRole,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const id = await ctx.db.insert("tbaListings", {
      competitionId: args.competitionId,
      userId: user._id,
      style: args.style,
      level: args.level,
      role: args.role,
      notes: args.notes,
      fulfilled: false,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const markFulfilled = mutation({
  args: { listingId: v.id("tbaListings") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const listing = await ctx.db.get(args.listingId);
    if (!listing) notFound("Listing not found");
    if (listing.userId !== user._id) {
      forbidden("Can only update your own listing");
    }
    await ctx.db.patch(args.listingId, { fulfilled: true });
    return await ctx.db.get(args.listingId);
  },
});

export const remove = mutation({
  args: { listingId: v.id("tbaListings") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const listing = await ctx.db.get(args.listingId);
    if (!listing) notFound("Listing not found");
    if (listing.userId !== user._id) {
      forbidden("Can only delete your own listing");
    }
    await ctx.db.delete(args.listingId);
    return { success: true };
  },
});
