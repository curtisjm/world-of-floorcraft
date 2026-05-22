import { ConvexError, v } from "convex/values";
import type { UserIdentity } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUserOrNull, requireIdentity } from "./lib/auth";
import { badRequest } from "./lib/errors";
import { competitionLevel } from "./schema";

/**
 * App-user identity for the social domain. Ported from the Drizzle/tRPC
 * `profile` router's `me`/`update`/`needsOnboarding` procedures and the
 * `ensureUser` helper that `protectedProcedure` ran on every request.
 *
 * Clerk stays the identity provider: `tokenIdentifier` is the stable Convex
 * auth key, `clerkUserId` keeps the raw Clerk subject. Profile fields are
 * seeded from the JWT identity claims; onboarding collects whatever is
 * missing (notably a username).
 */

/** Competition levels in rank order, for consecutive-level validation. */
const COMPETITION_LEVELS = [
  "newcomer",
  "bronze",
  "silver",
  "gold",
  "novice",
  "prechamp",
  "champ",
  "professional",
] as const;

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const DISPLAY_NAME_MAX = 60;
const BIO_MAX = 500;

/**
 * Resolve the app user for a Clerk identity, creating the row on first sight.
 * Replaces the old `ensureUser`: queries can no longer write, so the user row
 * is materialized here from a mutation instead of implicitly on every call.
 */
async function ensureUserForIdentity(
  ctx: MutationCtx,
  identity: UserIdentity,
): Promise<Doc<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (existing) return existing;

  const displayName =
    identity.name?.trim() ||
    [identity.givenName, identity.familyName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    undefined;
  const username = identity.nickname ?? identity.preferredUsername ?? undefined;
  const avatarUrl = identity.pictureUrl ?? undefined;

  const now = Date.now();
  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    clerkUserId: identity.subject,
    displayName,
    username,
    avatarUrl,
    isPrivate: false,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(userId);
  if (!created) {
    // Unreachable: the row was just inserted in this transaction.
    throw new ConvexError({
      code: "INTERNAL",
      message: "User creation failed",
    });
  }
  return created;
}

/** The current user's profile, or `null` before sign-in/onboarding. */
export const me = query({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    return await getCurrentUserOrNull(ctx);
  },
});

/**
 * Ensure a `users` row exists for the signed-in Clerk identity and return it.
 * Idempotent — safe to call on every app load.
 */
export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx): Promise<Doc<"users">> => {
    const identity = await requireIdentity(ctx);
    return await ensureUserForIdentity(ctx, identity);
  },
});

/** Whether the signed-in user still needs to pick a username. */
export const needsOnboarding = query({
  args: {},
  handler: async (ctx): Promise<{ needsOnboarding: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { needsOnboarding: false };
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    return { needsOnboarding: !user || !user.username };
  },
});

/** Update the current user's profile. Also used by onboarding to set username. */
export const updateProfile = mutation({
  args: {
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    competitionLevel: v.optional(v.union(competitionLevel, v.null())),
    competitionLevelHigh: v.optional(v.union(competitionLevel, v.null())),
    isPrivate: v.optional(v.boolean()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"users">> => {
    const identity = await requireIdentity(ctx);
    const user = await ensureUserForIdentity(ctx, identity);

    const patch: {
      username?: string;
      displayName?: string;
      bio?: string;
      competitionLevel?: Doc<"users">["competitionLevel"];
      competitionLevelHigh?: Doc<"users">["competitionLevelHigh"];
      isPrivate?: boolean;
      avatarUrl?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.username !== undefined) {
      const username = args.username.trim();
      if (
        username.length < USERNAME_MIN ||
        username.length > USERNAME_MAX ||
        !USERNAME_REGEX.test(username)
      ) {
        badRequest(
          "Username must be 3-30 characters: letters, numbers, and underscores only",
        );
      }
      const taken = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .unique();
      if (taken && taken._id !== user._id) {
        throw new ConvexError({
          code: "CONFLICT",
          message: "Username already taken",
        });
      }
      patch.username = username;
    }

    if (args.displayName !== undefined) {
      if (args.displayName.length > DISPLAY_NAME_MAX) {
        badRequest("Display name is too long");
      }
      patch.displayName = args.displayName;
    }

    if (args.bio !== undefined) {
      if (args.bio.length > BIO_MAX) {
        badRequest("Bio is too long");
      }
      patch.bio = args.bio;
    }

    // `null` clears a level; a value sets it; absence leaves it untouched.
    if (args.competitionLevel !== undefined) {
      patch.competitionLevel = args.competitionLevel ?? undefined;
    }
    if (args.competitionLevelHigh !== undefined) {
      patch.competitionLevelHigh = args.competitionLevelHigh ?? undefined;
    }

    // Consecutive-level guard: the high level must not rank below the low
    // one. Mirrors the tRPC rule — enforced only when both are supplied.
    if (args.competitionLevel && args.competitionLevelHigh) {
      const lowIdx = COMPETITION_LEVELS.indexOf(args.competitionLevel);
      const highIdx = COMPETITION_LEVELS.indexOf(args.competitionLevelHigh);
      if (highIdx < lowIdx) {
        badRequest(
          "competitionLevelHigh must be greater than or equal to competitionLevel",
        );
      }
    }

    if (args.isPrivate !== undefined) {
      patch.isPrivate = args.isPrivate;
    }
    if (args.avatarUrl !== undefined) {
      patch.avatarUrl = args.avatarUrl;
    }

    await ctx.db.patch(user._id, patch);

    const updated = await ctx.db.get(user._id);
    if (!updated) {
      // Unreachable: the row was patched in this transaction.
      throw new ConvexError({
        code: "INTERNAL",
        message: "User update failed",
      });
    }
    return updated;
  },
});
