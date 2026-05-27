import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser, getCurrentUserOrNull } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireOrgRole } from "../lib/permissions";
import { isPostAccessible } from "../lib/postAccess";
import { postType, visibility } from "../schema";
import { createNotification } from "./notifications";

/**
 * Social posts, feed, and org-scoped posts. Ports the Drizzle/tRPC routers
 * `post`, `feed`, and `orgPost` for Task 7 of the Convex migration.
 *
 * User-authored posts set `authorId` and leave `orgId` undefined. Org-authored
 * posts set `orgId` (and leave `authorId` undefined) — the org schema rules
 * mean an org admin/owner creates them on the org's behalf.
 */

type PostType = Infer<typeof postType>;
type Visibility = Infer<typeof visibility>;

const ARTICLE_TITLE_MAX = 200;
const ROUTINE_BODY_MAX = 1000;
const FEED_PAGE_SIZE = 20;
const FEED_PAGE_SIZE_MAX = 50;

async function userById(
  ctx: QueryCtx,
  userId: Id<"users"> | undefined,
): Promise<Doc<"users"> | null> {
  if (!userId) return null;
  return await ctx.db.get(userId);
}

async function orgById(
  ctx: QueryCtx,
  orgId: Id<"organizations"> | undefined,
): Promise<Doc<"organizations"> | null> {
  if (!orgId) return null;
  return await ctx.db.get(orgId);
}

function authorCard(user: Doc<"users"> | null) {
  if (!user) {
    return {
      authorUsername: null,
      authorDisplayName: null,
      authorAvatarUrl: null,
    };
  }
  return {
    authorUsername: user.username ?? null,
    authorDisplayName: user.displayName ?? null,
    authorAvatarUrl: user.avatarUrl ?? null,
  };
}

function orgCard(org: Doc<"organizations"> | null) {
  if (!org) {
    return { orgName: null, orgSlug: null, orgAvatarUrl: null };
  }
  return {
    orgName: org.name,
    orgSlug: org.slug,
    orgAvatarUrl: org.avatarUrl ?? null,
  };
}

function postProjection(
  post: Doc<"posts">,
  user: Doc<"users"> | null,
  org: Doc<"organizations"> | null = null,
) {
  return {
    id: post._id,
    authorId: post.authorId ?? null,
    orgId: post.orgId ?? null,
    type: post.type,
    visibility: post.visibility,
    visibilityOrgId: post.visibilityOrgId ?? null,
    title: post.title ?? null,
    body: post.body ?? null,
    routineId: post.routineId ?? null,
    publishedAt: post.publishedAt ?? null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    ...authorCard(user),
    ...orgCard(org),
  };
}

function clampLimit(limit: number | undefined): number {
  if (!limit) return FEED_PAGE_SIZE;
  return Math.min(Math.max(limit, 1), FEED_PAGE_SIZE_MAX);
}

/**
 * Cursor encodes `(publishedAt, _id)` so paginated feeds break ties on the
 * Convex doc id deterministically — the same lexical ordering Postgres
 * `desc(publishedAt, id)` produced.
 */
function isBefore(
  post: Doc<"posts">,
  cursor: { publishedAt: number; id: Id<"posts"> } | undefined,
): boolean {
  if (!cursor) return true;
  const publishedAt = post.publishedAt ?? 0;
  if (publishedAt < cursor.publishedAt) return true;
  if (publishedAt > cursor.publishedAt) return false;
  return post._id < cursor.id;
}

function nextCursor(
  last: Doc<"posts"> | undefined,
): { publishedAt: number; id: Id<"posts"> } | null {
  if (!last || !last.publishedAt) return null;
  return { publishedAt: last.publishedAt, id: last._id };
}

function comparePostsNewest(a: Doc<"posts">, b: Doc<"posts">): number {
  const byTime = (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
  if (byTime !== 0) return byTime;
  return a._id < b._id ? 1 : a._id > b._id ? -1 : 0;
}

async function publicPostsPage(
  ctx: QueryCtx,
  limit: number,
  cursor: { publishedAt: number; id: Id<"posts"> } | undefined,
): Promise<Doc<"posts">[]> {
  const sameTimestamp = cursor
    ? await ctx.db
        .query("posts")
        .withIndex("by_visibility_published", (q) =>
          q.eq("visibility", "public").eq("publishedAt", cursor.publishedAt),
        )
        .collect()
    : [];
  const older = await ctx.db
    .query("posts")
    .withIndex("by_visibility_published", (q) => {
      const scoped = q.eq("visibility", "public");
      return cursor
        ? scoped.lt("publishedAt", cursor.publishedAt)
        : scoped.gt("publishedAt", 0);
    })
    .order("desc")
    .take(limit + 1);

  return [...sameTimestamp.filter((p) => isBefore(p, cursor)), ...older]
    .filter((p) => !!p.publishedAt)
    .sort(comparePostsNewest)
    .slice(0, limit + 1);
}

async function followedAuthorCandidates(
  ctx: QueryCtx,
  authorId: Id<"users">,
  limit: number,
  cursor: { publishedAt: number; id: Id<"posts"> } | undefined,
): Promise<Doc<"posts">[]> {
  const sameTimestamp = cursor
    ? await ctx.db
        .query("posts")
        .withIndex("by_author_published", (q) =>
          q.eq("authorId", authorId).eq("publishedAt", cursor.publishedAt),
        )
        .collect()
    : [];
  const older = await ctx.db
    .query("posts")
    .withIndex("by_author_published", (q) => {
      const scoped = q.eq("authorId", authorId);
      return cursor
        ? scoped.lt("publishedAt", cursor.publishedAt)
        : scoped.gt("publishedAt", 0);
    })
    .order("desc")
    .take(limit + 1);
  return [...sameTimestamp, ...older]
    .filter(
      (p) =>
        !!p.publishedAt &&
        isBefore(p, cursor) &&
        (p.visibility === "public" || p.visibility === "followers"),
    )
    .sort(comparePostsNewest)
    .slice(0, limit + 1);
}

async function orgVisibleCandidates(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  limit: number,
  cursor: { publishedAt: number; id: Id<"posts"> } | undefined,
): Promise<Doc<"posts">[]> {
  const sameTimestamp = cursor
    ? await ctx.db
        .query("posts")
        .withIndex("by_visibility_org_published", (q) =>
          q
            .eq("visibility", "organization")
            .eq("visibilityOrgId", orgId)
            .eq("publishedAt", cursor.publishedAt),
        )
        .collect()
    : [];
  const older = await ctx.db
    .query("posts")
    .withIndex("by_visibility_org_published", (q) => {
      const scoped = q
        .eq("visibility", "organization")
        .eq("visibilityOrgId", orgId);
      return cursor
        ? scoped.lt("publishedAt", cursor.publishedAt)
        : scoped.gt("publishedAt", 0);
    })
    .order("desc")
    .take(limit + 1);
  return [...sameTimestamp, ...older]
    .filter((p) => !!p.publishedAt && isBefore(p, cursor))
    .sort(comparePostsNewest)
    .slice(0, limit + 1);
}

const feedCursor = v.optional(
  v.union(
    v.null(),
    v.object({ publishedAt: v.number(), id: v.id("posts") }),
  ),
);

async function listUserOrgIds(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Set<Id<"organizations">>> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(memberships.map((m) => m.orgId));
}

async function listActiveFollowingIds(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Set<Id<"users">>> {
  const follows = await ctx.db
    .query("follows")
    .withIndex("by_follower", (q) => q.eq("followerId", userId))
    .collect();
  return new Set(
    follows.filter((f) => f.status === "active").map((f) => f.followingId),
  );
}

// ── Single post ─────────────────────────────────────────────────────

/**
 * Published posts by a single user, filtered by visibility against the viewer.
 * Used by the user profile page to render their posts tab.
 */
export const listByAuthor = query({
  args: { authorId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await getCurrentUserOrNull(ctx);
    const viewerId = viewer?._id ?? null;

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.authorId))
      .collect();

    const visible = [] as Doc<"posts">[];
    for (const post of posts) {
      if (await isPostAccessible(ctx, post, viewerId)) visible.push(post);
    }
    visible.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    return visible.map((p) =>
      postProjection(p, null, null),
    );
  },
});

/**
 * Fetch a single post with author info, returning `null` when the post is
 * missing or the viewer cannot see it (drafts, follower/org visibility).
 */
export const get = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    const viewer = await getCurrentUserOrNull(ctx);
    const accessible = await isPostAccessible(ctx, post, viewer?._id ?? null);
    if (!accessible) return null;
    const author = await userById(ctx, post.authorId);
    const org = await orgById(ctx, post.orgId);
    return postProjection(post, author, org);
  },
});

// ── User article / routine-share lifecycle ──────────────────────────

const articleInput = {
  title: v.string(),
  body: v.string(),
  visibility: v.optional(visibility),
  visibilityOrgId: v.optional(v.id("organizations")),
  publish: v.optional(v.boolean()),
};

async function requireOrgMembershipForVisibility(
  ctx: QueryCtx,
  userId: Id<"users">,
  orgId: Id<"organizations">,
): Promise<void> {
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
    .unique();
  if (!membership) {
    forbidden("You must be a member of this organization");
  }
}

/** Create an article post. Drafts stay unpublished until `publish` is set. */
export const createArticle = mutation({
  args: articleInput,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const title = args.title.trim();
    if (title.length === 0 || title.length > ARTICLE_TITLE_MAX) {
      badRequest("Title must be 1-200 characters");
    }
    const vis: Visibility = args.visibility ?? "public";
    if (vis === "organization") {
      if (!args.visibilityOrgId) {
        badRequest("visibilityOrgId is required for organization visibility");
      }
      await requireOrgMembershipForVisibility(
        ctx,
        user._id,
        args.visibilityOrgId,
      );
    }
    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      authorId: user._id,
      type: "article",
      title,
      body: args.body,
      visibility: vis,
      visibilityOrgId: vis === "organization" ? args.visibilityOrgId : undefined,
      publishedAt: args.publish ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(postId);
    return created!;
  },
});

/** Share a routine as a published post. Always published. */
export const createRoutineShare = mutation({
  args: {
    routineId: v.id("routines"),
    body: v.union(v.string(), v.null()),
    visibility: v.optional(visibility),
    visibilityOrgId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (args.body && args.body.length > ROUTINE_BODY_MAX) {
      badRequest("Body is too long");
    }
    const vis: Visibility = args.visibility ?? "public";
    if (vis === "organization") {
      if (!args.visibilityOrgId) {
        badRequest("visibilityOrgId is required for organization visibility");
      }
      await requireOrgMembershipForVisibility(
        ctx,
        user._id,
        args.visibilityOrgId,
      );
    }
    const routine = await ctx.db.get(args.routineId);
    if (!routine || routine.userId !== user._id) {
      forbidden("Routine not owned by current user");
    }
    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      authorId: user._id,
      type: "routine_share",
      body: args.body ?? undefined,
      routineId: args.routineId,
      visibility: vis,
      visibilityOrgId: vis === "organization" ? args.visibilityOrgId : undefined,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return (await ctx.db.get(postId))!;
  },
});

/** Edit the current user's own post. */
export const update = mutation({
  args: {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    visibility: v.optional(visibility),
    visibilityOrgId: v.optional(v.union(v.id("organizations"), v.null())),
    publish: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== user._id) return null;

    if (args.visibility === "organization") {
      const orgId = args.visibilityOrgId ?? post.visibilityOrgId;
      if (!orgId) {
        badRequest("visibilityOrgId is required for organization visibility");
      }
      await requireOrgMembershipForVisibility(ctx, user._id, orgId);
    }

    const patch: Partial<Doc<"posts">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length === 0 || title.length > ARTICLE_TITLE_MAX) {
        badRequest("Title must be 1-200 characters");
      }
      patch.title = title;
    }
    if (args.body !== undefined) patch.body = args.body;
    if (args.visibility !== undefined) {
      patch.visibility = args.visibility;
      if (args.visibility === "organization") {
        patch.visibilityOrgId =
          args.visibilityOrgId ?? post.visibilityOrgId;
      } else {
        patch.visibilityOrgId = undefined;
      }
    } else if (args.visibilityOrgId !== undefined) {
      patch.visibilityOrgId = args.visibilityOrgId ?? undefined;
    }
    if (args.publish) {
      patch.publishedAt = Date.now();
    }
    await ctx.db.patch(args.postId, patch);
    return await ctx.db.get(args.postId);
  },
});

/** Publish a draft article. No-op if already published. */
export const publish = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== user._id) return null;
    const now = Date.now();
    await ctx.db.patch(args.postId, { publishedAt: now, updatedAt: now });
    return await ctx.db.get(args.postId);
  },
});

/** Delete the current user's own post and its descendants. */
export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== user._id) {
      return { success: true };
    }
    await deletePostCascade(ctx, args.postId);
    return { success: true };
  },
});

/**
 * Delete a post and all its dependent rows (comments, likes, saved entries).
 * Shared by user `remove` and org `removeOrgPost` so cleanup logic stays in
 * one place.
 */
async function deletePostCascade(
  ctx: import("../_generated/server").MutationCtx,
  postId: Id<"posts">,
): Promise<void> {
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const c of comments) {
    const commentLikes = await ctx.db
      .query("likes")
      .withIndex("by_comment", (q) => q.eq("commentId", c._id))
      .collect();
    for (const l of commentLikes) await ctx.db.delete(l._id);
    await ctx.db.delete(c._id);
  }
  const postLikes = await ctx.db
    .query("likes")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const l of postLikes) await ctx.db.delete(l._id);
  const saved = await ctx.db
    .query("savedPosts")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const s of saved) await ctx.db.delete(s._id);
  await ctx.db.delete(postId);
}

/** Current user's article drafts, newest update first. */
export const listDrafts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const drafts = await ctx.db
      .query("posts")
      .withIndex("by_author_type_published", (q) =>
        q
          .eq("authorId", user._id)
          .eq("type", "article")
          .eq("publishedAt", undefined),
      )
      .collect();
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

// ── Feeds ───────────────────────────────────────────────────────────

/**
 * The signed-in user's feed: posts by followed users (public/followers
 * visible) plus org-only posts where the viewer is a member.
 */
export const followingFeed = query({
  args: {
    cursor: feedCursor,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const limit = clampLimit(args.limit);
    const cursor = args.cursor ?? undefined;

    const followingIds = await listActiveFollowingIds(ctx, user._id);
    const userOrgIds = await listUserOrgIds(ctx, user._id);

    const candidateGroups = await Promise.all([
      ...[...followingIds].map((authorId) =>
        followedAuthorCandidates(ctx, authorId, limit, cursor),
      ),
      ...[...userOrgIds].map((orgId) =>
        orgVisibleCandidates(ctx, orgId, limit, cursor),
      ),
    ]);
    const filtered = candidateGroups
      .flat()
      .sort(comparePostsNewest)
      .slice(0, limit + 1);

    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, limit) : filtered;
    const lastPost = items[items.length - 1];
    const enriched = await Promise.all(
      items.map(async (p) =>
        postProjection(
          p,
          await userById(ctx, p.authorId),
          await orgById(ctx, p.orgId),
        ),
      ),
    );

    return {
      posts: enriched,
      nextCursor: hasMore ? nextCursor(lastPost) : null,
    };
  },
});

/** Public explore feed: every published `public` post, newest first. */
export const exploreFeed = query({
  args: {
    cursor: feedCursor,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const cursor = args.cursor ?? undefined;

    const filtered = await publicPostsPage(ctx, limit, cursor);
    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, limit) : filtered;
    const lastPost = items[items.length - 1];

    const enriched = await Promise.all(
      items.map(async (p) =>
        postProjection(
          p,
          await userById(ctx, p.authorId),
          await orgById(ctx, p.orgId),
        ),
      ),
    );

    return {
      posts: enriched,
      nextCursor: hasMore ? nextCursor(lastPost) : null,
    };
  },
});

// ── Org posts ───────────────────────────────────────────────────────

const orgPostInput = {
  orgId: v.id("organizations"),
  type: postType,
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  routineId: v.optional(v.id("routines")),
  visibility: v.optional(visibility),
  publish: v.optional(v.boolean()),
};

async function notifyOrgMembers(
  ctx: import("../_generated/server").MutationCtx,
  orgId: Id<"organizations">,
  postId: Id<"posts">,
  actorId: Id<"users">,
): Promise<void> {
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId))
    .collect();
  for (const m of members) {
    await createNotification(ctx, {
      userId: m.userId,
      type: "org_post",
      actorId,
      postId,
      orgId,
    });
  }
}

/**
 * Create an org-authored post. Admin or owner only. Sets `orgId`, leaves
 * `authorId` unset. Notifies every org member on publish.
 */
export const createOrgPost = mutation({
  args: orgPostInput,
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "admin");
    const vis: Visibility = args.visibility ?? "public";
    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      orgId: args.orgId,
      type: args.type,
      title: args.title,
      body: args.body,
      routineId: args.routineId,
      visibility: vis,
      visibilityOrgId: vis === "organization" ? args.orgId : undefined,
      publishedAt: args.publish ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    if (args.publish) {
      await notifyOrgMembers(ctx, args.orgId, postId, user._id);
    }
    return (await ctx.db.get(postId))!;
  },
});

/** Update an org post. Admin or owner only. */
export const updateOrgPost = mutation({
  args: {
    postId: v.id("posts"),
    orgId: v.id("organizations"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    visibility: v.optional(visibility),
  },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "admin");
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== args.orgId) notFound("Org post not found");

    const patch: Partial<Doc<"posts">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length === 0 || title.length > ARTICLE_TITLE_MAX) {
        badRequest("Title must be 1-200 characters");
      }
      patch.title = title;
    }
    if (args.body !== undefined) patch.body = args.body;
    if (args.visibility !== undefined) {
      patch.visibility = args.visibility;
      patch.visibilityOrgId =
        args.visibility === "organization" ? args.orgId : undefined;
    }
    await ctx.db.patch(args.postId, patch);
    return (await ctx.db.get(args.postId))!;
  },
});

/** Publish an org draft. Admin or owner only. Notifies every org member. */
export const publishOrgPost = mutation({
  args: { postId: v.id("posts"), orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await requireOrgRole(ctx, args.orgId, "admin");
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== args.orgId || post.publishedAt) {
      notFound("Draft not found");
    }
    const now = Date.now();
    await ctx.db.patch(args.postId, { publishedAt: now, updatedAt: now });
    await notifyOrgMembers(ctx, args.orgId, args.postId, user._id);
    return (await ctx.db.get(args.postId))!;
  },
});

/** Delete an org post and its dependents. Admin or owner only. */
export const removeOrgPost = mutation({
  args: { postId: v.id("posts"), orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "admin");
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== args.orgId) notFound("Org post not found");
    await deletePostCascade(ctx, args.postId);
    return { success: true };
  },
});

/**
 * Public listing of an org's published `public`-visibility posts. Newest
 * first. Returns no cursor when there are no more results.
 */
export const listByOrg = query({
  args: {
    orgId: v.id("organizations"),
    cursor: feedCursor,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const cursor = args.cursor ?? undefined;

    const sameTimestamp = cursor
      ? await ctx.db
          .query("posts")
          .withIndex("by_org_visibility_published", (q) =>
            q
              .eq("orgId", args.orgId)
              .eq("visibility", "public")
              .eq("publishedAt", cursor.publishedAt),
          )
          .collect()
      : [];
    const older = await ctx.db
      .query("posts")
      .withIndex("by_org_visibility_published", (q) => {
        const scoped = q.eq("orgId", args.orgId).eq("visibility", "public");
        return cursor
          ? scoped.lt("publishedAt", cursor.publishedAt)
          : scoped.gt("publishedAt", 0);
      })
      .order("desc")
      .take(limit + 1);

    const filtered = [...sameTimestamp, ...older]
      .filter((p) => !!p.publishedAt && isBefore(p, cursor))
      .sort(comparePostsNewest)
      .slice(0, limit + 1);

    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, limit) : filtered;
    const lastPost = items[items.length - 1];

    const enriched = await Promise.all(
      items.map(async (p) => {
        const org = await orgById(ctx, p.orgId);
        return {
          id: p._id,
          type: p.type as PostType,
          title: p.title ?? null,
          body: p.body ?? null,
          visibility: p.visibility,
          publishedAt: p.publishedAt ?? null,
          createdAt: p.createdAt,
          orgId: p.orgId ?? null,
          orgName: org?.name ?? null,
          orgSlug: org?.slug ?? null,
          orgAvatarUrl: org?.avatarUrl ?? null,
        };
      }),
    );

    return {
      items: enriched,
      nextCursor: hasMore ? nextCursor(lastPost) : null,
    };
  },
});

/** Org draft list. Admin or owner only. */
export const listOrgDrafts = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "admin");
    const drafts = await ctx.db
      .query("posts")
      .withIndex("by_org_published", (q) =>
        q.eq("orgId", args.orgId).eq("publishedAt", undefined),
      )
      .collect();
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
