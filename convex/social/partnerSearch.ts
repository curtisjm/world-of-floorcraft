import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
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

function locationTokens(location: string | undefined): string[] {
  const normalized = (location ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  const sourceTokens = new Set([
    normalized,
    ...normalized.split(" ").filter((part) => part.length > 0),
  ]);
  const prefixes = new Set<string>();
  for (const token of sourceTokens) {
    for (let length = Math.min(2, token.length); length <= token.length; length += 1) {
      prefixes.add(token.slice(0, length));
    }
  }
  return [...prefixes];
}

async function rebuildDiscoveryRows(
  ctx: MutationCtx,
  profile: Doc<"partnerSearchProfiles">,
): Promise<void> {
  const existingStyles = await ctx.db
    .query("partnerSearchStyleProfiles")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();
  for (const row of existingStyles) await ctx.db.delete(row._id);

  const existingLocations = await ctx.db
    .query("partnerSearchLocationTokens")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();
  for (const row of existingLocations) await ctx.db.delete(row._id);

  for (const style of profile.danceStyles) {
    await ctx.db.insert("partnerSearchStyleProfiles", {
      profileId: profile._id,
      userId: profile.userId,
      style,
      rolePreference: profile.rolePreference,
      updatedAt: profile.updatedAt,
    });
  }

  for (const token of locationTokens(profile.location)) {
    await ctx.db.insert("partnerSearchLocationTokens", {
      profileId: profile._id,
      userId: profile.userId,
      token,
      rolePreference: profile.rolePreference,
      updatedAt: profile.updatedAt,
    });
  }
}

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
      const updated = (await ctx.db.get(existing._id))!;
      await rebuildDiscoveryRows(ctx, updated);
      return updated;
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
    const created = (await ctx.db.get(id))!;
    await rebuildDiscoveryRows(ctx, created);
    return created;
  },
});

/** Remove the current user's partner search profile. Throws when missing. */
export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const existing = await findProfile(ctx, user._id);
    if (!existing) notFound("No partner search profile to remove");
    const styleRows = await ctx.db
      .query("partnerSearchStyleProfiles")
      .withIndex("by_profile", (q) => q.eq("profileId", existing._id))
      .collect();
    for (const row of styleRows) await ctx.db.delete(row._id);
    const locationRows = await ctx.db
      .query("partnerSearchLocationTokens")
      .withIndex("by_profile", (q) => q.eq("profileId", existing._id))
      .collect();
    for (const row of locationRows) await ctx.db.delete(row._id);
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

    const needleLocation = args.location?.trim().toLowerCase() ?? "";
    const locationToken = locationTokens(args.location)[0];
    const indexedLimit = limit + 1;

    let candidates: Doc<"partnerSearchProfiles">[] = [];
    if (args.style) {
      const sameRows = cursor
        ? await ctx.db
            .query("partnerSearchStyleProfiles")
            .withIndex(
              args.rolePreference ? "by_style_role_updated" : "by_style_updated",
              (q) => {
                const scoped = q.eq("style", args.style!);
                const byRole = args.rolePreference
                  ? scoped.eq("rolePreference", args.rolePreference)
                  : scoped;
                return byRole.eq("updatedAt", cursor.updatedAt);
              },
            )
            .collect()
        : [];
      const olderRows = await ctx.db
        .query("partnerSearchStyleProfiles")
        .withIndex(
          args.rolePreference ? "by_style_role_updated" : "by_style_updated",
          (q) => {
            const scoped = q.eq("style", args.style!);
            const byRole = args.rolePreference
              ? scoped.eq("rolePreference", args.rolePreference)
              : scoped;
            return cursor ? byRole.lt("updatedAt", cursor.updatedAt) : byRole;
          },
        )
        .order("desc")
        .take(indexedLimit * 5);
      candidates = (
        await Promise.all(
          [...sameRows, ...olderRows].map((row) => ctx.db.get(row.profileId)),
        )
      ).filter((p): p is Doc<"partnerSearchProfiles"> => p !== null);
    } else if (locationToken) {
      const sameRows = cursor
        ? await ctx.db
            .query("partnerSearchLocationTokens")
            .withIndex(
              args.rolePreference ? "by_token_role_updated" : "by_token_updated",
              (q) => {
                const scoped = q.eq("token", locationToken);
                const byRole = args.rolePreference
                  ? scoped.eq("rolePreference", args.rolePreference)
                  : scoped;
                return byRole.eq("updatedAt", cursor.updatedAt);
              },
            )
            .collect()
        : [];
      const olderRows = await ctx.db
        .query("partnerSearchLocationTokens")
        .withIndex(
          args.rolePreference ? "by_token_role_updated" : "by_token_updated",
          (q) => {
            const scoped = q.eq("token", locationToken);
            const byRole = args.rolePreference
              ? scoped.eq("rolePreference", args.rolePreference)
              : scoped;
            return cursor ? byRole.lt("updatedAt", cursor.updatedAt) : byRole;
          },
        )
        .order("desc")
        .take(indexedLimit * 5);
      candidates = (
        await Promise.all(
          [...sameRows, ...olderRows].map((row) => ctx.db.get(row.profileId)),
        )
      ).filter((p): p is Doc<"partnerSearchProfiles"> => p !== null);
    } else if (args.rolePreference) {
      const sameProfiles = cursor
        ? await ctx.db
            .query("partnerSearchProfiles")
            .withIndex("by_role_updated", (q) =>
              q
                .eq("rolePreference", args.rolePreference!)
                .eq("updatedAt", cursor.updatedAt),
            )
            .collect()
        : [];
      const olderProfiles = await ctx.db
        .query("partnerSearchProfiles")
        .withIndex("by_role_updated", (q) => {
          const scoped = q.eq("rolePreference", args.rolePreference!);
          return cursor ? scoped.lt("updatedAt", cursor.updatedAt) : scoped;
        })
        .order("desc")
        .take(indexedLimit);
      candidates = [...sameProfiles, ...olderProfiles];
    } else {
      const sameProfiles = cursor
        ? await ctx.db
            .query("partnerSearchProfiles")
            .withIndex("by_updated", (q) => q.eq("updatedAt", cursor.updatedAt))
            .collect()
        : [];
      const olderProfiles = await ctx.db
        .query("partnerSearchProfiles")
        .withIndex("by_updated", (q) =>
          cursor ? q.lt("updatedAt", cursor.updatedAt) : q,
        )
        .order("desc")
        .take(indexedLimit);
      candidates = [...sameProfiles, ...olderProfiles];
    }

    const seen = new Set<Id<"partnerSearchProfiles">>();
    const filtered = candidates.filter((p) => {
      if (seen.has(p._id)) return false;
      seen.add(p._id);
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
