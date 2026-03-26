# Phase 5: Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app notifications triggered by social interactions (likes, comments, follows, org events). Bell icon in header with unread badge, dropdown panel grouped by time period, notification aggregation for high-activity posts.

**Architecture:** New `notifications` table in `shared/` (cross-domain). Notification creation happens as a side effect of existing mutations (like, comment, follow, org join, etc.) via a shared `createNotification()` helper. Client polls for unread count. Future: email/push delivery channels.

**Tech Stack:** Drizzle ORM, tRPC v11, Next.js App Router, shadcn/ui

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Notifications"

**Depends on:** Phase 3 (interactions) and Phase 4 (organizations) must be complete.

---

## File Structure

```
src/
  shared/
    schema.ts                    ← add notifications table (cross-domain)
    db/
      enums.ts                   ← add notificationTypeEnum
  domains/
    social/
      routers/
        notification.ts          ← NEW: list notifications, mark read, unread count
      lib/
        notify.ts                ← NEW: createNotification() helper with aggregation logic
      components/
        notification-bell.tsx    ← NEW: bell icon with unread count badge
        notification-panel.tsx   ← NEW: dropdown panel with grouped notifications
        notification-item.tsx    ← NEW: single notification row with icon and text
      routers/
        like.ts                  ← MODIFY: add notification on like
        comment.ts               ← MODIFY: add notification on comment/reply
    social/
      routers/
        follow.ts                ← MODIFY: add notification on follow/accept
    orgs/
      routers/
        membership.ts            ← MODIFY: notify on join request approved
        invite.ts                ← MODIFY: notify on invite
        join-request.ts          ← MODIFY: notify admins on new request
        org-post.ts              ← MODIFY: notify members on new org post
```

---

## Tasks

### Task 1: Add notification enum and table

**Files:**
- Modify: `src/shared/db/enums.ts`
- Modify: `src/shared/schema.ts`

- [ ] **Step 1: Add notification type enum**

In `src/shared/db/enums.ts`:

```typescript
export const notificationTypeEnum = pgEnum("notification_type", [
  "like",
  "comment",
  "reply",
  "follow",
  "follow_request",
  "follow_accepted",
  "message",
  "org_invite",
  "join_request",
  "join_approved",
  "org_post",
]);
```

- [ ] **Step 2: Add notifications table to shared schema**

In `src/shared/schema.ts`, add:

```typescript
import { notificationTypeEnum } from "@shared/db/enums";

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: notificationTypeEnum("type").notNull(),
    actorId: text("actor_id").references(() => users.id),
    postId: integer("post_id"),
    commentId: integer("comment_id"),
    orgId: integer("org_id"),
    conversationId: integer("conversation_id"),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userUnreadIdx: index("notifications_user_unread_idx").on(
      table.userId,
      table.read,
      table.createdAt
    ),
  })
);
```

- [ ] **Step 3: Run migration**

Run: `npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: Migration creates notifications table with enum and index.

- [ ] **Step 4: Commit**

```bash
git add src/shared/db/enums.ts src/shared/schema.ts drizzle/
git commit -m "feat(notifications): add notifications table and type enum"
```

---

### Task 2: Create notification helper

**Files:**
- Create: `src/domains/social/lib/notify.ts`

- [ ] **Step 1: Create createNotification helper with aggregation**

```typescript
import { db } from "@shared/db";
import { notifications } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

interface NotifyParams {
  userId: string;
  type: typeof notifications.$inferInsert.type;
  actorId?: string;
  postId?: number;
  commentId?: number;
  orgId?: number;
  conversationId?: number;
}

// Aggregation window: 1 hour
const AGGREGATION_WINDOW_MS = 60 * 60 * 1000;

// Types that should be aggregated (multiple likes on same post → one notification)
const AGGREGATABLE_TYPES = new Set(["like", "comment"]);

/**
 * Create a notification. For aggregatable types (like, comment),
 * checks if a recent notification of the same type and target exists
 * and skips creation to avoid spam. The UI handles "and N others" display.
 *
 * Does not notify the user about their own actions (actorId === userId).
 */
export async function createNotification(params: NotifyParams) {
  // Never notify yourself
  if (params.actorId && params.actorId === params.userId) return;

  // Check aggregation for supported types
  if (AGGREGATABLE_TYPES.has(params.type) && params.postId) {
    const windowStart = new Date(Date.now() - AGGREGATION_WINDOW_MS);

    const existing = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, params.userId),
        eq(notifications.type, params.type),
        eq(notifications.postId, params.postId),
        gte(notifications.createdAt, windowStart)
      ),
    });

    if (existing) {
      // Recent notification exists for this type+target — skip to avoid spam
      // The count of actors is derived at display time
      return;
    }
  }

  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    actorId: params.actorId,
    postId: params.postId,
    commentId: params.commentId,
    orgId: params.orgId,
    conversationId: params.conversationId,
  });
}

/**
 * Create notifications for multiple users (e.g., all org members).
 */
export async function createBulkNotifications(
  userIds: string[],
  params: Omit<NotifyParams, "userId">
) {
  const rows = userIds
    .filter((uid) => uid !== params.actorId) // Don't notify the actor
    .map((userId) => ({
      userId,
      type: params.type,
      actorId: params.actorId,
      postId: params.postId,
      commentId: params.commentId,
      orgId: params.orgId,
      conversationId: params.conversationId,
    }));

  if (rows.length === 0) return;

  await db.insert(notifications).values(rows);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/social/lib/notify.ts
git commit -m "feat(notifications): add createNotification helper with aggregation logic"
```

---

### Task 3: Notification router

**Files:**
- Create: `src/domains/social/routers/notification.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create notification router**

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { notifications, users } from "@shared/schema";
import { eq, and, desc, lt, sql } from "drizzle-orm";

export const notificationRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(notifications.userId, ctx.userId)];
      if (input.cursor) {
        conditions.push(lt(notifications.id, input.cursor));
      }

      const results = await db
        .select({
          notification: notifications,
          actor: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(notifications)
        .leftJoin(users, eq(notifications.actorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      if (hasMore) results.pop();

      return {
        notifications: results,
        nextCursor: hasMore ? results[results.length - 1].notification.id : undefined,
      };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.read, false)
        )
      );

    return result.count;
  }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            eq(notifications.userId, ctx.userId)
          )
        );

      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.read, false)
        )
      );

    return { success: true };
  }),
});
```

- [ ] **Step 2: Register notification router**

In `src/server/routers/index.ts`:

```typescript
import { notificationRouter } from "@social/routers/notification";

export const appRouter = router({
  // ...existing
  notification: notificationRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/notification.ts src/server/routers/index.ts
git commit -m "feat(notifications): add notification router with list, unread count, mark read"
```

---

### Task 4: Add notification triggers to existing routers

**Files:**
- Modify: `src/domains/social/routers/like.ts`
- Modify: `src/domains/social/routers/comment.ts`
- Modify: `src/domains/social/routers/follow.ts`
- Modify: `src/domains/orgs/routers/invite.ts`
- Modify: `src/domains/orgs/routers/join-request.ts`
- Modify: `src/domains/orgs/routers/org-post.ts`

- [ ] **Step 1: Add notification on like**

In `src/domains/social/routers/like.ts`, after the like is toggled ON (inserted), add:

```typescript
import { createNotification } from "@social/lib/notify";
import { posts, comments } from "@social/schema";

// After inserting a like on a post:
if (input.postId) {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, input.postId),
    columns: { authorId: true },
  });
  if (post?.authorId) {
    await createNotification({
      userId: post.authorId,
      type: "like",
      actorId: ctx.userId,
      postId: input.postId,
    });
  }
}

// After inserting a like on a comment:
if (input.commentId) {
  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, input.commentId),
    columns: { authorId: true },
  });
  if (comment?.authorId) {
    await createNotification({
      userId: comment.authorId,
      type: "like",
      actorId: ctx.userId,
      commentId: input.commentId,
    });
  }
}
```

- [ ] **Step 2: Add notification on comment and reply**

In `src/domains/social/routers/comment.ts`, after creating a comment:

```typescript
import { createNotification } from "@social/lib/notify";

// After inserting a top-level comment:
if (!input.parentId) {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, input.postId),
    columns: { authorId: true },
  });
  if (post?.authorId) {
    await createNotification({
      userId: post.authorId,
      type: "comment",
      actorId: ctx.userId,
      postId: input.postId,
      commentId: newComment.id,
    });
  }
}

// After inserting a reply:
if (input.parentId) {
  const parentComment = await db.query.comments.findFirst({
    where: eq(comments.id, input.parentId),
    columns: { authorId: true },
  });
  if (parentComment?.authorId) {
    await createNotification({
      userId: parentComment.authorId,
      type: "reply",
      actorId: ctx.userId,
      postId: input.postId,
      commentId: newComment.id,
    });
  }
}
```

- [ ] **Step 3: Add notification on follow and follow accept**

In `src/domains/social/routers/follow.ts`:

```typescript
import { createNotification } from "@social/lib/notify";

// After creating an active follow (public account):
await createNotification({
  userId: input.followingId,
  type: "follow",
  actorId: ctx.userId,
});

// After creating a pending follow (private account):
await createNotification({
  userId: input.followingId,
  type: "follow_request",
  actorId: ctx.userId,
});

// After accepting a follow request:
await createNotification({
  userId: followRecord.followerId,
  type: "follow_accepted",
  actorId: ctx.userId,
});
```

- [ ] **Step 4: Add notification on org invite**

In `src/domains/orgs/routers/invite.ts`, after `sendInvite`:

```typescript
import { createNotification } from "@social/lib/notify";

await createNotification({
  userId: input.invitedUserId,
  type: "org_invite",
  actorId: ctx.userId,
  orgId: input.orgId,
});
```

- [ ] **Step 5: Add notification on join request and approval**

In `src/domains/orgs/routers/join-request.ts`:

After `request` mutation — notify all admins:

```typescript
import { createBulkNotifications } from "@social/lib/notify";
import { memberships } from "@orgs/schema";

// Get admin user IDs
const admins = await db
  .select({ userId: memberships.userId })
  .from(memberships)
  .where(and(eq(memberships.orgId, input.orgId), eq(memberships.role, "admin")));

await createBulkNotifications(
  admins.map((a) => a.userId),
  {
    type: "join_request",
    actorId: ctx.userId,
    orgId: input.orgId,
  }
);
```

After `approve` mutation:

```typescript
import { createNotification } from "@social/lib/notify";

await createNotification({
  userId: request.userId,
  type: "join_approved",
  actorId: ctx.userId,
  orgId: request.orgId,
});
```

- [ ] **Step 6: Add notification on org post**

In `src/domains/orgs/routers/org-post.ts`, after creating a published org post:

```typescript
import { createBulkNotifications } from "@social/lib/notify";
import { memberships } from "@orgs/schema";

if (input.publish) {
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.orgId, input.orgId));

  await createBulkNotifications(
    members.map((m) => m.userId),
    {
      type: "org_post",
      actorId: ctx.userId,
      postId: post.id,
      orgId: input.orgId,
    }
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/domains/social/routers/like.ts src/domains/social/routers/comment.ts src/domains/social/routers/follow.ts src/domains/orgs/routers/invite.ts src/domains/orgs/routers/join-request.ts src/domains/orgs/routers/org-post.ts
git commit -m "feat(notifications): add notification triggers to like, comment, follow, and org routers"
```

---

### Task 5: Notification bell component

**Files:**
- Create: `src/domains/social/components/notification-bell.tsx`

- [ ] **Step 1: Create bell icon with unread badge**

```tsx
"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";
import { NotificationPanel } from "./notification-panel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui/popover";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000, // Poll every 30 seconds
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
              {unreadCount! > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/social/components/notification-bell.tsx
git commit -m "feat(notifications): add notification bell component with unread badge"
```

---

### Task 6: Notification panel and item components

**Files:**
- Create: `src/domains/social/components/notification-panel.tsx`
- Create: `src/domains/social/components/notification-item.tsx`

- [ ] **Step 1: Create notification item component**

```tsx
"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Heart, MessageCircle, Reply, UserPlus, UserCheck, Mail, Building2, Users, Bell } from "lucide-react";
import { cn } from "@shared/lib/utils";

const NOTIFICATION_CONFIG: Record<
  string,
  { icon: typeof Heart; text: (actor: string) => string; getHref: (n: NotificationData) => string }
> = {
  like: {
    icon: Heart,
    text: (actor) => `${actor} liked your post`,
    getHref: (n) => `/posts/${n.postId}`,
  },
  comment: {
    icon: MessageCircle,
    text: (actor) => `${actor} commented on your post`,
    getHref: (n) => `/posts/${n.postId}`,
  },
  reply: {
    icon: Reply,
    text: (actor) => `${actor} replied to your comment`,
    getHref: (n) => `/posts/${n.postId}`,
  },
  follow: {
    icon: UserPlus,
    text: (actor) => `${actor} started following you`,
    getHref: (n) => `/users/${n.actorUsername}`,
  },
  follow_request: {
    icon: UserPlus,
    text: (actor) => `${actor} requested to follow you`,
    getHref: () => `/settings/profile`,
  },
  follow_accepted: {
    icon: UserCheck,
    text: (actor) => `${actor} accepted your follow request`,
    getHref: (n) => `/users/${n.actorUsername}`,
  },
  message: {
    icon: Mail,
    text: (actor) => `${actor} sent you a message`,
    getHref: (n) => `/messages/${n.conversationId}`,
  },
  org_invite: {
    icon: Building2,
    text: () => `You've been invited to join an organization`,
    getHref: () => `/settings/profile`,
  },
  join_request: {
    icon: Users,
    text: (actor) => `${actor} requested to join your organization`,
    getHref: (n) => `/orgs/${n.orgId}`,
  },
  join_approved: {
    icon: UserCheck,
    text: () => `You've been accepted into an organization`,
    getHref: (n) => `/orgs/${n.orgId}`,
  },
  org_post: {
    icon: Bell,
    text: () => `Your organization published a new post`,
    getHref: (n) => `/posts/${n.postId}`,
  },
};

interface NotificationData {
  postId: number | null;
  commentId: number | null;
  orgId: number | null;
  conversationId: number | null;
  actorUsername?: string;
}

interface NotificationItemProps {
  notification: {
    id: number;
    type: string;
    read: boolean;
    createdAt: string;
    postId: number | null;
    commentId: number | null;
    orgId: number | null;
    conversationId: number | null;
  };
  actor: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null;
  onRead: (id: number) => void;
}

export function NotificationItem({ notification, actor, onRead }: NotificationItemProps) {
  const config = NOTIFICATION_CONFIG[notification.type];
  if (!config) return null;

  const Icon = config.icon;
  const actorName = actor?.displayName ?? actor?.username ?? "Someone";
  const href = config.getHref({
    ...notification,
    actorUsername: actor?.username ?? undefined,
  });

  return (
    <Link
      href={href}
      onClick={() => {
        if (!notification.read) onRead(notification.id);
      }}
      className={cn(
        "flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors",
        !notification.read && "bg-accent/20"
      )}
    >
      <Avatar className="h-8 w-8 mt-0.5">
        <AvatarImage src={actor?.avatarUrl ?? undefined} />
        <AvatarFallback>
          <Icon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{config.text(actorName)}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.read && (
        <span className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
      )}
    </Link>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
```

- [ ] **Step 2: Create notification panel component**

```tsx
"use client";

import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { NotificationItem } from "./notification-item";
import { ScrollArea } from "@shared/ui/scroll-area";

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const utils = trpc.useUtils();
  const { data, isLoading, fetchNextPage, hasNextPage } =
    trpc.notification.list.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const allNotifications = data?.pages.flatMap((p) => p.notifications) ?? [];

  // Group by time period
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const today = allNotifications.filter(
    (n) => new Date(n.notification.createdAt) >= todayStart
  );
  const thisWeek = allNotifications.filter((n) => {
    const d = new Date(n.notification.createdAt);
    return d >= weekStart && d < todayStart;
  });
  const earlier = allNotifications.filter(
    (n) => new Date(n.notification.createdAt) < weekStart
  );

  return (
    <div className="flex flex-col max-h-[500px]">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold">Notifications</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
        >
          Mark all read
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && <p className="p-4 text-muted-foreground text-sm">Loading...</p>}

        {allNotifications.length === 0 && !isLoading && (
          <p className="p-4 text-muted-foreground text-sm text-center">No notifications yet</p>
        )}

        {today.length > 0 && (
          <div>
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
              Today
            </p>
            {today.map((n) => (
              <NotificationItem
                key={n.notification.id}
                notification={n.notification}
                actor={n.actor}
                onRead={(id) => markReadMutation.mutate({ notificationId: id })}
              />
            ))}
          </div>
        )}

        {thisWeek.length > 0 && (
          <div>
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
              This Week
            </p>
            {thisWeek.map((n) => (
              <NotificationItem
                key={n.notification.id}
                notification={n.notification}
                actor={n.actor}
                onRead={(id) => markReadMutation.mutate({ notificationId: id })}
              />
            ))}
          </div>
        )}

        {earlier.length > 0 && (
          <div>
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
              Earlier
            </p>
            {earlier.map((n) => (
              <NotificationItem
                key={n.notification.id}
                notification={n.notification}
                actor={n.actor}
                onRead={(id) => markReadMutation.mutate({ notificationId: id })}
              />
            ))}
          </div>
        )}

        {hasNextPage && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/components/notification-panel.tsx src/domains/social/components/notification-item.tsx
git commit -m "feat(notifications): add notification panel and item components with time grouping"
```

---

### Task 7: Add notification bell to header

**Files:**
- Modify: `src/app/layout.tsx` (or `src/shared/components/nav.tsx`)

- [ ] **Step 1: Add NotificationBell to the header nav**

Import and render the `NotificationBell` component next to the user button, only when the user is signed in:

```tsx
import { NotificationBell } from "@social/components/notification-bell";

// In the nav bar, next to <UserButton />:
<SignedIn>
  <NotificationBell />
  <UserButton />
</SignedIn>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(notifications): add notification bell to site header"
```
