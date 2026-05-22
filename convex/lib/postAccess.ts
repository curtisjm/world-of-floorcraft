import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Visibility check for a `posts` document. Author can always read their own
 * posts (including drafts); everyone else needs a published post that matches
 * the visibility rule. Mirrors `src/domains/social/lib/post-access.ts`.
 */
export async function isPostAccessible(
  ctx: Ctx,
  post: Pick<
    Doc<"posts">,
    "authorId" | "orgId" | "visibility" | "visibilityOrgId" | "publishedAt"
  >,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (viewerId && post.authorId && post.authorId === viewerId) return true;

  if (!post.publishedAt) return false;
  if (post.visibility === "public") return true;
  if (!viewerId) return false;

  if (post.visibility === "followers" && post.authorId) {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", viewerId).eq("followingId", post.authorId!),
      )
      .unique();
    return follow?.status === "active";
  }

  if (post.visibility === "organization" && post.visibilityOrgId) {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", post.visibilityOrgId!).eq("userId", viewerId),
      )
      .unique();
    return !!membership;
  }

  return false;
}
