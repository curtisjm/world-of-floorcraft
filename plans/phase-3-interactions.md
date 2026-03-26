# Phase 3: Interactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add likes (posts + comments), YouTube-style comment threads, save/bookmark system with multi-folder support, and share link generation.

**Architecture:** New `comments`, `likes`, `save_folders`, `saved_posts` tables in social domain. Comment threading enforced at application layer (replies can't have replies). Like counts derived via query. Save system uses multi-folder bookmarking with an implicit "All Saved" default.

**Tech Stack:** Drizzle ORM, tRPC v11, Next.js App Router, shadcn/ui

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Interactions", "Save/Bookmark", "Data Model > comments, likes, save_folders, saved_posts"

**Depends on:** Phase 2 (posts & feed) must be complete.

---

## File Structure

```
src/
  domains/
    social/
      schema.ts              ← add comments, likes, save_folders, saved_posts tables
      routers/
        comment.ts           ← NEW: create/delete comments, list by post
        like.ts              ← NEW: toggle like on post/comment, get counts
        save.ts              ← NEW: save/unsave posts, manage folders
      components/
        comment-thread.tsx   ← NEW: YouTube-style comment display with replies
        comment-form.tsx     ← NEW: comment input field
        like-button.tsx      ← NEW: heart icon with count
        save-button.tsx      ← NEW: bookmark icon with folder dropdown
        share-button.tsx     ← NEW: copy link / share via DM (DM stubbed)
        interaction-bar.tsx  ← NEW: combines like, comment count, save, share
  app/
    saved/
      page.tsx               ← NEW: saved posts page with folder sidebar
```

---

## Tasks

### Task 1: Add interaction tables to social schema

**Files:**
- Modify: `src/domains/social/schema.ts`

- [ ] **Step 1: Add comments, likes, save_folders, saved_posts tables**

In `src/domains/social/schema.ts`, add after the `posts` table:

```typescript
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    authorId: text("author_id")
      .references(() => users.id)
      .notNull(),
    parentId: integer("parent_id"),  // self-reference, FK added via raw SQL or application layer
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("comments_post_idx").on(table.postId),
    parentIdx: index("comments_parent_idx").on(table.parentId),
  })
);

export const likes = pgTable(
  "likes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPostUnique: uniqueIndex("likes_user_post_idx").on(table.userId, table.postId),
    userCommentUnique: uniqueIndex("likes_user_comment_idx").on(table.userId, table.commentId),
  })
);

export const saveFolders = pgTable("save_folders", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const savedPosts = pgTable(
  "saved_posts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    folderId: integer("folder_id").references(() => saveFolders.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPostFolderUnique: uniqueIndex("saved_posts_user_post_folder_idx").on(
      table.userId,
      table.postId,
      table.folderId
    ),
  })
);
```

- [ ] **Step 2: Push schema**

Run: `pnpm db:push`
Expected: All four new tables created.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/schema.ts
git commit -m "feat: add comments, likes, save_folders, and saved_posts tables"
```

---

### Task 2: Create comment router

**Files:**
- Create: `src/domains/social/routers/comment.ts`
- Modify: `src/shared/auth/routers.ts`

- [ ] **Step 1: Create comment router**

Create `src/domains/social/routers/comment.ts`:

```typescript
import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { comments } from "@/domains/social/schema";

export const commentRouter = router({
  /** List top-level comments for a post with reply counts. */
  listByPost: publicProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ input }) => {
      const topLevel = await db
        .select({
          id: comments.id,
          postId: comments.postId,
          authorId: comments.authorId,
          body: comments.body,
          createdAt: comments.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(
          and(
            eq(comments.postId, input.postId),
            isNull(comments.parentId)
          )
        )
        .orderBy(asc(comments.createdAt));

      // Get reply counts for each top-level comment
      const commentIds = topLevel.map((c) => c.id);
      const replyCounts = commentIds.length > 0
        ? await db
            .select({
              parentId: comments.parentId,
              count: sql<number>`count(*)::int`,
            })
            .from(comments)
            .where(sql`${comments.parentId} = ANY(${commentIds})`)
            .groupBy(comments.parentId)
        : [];

      const replyCountMap = new Map(
        replyCounts.map((r) => [r.parentId, r.count])
      );

      return topLevel.map((c) => ({
        ...c,
        replyCount: replyCountMap.get(c.id) ?? 0,
      }));
    }),

  /** List replies for a specific comment. */
  replies: publicProcedure
    .input(z.object({ commentId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: comments.id,
          postId: comments.postId,
          authorId: comments.authorId,
          parentId: comments.parentId,
          body: comments.body,
          createdAt: comments.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.parentId, input.commentId))
        .orderBy(asc(comments.createdAt));
    }),

  /** Create a comment (top-level or reply). */
  create: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        parentId: z.number().nullable().optional(),
        body: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If parentId is set, verify it's a top-level comment (not a reply to a reply)
      if (input.parentId) {
        const [parent] = await db
          .select({ parentId: comments.parentId })
          .from(comments)
          .where(eq(comments.id, input.parentId));
        if (parent?.parentId !== null) {
          // Parent is itself a reply — don't allow nesting deeper
          return { error: "cannot_reply_to_reply" as const };
        }
      }

      const [comment] = await db
        .insert(comments)
        .values({
          postId: input.postId,
          authorId: ctx.userId,
          parentId: input.parentId ?? null,
          body: input.body,
        })
        .returning();
      return { comment };
    }),

  /** Delete own comment. */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(comments)
        .where(
          and(eq(comments.id, input.id), eq(comments.authorId, ctx.userId))
        );
      return { success: true };
    }),
});
```

- [ ] **Step 2: Register comment router**

In `src/shared/auth/routers.ts`, add `commentRouter` import and `comment: commentRouter`.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/comment.ts src/shared/auth/routers.ts
git commit -m "feat: add comment router with YouTube-style threading (single-level replies)"
```

---

### Task 3: Create like router

**Files:**
- Create: `src/domains/social/routers/like.ts`
- Modify: `src/shared/auth/routers.ts`

- [ ] **Step 1: Create like router**

Create `src/domains/social/routers/like.ts`:

```typescript
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { likes } from "@/domains/social/schema";

export const likeRouter = router({
  /** Toggle like on a post. Returns new liked state. */
  togglePost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.userId, ctx.userId),
            eq(likes.postId, input.postId)
          )
        );

      if (existing) {
        await db.delete(likes).where(eq(likes.id, existing.id));
        return { liked: false };
      }

      await db.insert(likes).values({
        userId: ctx.userId,
        postId: input.postId,
      });
      return { liked: true };
    }),

  /** Toggle like on a comment. Returns new liked state. */
  toggleComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.userId, ctx.userId),
            eq(likes.commentId, input.commentId)
          )
        );

      if (existing) {
        await db.delete(likes).where(eq(likes.id, existing.id));
        return { liked: false };
      }

      await db.insert(likes).values({
        userId: ctx.userId,
        commentId: input.commentId,
      });
      return { liked: true };
    }),

  /** Get like count and whether current user liked a post. */
  postStatus: publicProcedure
    .input(z.object({ postId: z.number(), userId: z.string().nullable() }))
    .query(async ({ input }) => {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(likes)
        .where(eq(likes.postId, input.postId));

      let liked = false;
      if (input.userId) {
        const [userLike] = await db
          .select({ id: likes.id })
          .from(likes)
          .where(
            and(
              eq(likes.userId, input.userId),
              eq(likes.postId, input.postId)
            )
          );
        liked = !!userLike;
      }

      return { count: countResult?.count ?? 0, liked };
    }),
});
```

- [ ] **Step 2: Register like router**

In `src/shared/auth/routers.ts`, add `likeRouter` import and `like: likeRouter`.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/like.ts src/shared/auth/routers.ts
git commit -m "feat: add like router with toggle and status queries for posts and comments"
```

---

### Task 4: Create save/bookmark router

**Files:**
- Create: `src/domains/social/routers/save.ts`
- Modify: `src/shared/auth/routers.ts`

- [ ] **Step 1: Create save router**

Create `src/domains/social/routers/save.ts`:

```typescript
import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { protectedProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { saveFolders, savedPosts, posts } from "@/domains/social/schema";
import { users } from "@shared/schema";

export const saveRouter = router({
  /** List user's save folders with post counts. */
  folders: protectedProcedure.query(async ({ ctx }) => {
    const folders = await db
      .select()
      .from(saveFolders)
      .where(eq(saveFolders.userId, ctx.userId))
      .orderBy(asc(saveFolders.name));

    // Count "All Saved" (unsorted)
    const [allSavedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(savedPosts)
      .where(
        and(
          eq(savedPosts.userId, ctx.userId),
          isNull(savedPosts.folderId)
        )
      );

    // Count per folder
    const folderCounts = folders.length > 0
      ? await db
          .select({
            folderId: savedPosts.folderId,
            count: sql<number>`count(*)::int`,
          })
          .from(savedPosts)
          .where(eq(savedPosts.userId, ctx.userId))
          .groupBy(savedPosts.folderId)
      : [];

    const countMap = new Map(
      folderCounts.map((fc) => [fc.folderId, fc.count])
    );

    return {
      allSavedCount: allSavedCount?.count ?? 0,
      folders: folders.map((f) => ({
        ...f,
        postCount: countMap.get(f.id) ?? 0,
      })),
    };
  }),

  /** Create a new folder. */
  createFolder: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const [folder] = await db
        .insert(saveFolders)
        .values({ userId: ctx.userId, name: input.name })
        .returning();
      return folder;
    }),

  /** Delete a folder. Saved posts in it move to All Saved (folderId = null). */
  deleteFolder: protectedProcedure
    .input(z.object({ folderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Move posts to unsorted
      await db
        .update(savedPosts)
        .set({ folderId: null })
        .where(
          and(
            eq(savedPosts.folderId, input.folderId),
            eq(savedPosts.userId, ctx.userId)
          )
        );

      await db
        .delete(saveFolders)
        .where(
          and(
            eq(saveFolders.id, input.folderId),
            eq(saveFolders.userId, ctx.userId)
          )
        );

      return { success: true };
    }),

  /** Save a post to a folder (or All Saved if folderId is null). */
  savePost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        folderId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Upsert — if already saved to this folder, do nothing
      await db
        .insert(savedPosts)
        .values({
          userId: ctx.userId,
          postId: input.postId,
          folderId: input.folderId,
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Remove a post from a specific folder (or All Saved). */
  unsavePost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        folderId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [
        eq(savedPosts.userId, ctx.userId),
        eq(savedPosts.postId, input.postId),
      ];
      if (input.folderId === null) {
        conditions.push(isNull(savedPosts.folderId));
      } else {
        conditions.push(eq(savedPosts.folderId, input.folderId));
      }
      await db.delete(savedPosts).where(and(...conditions));
      return { success: true };
    }),

  /** Get which folders a post is saved in (for the current user). */
  postFolders: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ ctx, input }) => {
      const saved = await db
        .select({ folderId: savedPosts.folderId })
        .from(savedPosts)
        .where(
          and(
            eq(savedPosts.userId, ctx.userId),
            eq(savedPosts.postId, input.postId)
          )
        );
      return saved.map((s) => s.folderId);
    }),

  /** List saved posts in a folder (or All Saved if folderId is null). */
  postsInFolder: protectedProcedure
    .input(z.object({ folderId: z.number().nullable() }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(savedPosts.userId, ctx.userId)];
      if (input.folderId === null) {
        conditions.push(isNull(savedPosts.folderId));
      } else {
        conditions.push(eq(savedPosts.folderId, input.folderId));
      }

      return db
        .select({
          savedPostId: savedPosts.id,
          postId: posts.id,
          type: posts.type,
          title: posts.title,
          body: posts.body,
          publishedAt: posts.publishedAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
          savedAt: savedPosts.createdAt,
        })
        .from(savedPosts)
        .innerJoin(posts, eq(savedPosts.postId, posts.id))
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(and(...conditions))
        .orderBy(asc(savedPosts.createdAt));
    }),
});
```

- [ ] **Step 2: Register save router**

In `src/shared/auth/routers.ts`, add `saveRouter` import and `save: saveRouter`.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/save.ts src/shared/auth/routers.ts
git commit -m "feat: add save/bookmark router with multi-folder support"
```

---

### Task 5: Create interaction UI components

**Files:**
- Create: `src/domains/social/components/like-button.tsx`
- Create: `src/domains/social/components/save-button.tsx`
- Create: `src/domains/social/components/share-button.tsx`
- Create: `src/domains/social/components/interaction-bar.tsx`

- [ ] **Step 1: Create like button**

Create `src/domains/social/components/like-button.tsx`:

```tsx
"use client";

import { Heart } from "lucide-react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface LikeButtonProps {
  postId: number;
  userId: string | null;
}

export function LikeButton({ postId, userId }: LikeButtonProps) {
  const utils = trpc.useUtils();
  const { data } = trpc.like.postStatus.useQuery({ postId, userId });

  const toggleMutation = trpc.like.togglePost.useMutation({
    onSuccess: () => {
      utils.like.postStatus.invalidate({ postId, userId });
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1"
      onClick={() => toggleMutation.mutate({ postId })}
      disabled={!userId || toggleMutation.isPending}
    >
      <Heart
        className={`h-4 w-4 ${data?.liked ? "fill-red-500 text-red-500" : ""}`}
      />
      <span className="text-xs">{data?.count ?? 0}</span>
    </Button>
  );
}
```

- [ ] **Step 2: Create save button**

Create `src/domains/social/components/save-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Bookmark, Plus } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { trpc } from "@shared/lib/trpc";

interface SaveButtonProps {
  postId: number;
}

export function SaveButton({ postId }: SaveButtonProps) {
  const [open, setOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const utils = trpc.useUtils();

  const { data: folders } = trpc.save.folders.useQuery();
  const { data: postFolderIds } = trpc.save.postFolders.useQuery({ postId });

  const saveMutation = trpc.save.savePost.useMutation({
    onSuccess: () => {
      utils.save.postFolders.invalidate({ postId });
      utils.save.folders.invalidate();
    },
  });

  const unsaveMutation = trpc.save.unsavePost.useMutation({
    onSuccess: () => {
      utils.save.postFolders.invalidate({ postId });
      utils.save.folders.invalidate();
    },
  });

  const createFolderMutation = trpc.save.createFolder.useMutation({
    onSuccess: (folder) => {
      utils.save.folders.invalidate();
      saveMutation.mutate({ postId, folderId: folder.id });
      setNewFolderName("");
    },
  });

  const isSaved = postFolderIds && postFolderIds.length > 0;
  const folderIdSet = new Set(postFolderIds ?? []);

  const toggleFolder = (folderId: number | null) => {
    if (folderIdSet.has(folderId)) {
      unsaveMutation.mutate({ postId, folderId });
    } else {
      saveMutation.mutate({ postId, folderId });
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
      >
        <Bookmark
          className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
        />
      </Button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-56 rounded-md border border-border bg-popover p-2 shadow-md z-50">
          <label className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-muted rounded cursor-pointer">
            <input
              type="checkbox"
              checked={folderIdSet.has(null)}
              onChange={() => toggleFolder(null)}
            />
            All Saved
          </label>

          {folders?.folders.map((folder) => (
            <label
              key={folder.id}
              className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-muted rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={folderIdSet.has(folder.id)}
                onChange={() => toggleFolder(folder.id)}
              />
              {folder.name}
            </label>
          ))}

          <div className="flex gap-1 mt-2 pt-2 border-t border-border">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder"
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => {
                if (newFolderName.trim()) {
                  createFolderMutation.mutate({ name: newFolderName.trim() });
                }
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create share button**

Create `src/domains/social/components/share-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@shared/ui/button";

interface ShareButtonProps {
  postId: number;
}

export function ShareButton({ postId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}/posts/${postId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </Button>
  );
  // "Share via DM" option deferred to Phase 6
}
```

- [ ] **Step 4: Create interaction bar**

Create `src/domains/social/components/interaction-bar.tsx`:

```tsx
"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@shared/ui/button";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import Link from "next/link";

interface InteractionBarProps {
  postId: number;
  userId: string | null;
  commentCount?: number;
}

export function InteractionBar({ postId, userId, commentCount }: InteractionBarProps) {
  return (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
      <LikeButton postId={postId} userId={userId} />

      <Link href={`/posts/${postId}#comments`}>
        <Button variant="ghost" size="sm" className="gap-1">
          <MessageCircle className="h-4 w-4" />
          {commentCount !== undefined && (
            <span className="text-xs">{commentCount}</span>
          )}
        </Button>
      </Link>

      <div className="flex-1" />

      <ShareButton postId={postId} />
      {userId && <SaveButton postId={postId} />}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/domains/social/components/like-button.tsx src/domains/social/components/save-button.tsx src/domains/social/components/share-button.tsx src/domains/social/components/interaction-bar.tsx
git commit -m "feat: add interaction UI — like button, save with folders, share link, interaction bar"
```

---

### Task 6: Create comment thread component

**Files:**
- Create: `src/domains/social/components/comment-form.tsx`
- Create: `src/domains/social/components/comment-thread.tsx`

- [ ] **Step 1: Create comment form**

Create `src/domains/social/components/comment-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface CommentFormProps {
  postId: number;
  parentId?: number | null;
  onSuccess?: () => void;
  placeholder?: string;
}

export function CommentForm({
  postId,
  parentId = null,
  onSuccess,
  placeholder = "Write a comment...",
}: CommentFormProps) {
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();

  const createMutation = trpc.comment.create.useMutation({
    onSuccess: () => {
      setBody("");
      utils.comment.listByPost.invalidate({ postId });
      if (parentId) {
        utils.comment.replies.invalidate({ commentId: parentId });
      }
      onSuccess?.();
    },
  });

  return (
    <div className="flex gap-2">
      <textarea
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
      />
      <Button
        size="sm"
        onClick={() =>
          createMutation.mutate({ postId, parentId, body })
        }
        disabled={!body.trim() || createMutation.isPending}
      >
        {parentId ? "Reply" : "Comment"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create comment thread**

Create `src/domains/social/components/comment-thread.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";
import { CommentForm } from "./comment-form";
import Link from "next/link";

interface CommentThreadProps {
  postId: number;
}

export function CommentThread({ postId }: CommentThreadProps) {
  const { data: comments, isLoading } = trpc.comment.listByPost.useQuery({ postId });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading comments...</p>;
  }

  return (
    <div className="space-y-4" id="comments">
      <h3 className="font-semibold">
        Comments ({comments?.length ?? 0})
      </h3>

      <CommentForm postId={postId} />

      <div className="space-y-4">
        {comments?.map((comment) => (
          <TopLevelComment
            key={comment.id}
            comment={comment}
            postId={postId}
          />
        ))}
      </div>
    </div>
  );
}

function TopLevelComment({
  comment,
  postId,
}: {
  comment: {
    id: number;
    body: string;
    createdAt: Date;
    replyCount: number;
    authorUsername: string | null;
    authorDisplayName: string | null;
    authorAvatarUrl: string | null;
  };
  postId: number;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const authorName = comment.authorDisplayName ?? comment.authorUsername ?? "Anonymous";

  return (
    <div className="space-y-2">
      {/* Comment body */}
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
          {authorName[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/users/${comment.authorUsername}`}
              className="text-sm font-medium hover:underline"
            >
              {authorName}
            </Link>
            <span className="text-xs text-muted-foreground">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm mt-1">{comment.body}</p>

          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              Reply
            </Button>

            {comment.replyCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => setShowReplies(!showReplies)}
              >
                {showReplies ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Reply form */}
      {showReplyForm && (
        <div className="ml-10">
          <CommentForm
            postId={postId}
            parentId={comment.id}
            placeholder="Write a reply..."
            onSuccess={() => {
              setShowReplyForm(false);
              setShowReplies(true);
            }}
          />
        </div>
      )}

      {/* Replies */}
      {showReplies && <RepliesList commentId={comment.id} />}
    </div>
  );
}

function RepliesList({ commentId }: { commentId: number }) {
  const { data: replies, isLoading } = trpc.comment.replies.useQuery({ commentId });

  if (isLoading) {
    return <p className="ml-10 text-xs text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="ml-10 space-y-3">
      {replies?.map((reply) => {
        const name = reply.authorDisplayName ?? reply.authorUsername ?? "Anonymous";
        return (
          <div key={reply.id} className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
              {name[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/users/${reply.authorUsername}`}
                  className="text-xs font-medium hover:underline"
                >
                  {name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {new Date(reply.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm mt-0.5">{reply.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/components/comment-form.tsx src/domains/social/components/comment-thread.tsx
git commit -m "feat: add YouTube-style comment thread with collapsible replies"
```

---

### Task 7: Wire interactions into post card and post page

**Files:**
- Modify: `src/domains/social/components/post-card.tsx`
- Modify: `src/app/posts/[id]/page.tsx`

- [ ] **Step 1: Add interaction bar to post card**

Update `src/domains/social/components/post-card.tsx` to import and render `InteractionBar` inside `CardContent` after the link block. Pass `postId={post.id}` and `userId={null}` (the post card doesn't know the current user — we'll make this a prop or use a context later).

- [ ] **Step 2: Add comment thread to post page**

Update `src/app/posts/[id]/page.tsx` to import and render `CommentThread` at the bottom of the page:

```tsx
import { CommentThread } from "@/domains/social/components/comment-thread";
```

Add after the article body:

```tsx
<div className="mt-8">
  <CommentThread postId={post.id} />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/components/post-card.tsx src/app/posts/\[id\]/page.tsx
git commit -m "feat: wire interaction bar into post cards and comment thread into post page"
```

---

### Task 8: Create saved posts page

**Files:**
- Create: `src/app/saved/page.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Create saved posts page**

```bash
mkdir -p src/app/saved
```

Create `src/app/saved/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { PostCard } from "@/domains/social/components/post-card";

export default function SavedPostsPage() {
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const { data: foldersData } = trpc.save.folders.useQuery();
  const { data: savedPosts } = trpc.save.postsInFolder.useQuery({
    folderId: activeFolderId,
  });

  const utils = trpc.useUtils();
  const deleteFolderMutation = trpc.save.deleteFolder.useMutation({
    onSuccess: () => {
      utils.save.folders.invalidate();
      setActiveFolderId(null);
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Saved Posts</h1>

      <div className="flex gap-6">
        {/* Folder sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            className={`w-full text-left px-3 py-2 rounded text-sm ${
              activeFolderId === null ? "bg-muted font-medium" : "hover:bg-muted/50"
            }`}
            onClick={() => setActiveFolderId(null)}
          >
            All Saved ({foldersData?.allSavedCount ?? 0})
          </button>

          {foldersData?.folders.map((folder) => (
            <div key={folder.id} className="flex items-center group">
              <button
                className={`flex-1 text-left px-3 py-2 rounded text-sm ${
                  activeFolderId === folder.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                }`}
                onClick={() => setActiveFolderId(folder.id)}
              >
                {folder.name} ({folder.postCount})
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => deleteFolderMutation.mutate({ folderId: folder.id })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Post list */}
        <div className="flex-1 space-y-4">
          {savedPosts && savedPosts.length > 0 ? (
            savedPosts.map((saved) => (
              <PostCard
                key={saved.savedPostId}
                post={{
                  id: saved.postId,
                  type: saved.type as "routine_share" | "article",
                  title: saved.title,
                  body: saved.body,
                  publishedAt: saved.publishedAt,
                  authorUsername: saved.authorUsername,
                  authorDisplayName: saved.authorDisplayName,
                  authorAvatarUrl: saved.authorAvatarUrl,
                }}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No saved posts in this folder.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Protect saved route**

In `src/middleware.ts`, add `"/saved(.*)"` to the protected routes matcher.

- [ ] **Step 3: Commit**

```bash
git add src/app/saved/ src/middleware.ts
git commit -m "feat: add saved posts page with folder sidebar and folder management"
```

---

### Task 9: Verify build and test

- [ ] **Step 1: Run build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 3: Manual verification**

Run `pnpm dev` and verify:
- Like button toggles and updates count
- Comments can be posted and appear immediately
- Replies show under the correct parent comment and can be collapsed
- Save button opens folder dropdown, posts can be saved to multiple folders
- `/saved` page shows saved posts with folder filtering
- Share button copies link to clipboard

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 3 — likes, comments, saves, and sharing"
```
