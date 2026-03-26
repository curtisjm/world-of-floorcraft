# Phase 2: Posts & Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the post system (routine shares + articles with Tiptap WYSIWYG editor), a two-tab feed (Following + Explore), cursor-based pagination, visibility enforcement, and draft/publish workflows.

**Architecture:** New `posts` table in social domain. Tiptap editor for article authoring with HTML storage (sanitized via DOMPurify on render). Feed queries use cursor-based pagination on `(publishedAt, id)`. Routine shares reference existing routines by ID. Visibility filtering checks follow relationships and org membership (org checks stubbed until Phase 4).

**Tech Stack:** Tiptap (ProseMirror), DOMPurify, Drizzle ORM, tRPC v11, Next.js App Router

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Data Model > posts", "Feed System", "Markdown Editor", "Routines: Publishing Model"

**Depends on:** Phase 1 (profiles & follows) must be complete.

---

## File Structure

```
src/
  domains/
    social/
      schema.ts              ← add posts table
      routers/
        post.ts              ← NEW: create, update, delete, get posts
        feed.ts              ← NEW: following feed, explore feed with cursor pagination
      components/
        editor/
          tiptap-editor.tsx  ← NEW: Tiptap WYSIWYG editor component
          toolbar.tsx        ← NEW: editor toolbar (bold, italic, headings, etc.)
        post-card.tsx        ← NEW: post card for feed display
        feed.tsx             ← NEW: feed component with Following/Explore tabs
        article-renderer.tsx ← NEW: sanitized HTML rendering for articles
    routines/
      routers/
        routine.ts           ← add togglePublished mutation
  app/
    feed/
      page.tsx               ← NEW: main feed page
    posts/
      new/
        page.tsx             ← NEW: article creation page
      [id]/
        page.tsx             ← NEW: single post view
        edit/
          page.tsx           ← NEW: edit article
```

---

## Tasks

### Task 1: Install Tiptap and sanitization dependencies

- [ ] **Step 1: Install packages**

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/pm @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-image dompurify
pnpm add -D @types/dompurify
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add Tiptap editor and DOMPurify sanitization dependencies"
```

---

### Task 2: Add posts table to social schema

**Files:**
- Modify: `src/domains/social/schema.ts`

- [ ] **Step 1: Add post enums and table**

In `src/domains/social/schema.ts`, add after the existing follows code:

```typescript
export const postTypeEnum = pgEnum("post_type", [
  "routine_share",
  "article",
]);

export const visibilityEnum = pgEnum("visibility", [
  "public",
  "followers",
  "organization",
]);

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: text("author_id").references(() => users.id),
    orgId: integer("org_id"),  // FK added in Phase 4 when orgs table exists
    type: postTypeEnum("type").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    visibilityOrgId: integer("visibility_org_id"),  // FK added in Phase 4
    title: text("title"),
    body: text("body"),
    routineId: integer("routine_id"),  // FK to routines — cross-domain reference
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    authorIdx: index("posts_author_idx").on(table.authorId),
    typeIdx: index("posts_type_idx").on(table.type),
    publishedIdx: index("posts_published_idx").on(table.publishedAt),
    visibilityPublishedIdx: index("posts_visibility_published_idx").on(
      table.visibility,
      table.publishedAt
    ),
  })
);
```

Also add the required imports at the top (`integer`, `timestamp`, `index`, etc.) if not already present.

- [ ] **Step 2: Push schema**

Run: `pnpm db:push`
Expected: `posts` table created.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/schema.ts
git commit -m "feat: add posts table with type, visibility, and publication tracking"
```

---

### Task 3: Create post router

**Files:**
- Create: `src/domains/social/routers/post.ts`
- Modify: `src/shared/auth/routers.ts`

- [ ] **Step 1: Create post router**

Create `src/domains/social/routers/post.ts`:

```typescript
import { z } from "zod";
import { and, eq, desc, isNull, isNotNull } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { posts } from "@/domains/social/schema";

export const postRouter = router({
  /** Get a single post by ID. */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [post] = await db
        .select({
          id: posts.id,
          authorId: posts.authorId,
          type: posts.type,
          visibility: posts.visibility,
          title: posts.title,
          body: posts.body,
          routineId: posts.routineId,
          publishedAt: posts.publishedAt,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(eq(posts.id, input.id));
      return post ?? null;
    }),

  /** Create a new article post. */
  createArticle: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        body: z.string(),
        visibility: z.enum(["public", "followers", "organization"]).default("public"),
        publish: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [post] = await db
        .insert(posts)
        .values({
          authorId: ctx.userId,
          type: "article",
          title: input.title,
          body: input.body,
          visibility: input.visibility,
          publishedAt: input.publish ? new Date() : null,
        })
        .returning();
      return post;
    }),

  /** Create a routine share post. */
  createRoutineShare: protectedProcedure
    .input(
      z.object({
        routineId: z.number(),
        body: z.string().max(1000).nullable(),
        visibility: z.enum(["public", "followers", "organization"]).default("public"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [post] = await db
        .insert(posts)
        .values({
          authorId: ctx.userId,
          type: "routine_share",
          body: input.body,
          routineId: input.routineId,
          visibility: input.visibility,
          publishedAt: new Date(),
        })
        .returning();
      return post;
    }),

  /** Update an article (draft or published). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().optional(),
        visibility: z.enum(["public", "followers", "organization"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [post] = await db
        .update(posts)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(posts.id, id), eq(posts.authorId, ctx.userId)))
        .returning();
      return post ?? null;
    }),

  /** Publish a draft article. */
  publish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [post] = await db
        .update(posts)
        .set({ publishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(posts.id, input.id), eq(posts.authorId, ctx.userId)))
        .returning();
      return post ?? null;
    }),

  /** Delete a post. */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(posts)
        .where(and(eq(posts.id, input.id), eq(posts.authorId, ctx.userId)));
      return { success: true };
    }),

  /** List current user's drafts. */
  myDrafts: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.authorId, ctx.userId),
          eq(posts.type, "article"),
          isNull(posts.publishedAt)
        )
      )
      .orderBy(desc(posts.updatedAt));
  }),
});
```

- [ ] **Step 2: Register post router**

In `src/shared/auth/routers.ts`, add:

```typescript
import { postRouter } from "@/domains/social/routers/post";
```

And add `post: postRouter` to the router object.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/post.ts src/shared/auth/routers.ts
git commit -m "feat: add post router with article/routine-share CRUD and draft management"
```

---

### Task 4: Create feed router

**Files:**
- Create: `src/domains/social/routers/feed.ts`
- Modify: `src/shared/auth/routers.ts`

- [ ] **Step 1: Create feed router with cursor pagination**

Create `src/domains/social/routers/feed.ts`:

```typescript
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { posts, follows } from "@/domains/social/schema";

const FEED_PAGE_SIZE = 20;

const cursorInput = z.object({
  cursor: z
    .object({
      publishedAt: z.string(), // ISO date string
      id: z.number(),
    })
    .nullable()
    .optional(),
  limit: z.number().min(1).max(50).default(FEED_PAGE_SIZE),
});

export const feedRouter = router({
  /** Following feed: posts from users you follow, newest first. */
  following: protectedProcedure
    .input(cursorInput)
    .query(async ({ ctx, input }) => {
      // Get IDs of users the current user follows
      const followedUsers = await db
        .select({ followingId: follows.followingId })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, ctx.userId),
            eq(follows.status, "active")
          )
        );

      const followedIds = followedUsers.map((f) => f.followingId);

      if (followedIds.length === 0) {
        return { posts: [], nextCursor: null };
      }

      // Build cursor condition
      const cursorCondition = input.cursor
        ? or(
            lt(posts.publishedAt, new Date(input.cursor.publishedAt)),
            and(
              eq(posts.publishedAt, new Date(input.cursor.publishedAt)),
              lt(posts.id, input.cursor.id)
            )
          )
        : undefined;

      const feedPosts = await db
        .select({
          id: posts.id,
          authorId: posts.authorId,
          type: posts.type,
          visibility: posts.visibility,
          title: posts.title,
          body: posts.body,
          routineId: posts.routineId,
          publishedAt: posts.publishedAt,
          createdAt: posts.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(
          and(
            inArray(posts.authorId, followedIds),
            isNotNull(posts.publishedAt),
            // Show public and followers-only posts from followed users
            // Org-only visibility check stubbed — completed in Phase 4
            or(
              eq(posts.visibility, "public"),
              eq(posts.visibility, "followers")
            ),
            cursorCondition
          )
        )
        .orderBy(desc(posts.publishedAt), desc(posts.id))
        .limit(input.limit + 1);

      const hasMore = feedPosts.length > input.limit;
      const results = hasMore ? feedPosts.slice(0, input.limit) : feedPosts;
      const lastPost = results[results.length - 1];

      return {
        posts: results,
        nextCursor: hasMore && lastPost?.publishedAt
          ? { publishedAt: lastPost.publishedAt.toISOString(), id: lastPost.id }
          : null,
      };
    }),

  /** Explore feed: recent public posts from anyone. */
  explore: publicProcedure
    .input(cursorInput)
    .query(async ({ input }) => {
      const cursorCondition = input.cursor
        ? or(
            lt(posts.publishedAt, new Date(input.cursor.publishedAt)),
            and(
              eq(posts.publishedAt, new Date(input.cursor.publishedAt)),
              lt(posts.id, input.cursor.id)
            )
          )
        : undefined;

      const feedPosts = await db
        .select({
          id: posts.id,
          authorId: posts.authorId,
          type: posts.type,
          visibility: posts.visibility,
          title: posts.title,
          body: posts.body,
          routineId: posts.routineId,
          publishedAt: posts.publishedAt,
          createdAt: posts.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(
          and(
            eq(posts.visibility, "public"),
            isNotNull(posts.publishedAt),
            cursorCondition
          )
        )
        .orderBy(desc(posts.publishedAt), desc(posts.id))
        .limit(input.limit + 1);

      const hasMore = feedPosts.length > input.limit;
      const results = hasMore ? feedPosts.slice(0, input.limit) : feedPosts;
      const lastPost = results[results.length - 1];

      return {
        posts: results,
        nextCursor: hasMore && lastPost?.publishedAt
          ? { publishedAt: lastPost.publishedAt.toISOString(), id: lastPost.id }
          : null,
      };
    }),
});
```

- [ ] **Step 2: Register feed router**

In `src/shared/auth/routers.ts`, add `feedRouter` import and `feed: feedRouter` to the router object.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/feed.ts src/shared/auth/routers.ts
git commit -m "feat: add feed router with cursor-paginated following and explore feeds"
```

---

### Task 5: Create Tiptap editor component

**Files:**
- Create: `src/domains/social/components/editor/toolbar.tsx`
- Create: `src/domains/social/components/editor/tiptap-editor.tsx`

- [ ] **Step 1: Create editor toolbar**

```bash
mkdir -p src/domains/social/components/editor
```

Create `src/domains/social/components/editor/toolbar.tsx`:

```tsx
"use client";

import { type Editor } from "@tiptap/react";
import { Button } from "@shared/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Minus,
  Image,
} from "lucide-react";

interface ToolbarProps {
  editor: Editor | null;
}

export function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const tools = [
    {
      icon: Bold,
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
      label: "Bold",
    },
    {
      icon: Italic,
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
      label: "Italic",
    },
    {
      icon: Strikethrough,
      action: () => editor.chain().focus().toggleStrike().run(),
      active: editor.isActive("strike"),
      label: "Strikethrough",
    },
    { divider: true as const },
    {
      icon: Heading1,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive("heading", { level: 1 }),
      label: "Heading 1",
    },
    {
      icon: Heading2,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive("heading", { level: 2 }),
      label: "Heading 2",
    },
    {
      icon: Heading3,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive("heading", { level: 3 }),
      label: "Heading 3",
    },
    { divider: true as const },
    {
      icon: List,
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
      label: "Bullet List",
    },
    {
      icon: ListOrdered,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
      label: "Ordered List",
    },
    {
      icon: Quote,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive("blockquote"),
      label: "Blockquote",
    },
    {
      icon: Code,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive("codeBlock"),
      label: "Code Block",
    },
    {
      icon: Minus,
      action: () => editor.chain().focus().setHorizontalRule().run(),
      active: false,
      label: "Horizontal Rule",
    },
    {
      icon: Link,
      action: () => {
        const url = window.prompt("Enter URL:");
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
      },
      active: editor.isActive("link"),
      label: "Link",
    },
    {
      icon: Image,
      action: () => {
        const url = window.prompt("Enter image URL:");
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      },
      active: false,
      label: "Image",
    },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-border p-2">
      {tools.map((tool, i) => {
        if ("divider" in tool) {
          return (
            <div key={i} className="w-px h-6 bg-border mx-1 self-center" />
          );
        }
        const Icon = tool.icon;
        return (
          <Button
            key={tool.label}
            type="button"
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${tool.active ? "bg-muted" : ""}`}
            onClick={tool.action}
            title={tool.label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create Tiptap editor component**

Create `src/domains/social/components/editor/tiptap-editor.tsx`:

```tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import ImageExtension from "@tiptap/extension-image";
import { Toolbar } from "./toolbar";

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = "Write something...",
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-400 underline",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full",
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm max-w-none min-h-[300px] px-4 py-3 focus:outline-none",
      },
    },
  });

  return (
    <div className="border border-input rounded-md overflow-hidden">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

Note: Tiptap stores content as HTML. The editor itself only produces well-formed HTML from its own schema (users cannot inject arbitrary HTML through the editor UI). On render, we additionally sanitize with DOMPurify as defense-in-depth.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/components/editor/
git commit -m "feat: add Tiptap WYSIWYG editor with toolbar and image/link support"
```

---

### Task 6: Create post card and article renderer components

**Files:**
- Create: `src/domains/social/components/post-card.tsx`
- Create: `src/domains/social/components/article-renderer.tsx`

- [ ] **Step 1: Create article renderer with DOMPurify sanitization**

Create `src/domains/social/components/article-renderer.tsx`:

```tsx
"use client";

import DOMPurify from "dompurify";

interface ArticleRendererProps {
  html: string;
}

export function ArticleRenderer({ html }: ArticleRendererProps) {
  const sanitizedHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "p", "br", "strong", "em", "s", "del",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "a", "img", "hr",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "target", "rel"],
  });

  return (
    <div
      className="prose prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
```

- [ ] **Step 2: Create post card**

Create `src/domains/social/components/post-card.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";

interface PostCardProps {
  post: {
    id: number;
    type: "routine_share" | "article";
    title: string | null;
    body: string | null;
    publishedAt: Date | null;
    authorUsername: string | null;
    authorDisplayName: string | null;
    authorAvatarUrl: string | null;
  };
}

export function PostCard({ post }: PostCardProps) {
  const authorName = post.authorDisplayName ?? post.authorUsername ?? "Anonymous";
  const isArticle = post.type === "article";

  // Strip HTML tags for preview text
  const preview = post.body
    ? post.body.replace(/<[^>]*>/g, "").slice(0, 200)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          {/* Author avatar */}
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
            {post.authorAvatarUrl ? (
              <img
                src={post.authorAvatarUrl}
                alt={authorName}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              authorName[0]?.toUpperCase() ?? "?"
            )}
          </div>

          <div className="flex-1 min-w-0">
            <Link
              href={`/users/${post.authorUsername}`}
              className="text-sm font-medium hover:underline"
            >
              {authorName}
            </Link>
            {post.publishedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(post.publishedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <Badge variant="secondary" className="text-xs">
            {isArticle ? "Article" : "Routine"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <Link href={`/posts/${post.id}`} className="block">
          {post.title && (
            <h3 className="font-semibold mb-1 hover:underline">{post.title}</h3>
          )}
          {preview && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {preview}
            </p>
          )}
        </Link>

        {/* Interaction bar — likes/comments/save added in Phase 3 */}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/components/post-card.tsx src/domains/social/components/article-renderer.tsx
git commit -m "feat: add post card and sanitized article renderer components"
```

---

### Task 7: Create feed page

**Files:**
- Create: `src/domains/social/components/feed.tsx`
- Create: `src/app/feed/page.tsx`
- Modify: `src/app/layout.tsx` (add Feed nav link)

- [ ] **Step 1: Create feed component**

Create `src/domains/social/components/feed.tsx`:

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { PostCard } from "./post-card";

export function Feed() {
  const [activeTab, setActiveTab] = useState<"following" | "explore">("following");

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "following" | "explore")}>
      <TabsList>
        <TabsTrigger value="following">Following</TabsTrigger>
        <TabsTrigger value="explore">Explore</TabsTrigger>
      </TabsList>

      <TabsContent value="following" className="mt-4">
        <FollowingFeed />
      </TabsContent>

      <TabsContent value="explore" className="mt-4">
        <ExploreFeed />
      </TabsContent>
    </Tabs>
  );
}

function FollowingFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.feed.following.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }

  if (allPosts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No posts yet. Follow other dancers to see their posts here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {allPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}

function ExploreFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.feed.explore.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }

  if (allPosts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No public posts yet. Be the first to share something!
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {allPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create feed page**

```bash
mkdir -p src/app/feed
```

Create `src/app/feed/page.tsx`:

```tsx
import { Feed } from "@/domains/social/components/feed";

export default function FeedPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Feed</h1>
      <Feed />
    </div>
  );
}
```

- [ ] **Step 3: Add Feed to navigation**

In `src/app/layout.tsx`, add a Feed link in the nav after "Dances" and before "Routines":

```tsx
<Link
  href="/feed"
  className="text-muted-foreground hover:text-foreground transition-colors"
>
  Feed
</Link>
```

- [ ] **Step 4: Commit**

```bash
git add src/domains/social/components/feed.tsx src/app/feed/ src/app/layout.tsx
git commit -m "feat: add feed page with Following and Explore tabs and cursor pagination"
```

---

### Task 8: Create article write/edit pages

**Files:**
- Create: `src/domains/social/components/article-editor.tsx`
- Create: `src/app/posts/new/page.tsx`
- Create: `src/app/posts/[id]/page.tsx`
- Create: `src/app/posts/[id]/edit/page.tsx`
- Modify: `src/middleware.ts` (protect write routes)

- [ ] **Step 1: Create article editor page component**

Create `src/domains/social/components/article-editor.tsx`:

```tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { trpc } from "@shared/lib/trpc";
import { TiptapEditor } from "./editor/tiptap-editor";

interface ArticleEditorProps {
  existingPost?: {
    id: number;
    title: string | null;
    body: string | null;
    visibility: "public" | "followers" | "organization";
    publishedAt: Date | null;
  };
}

export function ArticleEditor({ existingPost }: ArticleEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(existingPost?.title ?? "");
  const [body, setBody] = useState(existingPost?.body ?? "");
  const [visibility, setVisibility] = useState<"public" | "followers" | "organization">(
    existingPost?.visibility ?? "public"
  );

  const createMutation = trpc.post.createArticle.useMutation({
    onSuccess: (post) => {
      router.push(`/posts/${post.id}`);
    },
  });

  const updateMutation = trpc.post.update.useMutation();
  const publishMutation = trpc.post.publish.useMutation({
    onSuccess: (post) => {
      if (post) router.push(`/posts/${post.id}`);
    },
  });

  // Auto-save for existing drafts (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const autoSave = useCallback(() => {
    if (!existingPost) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateMutation.mutate({
        id: existingPost.id,
        title: title || undefined,
        body: body || undefined,
        visibility,
      });
    }, 2000);
  }, [existingPost, title, body, visibility, updateMutation]);

  useEffect(() => {
    autoSave();
    return () => clearTimeout(saveTimeoutRef.current);
  }, [title, body, visibility, autoSave]);

  const handleSaveDraft = () => {
    if (existingPost) {
      updateMutation.mutate({
        id: existingPost.id,
        title: title || undefined,
        body: body || undefined,
        visibility,
      });
    } else {
      createMutation.mutate({ title, body, visibility, publish: false });
    }
  };

  const handlePublish = () => {
    if (existingPost) {
      publishMutation.mutate({ id: existingPost.id });
    } else {
      createMutation.mutate({ title, body, visibility, publish: true });
    }
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending || publishMutation.isPending;
  const isPublished = !!existingPost?.publishedAt;

  return (
    <div className="space-y-6">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Article title"
        className="text-xl font-bold border-none px-0 focus-visible:ring-0"
      />

      <TiptapEditor
        content={body}
        onChange={setBody}
        placeholder="Start writing your article..."
      />

      <div className="flex items-center gap-4">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        >
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
          <option value="organization">Organization only</option>
        </select>

        {!isPublished && (
          <Button variant="outline" onClick={handleSaveDraft} disabled={isPending}>
            Save Draft
          </Button>
        )}

        <Button onClick={handlePublish} disabled={isPending || !title}>
          {isPublished ? "Update" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create new article page**

```bash
mkdir -p src/app/posts/new
```

Create `src/app/posts/new/page.tsx`:

```tsx
import { ArticleEditor } from "@/domains/social/components/article-editor";

export default function NewArticlePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Write Article</h1>
      <ArticleEditor />
    </div>
  );
}
```

- [ ] **Step 3: Create post view page**

```bash
mkdir -p "src/app/posts/[id]"
```

Create `src/app/posts/[id]/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@shared/db";
import { users } from "@shared/schema";
import { posts } from "@/domains/social/schema";
import { ArticleRenderer } from "@/domains/social/components/article-renderer";
import { Badge } from "@shared/ui/badge";
import Link from "next/link";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [post] = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      type: posts.type,
      title: posts.title,
      body: posts.body,
      routineId: posts.routineId,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, parseInt(id, 10)));

  if (!post) notFound();

  const authorName = post.authorDisplayName ?? post.authorUsername ?? "Anonymous";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/users/${post.authorUsername}`}
          className="text-sm font-medium hover:underline"
        >
          {authorName}
        </Link>
        {post.publishedAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(post.publishedAt).toLocaleDateString()}
          </span>
        )}
        <Badge variant="secondary" className="text-xs">
          {post.type === "article" ? "Article" : "Routine Share"}
        </Badge>
      </div>

      {post.title && <h1 className="text-3xl font-bold mb-6">{post.title}</h1>}

      {post.body && <ArticleRenderer html={post.body} />}

      {/* Comments section added in Phase 3 */}
    </div>
  );
}
```

- [ ] **Step 4: Create edit page**

```bash
mkdir -p "src/app/posts/[id]/edit"
```

Create `src/app/posts/[id]/edit/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { ArticleEditor } from "@/domains/social/components/article-editor";

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: post, isLoading } = trpc.post.get.useQuery({
    id: parseInt(id, 10),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Edit Article</h1>
      <ArticleEditor
        existingPost={{
          id: post.id,
          title: post.title,
          body: post.body,
          visibility: post.visibility as "public" | "followers" | "organization",
          publishedAt: post.publishedAt,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Protect write routes**

In `src/middleware.ts`, update:

```typescript
const isProtectedRoute = createRouteMatcher([
  "/routines(.*)",
  "/settings(.*)",
  "/posts/new",
  "/posts/(.*)/edit",
]);
```

- [ ] **Step 6: Commit**

```bash
git add src/domains/social/components/article-editor.tsx src/app/posts/ src/middleware.ts
git commit -m "feat: add article write, view, and edit pages with Tiptap editor and auto-save"
```

---

### Task 9: Add routine publish toggle

**Files:**
- Modify: `src/domains/routines/routers/routine.ts`

- [ ] **Step 1: Add togglePublished mutation**

In `src/domains/routines/routers/routine.ts`, add a new procedure after the `update` procedure:

```typescript
togglePublished: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const [routine] = await db
      .select({ id: routines.id, isPublished: routines.isPublished })
      .from(routines)
      .where(
        and(eq(routines.id, input.id), eq(routines.userId, ctx.userId))
      );

    if (!routine) return null;

    const [updated] = await db
      .update(routines)
      .set({
        isPublished: !routine.isPublished,
        updatedAt: new Date(),
      })
      .where(eq(routines.id, input.id))
      .returning();

    return updated;
  }),
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/routines/routers/routine.ts
git commit -m "feat: add routine togglePublished mutation for profile visibility"
```

---

### Task 10: Verify build and test

- [ ] **Step 1: Run build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 3: Manual verification**

Run `pnpm dev` and verify:
- `/feed` shows Following and Explore tabs
- `/posts/new` shows article editor with toolbar when signed in
- Writing and publishing an article works
- Published article appears on the Explore feed
- Post view page renders article content safely (DOMPurify sanitization)
- Edit page loads with existing content
- Routine publish toggle works

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 2 — posts, feed, and Tiptap article editor"
```
