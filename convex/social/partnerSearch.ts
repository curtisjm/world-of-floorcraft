import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { danceStyle, rolePreference } from "../schema";

/**
 * Partner search profiles — opt-in directory of users looking for a dance
 * partner. Ports the Drizzle/tRPC `partnerSearch` router.
 */

const HEIGHT_MAX = 30;
const LOCATION_MAX = 100;
const BIO_MAX = 500;
const DISCOVER_DEFAULT = 20;
const DISCOVER_MAX = 50;

async function findProfile(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"partnerSearchProfiles"> | null> {
  return await ctx.db
    .query("partnerSearchProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Current user's partner search profile, or null when they aren't searching. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return await findProfile(ctx, user._id);
  },
});

/** Read another user's partner search profile by id (public view). */
export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await findProfile(ctx, args.userId);
  },
});

/** Insert or update the current user's partner search profile. */
export const upsert = mutation({
  args: {
    danceStyles: v.array(danceStyle),
    height: v.optional(v.union(v.string(), v.null())),
    location: v.optional(v.union(v.string(), v.null())),
    bio: v.optional(v.union(v.string(), v.null())),
    rolePreference: rolePreference,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (args.danceStyles.length === 0) {
      badRequest("Select at least one dance style");
    }
    if (args.height && args.height.length > HEIGHT_MAX) {
      badRequest("Height is too long");
    }
    if (args.location && args.location.length > LOCATION_MAX) {
      badRequest("Location is too long");
    }
    if (args.bio && args.bio.length > BIO_MAX) {
      badRequest("Bio is too long");
    }

    const existing = await findProfile(ctx, user._id);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        danceStyles: args.danceStyles,
        height: args.height ?? undefined,
        location: args.location ?? undefined,
        bio: args.bio ?? undefined,
        rolePreference: args.rolePreference,
        updatedAt: now,
      });
      return (await ctx.db.get(existing._id))!;
    }
    const id = await ctx.db.insert("partnerSearchProfiles", {
      userId: user._id,
      danceStyles: args.danceStyles,
      height: args.height ?? undefined,
      location: args.location ?? undefined,
      bio: args.bio ?? undefined,
      rolePreference: args.rolePreference,
      createdAt: now,
      updatedAt: now,
    });
    return (await ctx.db.get(id))!;
  },
});

/** Remove the current user's partner search profile. Throws when missing. */
export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const existing = await findProfile(ctx, user._id);
    if (!existing) notFound("No partner search profile to remove");
    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

/**
 * Paginated discovery feed for users looking for a partner. Newest update
 * first, filtered by style / role / location substring when provided. The
 * caller is excluded so the directory is not self-listing.
 */
export const discover = query({
  args: {
    cursor: v.optional(
      v.union(
        v.null(),
        v.object({
          updatedAt: v.number(),
          userId: v.id("partnerSearchProfiles"),
        }),
      ),
    ),
    limit: v.optional(v.number()),
    style: v.optional(danceStyle),
    rolePreference: v.optional(rolePreference),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const limit = args.limit
      ? Math.min(Math.max(args.limit, 1), DISCOVER_MAX)
      : DISCOVER_DEFAULT;
    const cursor = args.cursor ?? null;

    const all = await ctx.db.query("partnerSearchProfiles").collect();
    const needleLocation = args.location?.trim().toLowerCase() ?? "";

    const filtered = all.filter((p) => {
      if (p.userId === user._id) return false;
      if (args.style && !p.danceStyles.includes(args.style)) return false;
      if (args.rolePreference && p.rolePreference !== args.rolePreference) {
        return false;
      }
      if (
        needleLocation &&
        !(p.location ?? "").toLowerCase().includes(needleLocation)
      ) {
        return false;
      }
      if (cursor) {
        if (p.updatedAt > cursor.updatedAt) return false;
        if (p.updatedAt === cursor.updatedAt && p._id >= cursor.userId) {
          return false;
        }
      }
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      const byUpdate = b.updatedAt - a.updatedAt;
      if (byUpdate !== 0) return byUpdate;
      return a._id < b._id ? 1 : a._id > b._id ? -1 : 0;
    });

    const hasMore = sorted.length > limit;
    const items = hasMore ? sorted.slice(0, limit) : sorted;

    const enriched = await Promise.all(
      items.map(async (p) => {
        const profileUser = await ctx.db.get(p.userId);
        return {
          userId: p.userId,
          danceStyles: p.danceStyles,
          height: p.height ?? null,
          location: p.location ?? null,
          bio: p.bio ?? null,
          rolePreference: p.rolePreference,
          updatedAt: p.updatedAt,
          username: profileUser?.username ?? null,
          displayName: profileUser?.displayName ?? null,
          avatarUrl: profileUser?.avatarUrl ?? null,
          competitionLevel: profileUser?.competitionLevel ?? null,
          competitionLevelHigh: profileUser?.competitionLevelHigh ?? null,
        };
      }),
    );

    const lastItem = items[items.length - 1];
    return {
      items: enriched,
      nextCursor:
        hasMore && lastItem
          ? { updatedAt: lastItem.updatedAt, userId: lastItem._id }
          : null,
    };
  },
});
