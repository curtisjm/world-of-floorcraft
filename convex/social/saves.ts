import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { notFound } from "../lib/errors";
import { isPostAccessible } from "../lib/postAccess";

/**
 * Save folders and saved posts. Ports the Drizzle/tRPC `save` router. A
 * `folderId` of `null` represents the implicit "all saves" bucket — there is
 * no row in `saveFolders` for it; saved posts simply leave `folderId` unset.
 */

const FOLDER_NAME_MAX = 100;

/** Folders the current user owns, with each folder's saved-post count. */
export const folders = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const folders = await ctx.db
      .query("saveFolders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const allSaved = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) => q.eq("userId", user._id))
      .collect();

    const sortedFolders = [...folders].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const countsByFolder = new Map<string, number>();
    let allSavedCount = 0;
    for (const s of allSaved) {
      if (s.folderId === undefined) {
        allSavedCount += 1;
      } else {
        const key = String(s.folderId);
        countsByFolder.set(key, (countsByFolder.get(key) ?? 0) + 1);
      }
    }

    return {
      allSavedCount,
      folders: sortedFolders.map((f) => ({
        id: f._id,
        name: f.name,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        postCount: countsByFolder.get(String(f._id)) ?? 0,
      })),
    };
  },
});

/** Create a new save folder for the current user. */
export const createFolder = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = args.name.trim();
    if (name.length === 0 || name.length > FOLDER_NAME_MAX) {
      notFound("Folder name must be 1-100 characters");
    }
    const now = Date.now();
    const id = await ctx.db.insert("saveFolders", {
      userId: user._id,
      name,
      createdAt: now,
      updatedAt: now,
    });
    return (await ctx.db.get(id))!;
  },
});

/**
 * Delete a folder. Moves the folder's saved posts back into the implicit
 * "all saves" bucket (sets `folderId` to undefined). Idempotent.
 */
export const deleteFolder = mutation({
  args: { folderId: v.id("saveFolders") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== user._id) {
      return { success: true };
    }

    const savedInFolder = await ctx.db
      .query("savedPosts")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    for (const s of savedInFolder) {
      if (s.userId === user._id) {
        await ctx.db.patch(s._id, { folderId: undefined });
      }
    }
    await ctx.db.delete(args.folderId);
    return { success: true };
  },
});

/**
 * Save a post into either a folder or the implicit "all saves" bucket. Same
 * (post, folder) tuple is idempotent — no-op if already saved.
 */
export const savePost = mutation({
  args: {
    postId: v.id("posts"),
    folderId: v.union(v.id("saveFolders"), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || !(await isPostAccessible(ctx, post, user._id))) {
      notFound("Post not found");
    }
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.userId !== user._id) {
        notFound("Folder not found");
      }
    }

    const existing = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", user._id).eq("postId", args.postId),
      )
      .collect();
    const same = existing.find((s) =>
      args.folderId === null
        ? s.folderId === undefined
        : s.folderId === args.folderId,
    );
    if (same) return { success: true };

    await ctx.db.insert("savedPosts", {
      userId: user._id,
      postId: args.postId,
      folderId: args.folderId ?? undefined,
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

/** Remove a saved post from a folder (or the "all saves" bucket). */
export const unsavePost = mutation({
  args: {
    postId: v.id("posts"),
    folderId: v.union(v.id("saveFolders"), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const existing = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", user._id).eq("postId", args.postId),
      )
      .collect();
    for (const s of existing) {
      if (
        args.folderId === null
          ? s.folderId === undefined
          : s.folderId === args.folderId
      ) {
        await ctx.db.delete(s._id);
      }
    }
    return { success: true };
  },
});

/**
 * Folder ids the post is currently saved in for the caller. A `null` value
 * means the post is also in the implicit "all saves" bucket. The save button
 * uses this to render check marks per folder.
 */
export const postFolders = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const saved = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", user._id).eq("postId", args.postId),
      )
      .collect();
    return saved.map((s) => s.folderId ?? null);
  },
});

/**
 * Posts in a folder (or the "all saves" bucket when `folderId` is `null`),
 * oldest-saved first. Posts the viewer no longer has access to are dropped.
 */
export const postsInFolder = query({
  args: { folderId: v.union(v.id("saveFolders"), v.null()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const saved = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) => q.eq("userId", user._id))
      .collect();
    const inFolder = saved.filter((s) =>
      args.folderId === null
        ? s.folderId === undefined
        : s.folderId === args.folderId,
    );

    const ordered = inFolder.sort((a, b) => a.createdAt - b.createdAt);

    const items: Array<{
      savedPostId: Id<"savedPosts">;
      postId: Id<"posts">;
      type: string;
      title: string | null;
      body: string | null;
      publishedAt: number | null;
      authorUsername: string | null;
      authorDisplayName: string | null;
      authorAvatarUrl: string | null;
    }> = [];
    for (const s of ordered) {
      const post = await ctx.db.get(s.postId);
      if (!post) continue;
      if (!(await isPostAccessible(ctx, post, user._id))) continue;
      const author = post.authorId ? await ctx.db.get(post.authorId) : null;
      items.push({
        savedPostId: s._id,
        postId: post._id,
        type: post.type,
        title: post.title ?? null,
        body: post.body ?? null,
        publishedAt: post.publishedAt ?? null,
        authorUsername: author?.username ?? null,
        authorDisplayName: author?.displayName ?? null,
        authorAvatarUrl: author?.avatarUrl ?? null,
      });
    }
    return items;
  },
});
