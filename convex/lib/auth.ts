import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * Require a Convex auth identity. Throws `UNAUTHORIZED` when the request is
 * not signed in. Use this for endpoints that need authentication but not a
 * fully onboarded app-user profile.
 */
export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  }
  return identity;
}

/**
 * Resolve the current app user, or `null` when the request is unauthenticated
 * or the Clerk identity has no `users` row yet (pre-onboarding). Use for
 * queries that must not throw, e.g. `me` and onboarding checks.
 */
export async function getCurrentUserOrNull(
  ctx: Ctx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

/**
 * Resolve the current app user, throwing when the request is unauthenticated
 * (`UNAUTHORIZED`) or has no `users` row yet (`ONBOARDING_REQUIRED`). Use for
 * protected functions that require a complete profile.
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) {
    throw new ConvexError({
      code: "ONBOARDING_REQUIRED",
      message: "User profile required",
    });
  }
  return user;
}

/** Resolve just the current app user's Convex document id. */
export async function requireCurrentUserId(ctx: Ctx): Promise<Id<"users">> {
  const user = await getCurrentUser(ctx);
  return user._id;
}
