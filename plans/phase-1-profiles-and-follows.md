# Phase 1: User Profiles & Follows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the user model with profile fields (display name, username, bio, competition level, privacy) and build a follow system with pending state for private accounts. Create user profile pages with posts and routines tabs (content stubs for now).

**Architecture:** New columns on the existing `users` table, a new `follows` table, a new `competitionLevel` enum in `shared/db/enums.ts`. Profile pages at `/users/[username]`. Follow/unfollow via tRPC mutations. Profile settings page for editing profile and privacy.

**Tech Stack:** Drizzle ORM, tRPC v11, Clerk, Next.js App Router, shadcn/ui

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Shared: Users Table (Extended)", "User Profiles", "Social Domain > follows"

**Depends on:** Phase 0 (codebase restructure) must be complete.

---

## File Structure

```
src/
  shared/
    db/
      enums.ts               ← add competitionLevelEnum
    schema.ts                ← extend users table with profile fields
  domains/
    social/
      schema.ts              ← NEW: follows table
      routers/
        follow.ts            ← NEW: follow/unfollow/accept/decline procedures
        profile.ts           ← NEW: getProfile, updateProfile, getFollowers, getFollowing
      components/
        profile-header.tsx   ← NEW: avatar, name, bio, levels, follow button
        follow-button.tsx    ← NEW: Follow/Unfollow/Requested/Accept states
        profile-settings.tsx ← NEW: edit profile form
      app/                   ← (pages go in src/app/users/ — see below)
  app/
    users/
      [username]/
        page.tsx             ← NEW: profile page with tabs
    settings/
      profile/
        page.tsx             ← NEW: edit profile page
```

---

## Tasks

### Task 1: Add competition level enum and extend users schema

**Files:**
- Modify: `src/shared/db/enums.ts`
- Modify: `src/shared/schema.ts`

- [ ] **Step 1: Add competition level enum**

In `src/shared/db/enums.ts`, add:

```typescript
export const competitionLevelEnum = pgEnum("competition_level", [
  "newcomer",
  "bronze",
  "silver",
  "gold",
  "novice",
  "prechamp",
  "champ",
  "professional",
]);
```

- [ ] **Step 2: Extend users table**

In `src/shared/schema.ts`, update to:

```typescript
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { competitionLevelEnum } from "./db/enums";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  competitionLevel: competitionLevelEnum("competition_level"),
  competitionLevelHigh: competitionLevelEnum("competition_level_high"),
  isPrivate: boolean("is_private").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Note: `username`, `displayName`, `avatarUrl`, `bio`, `competitionLevel`, and `competitionLevelHigh` are all nullable — users fill these in after first sign-in.

- [ ] **Step 3: Push schema changes**

Run: `pnpm db:push`
Expected: Schema changes applied successfully. Existing user rows get null for new columns.

- [ ] **Step 4: Commit**

```bash
git add src/shared/db/enums.ts src/shared/schema.ts
git commit -m "feat: add competition level enum and extend users table with profile fields

Add username, displayName, avatarUrl, bio, competitionLevel,
competitionLevelHigh, and isPrivate to users table."
```

---

### Task 2: Create follows schema

**Files:**
- Create: `src/domains/social/schema.ts`

- [ ] **Step 1: Create social domain directory**

```bash
mkdir -p src/domains/social/{routers,components}
```

- [ ] **Step 2: Create follows table**

Create `src/domains/social/schema.ts`:

```typescript
import {
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "@shared/schema";

export const followStatusEnum = pgEnum("follow_status", [
  "active",
  "pending",
]);

export const follows = pgTable(
  "follows",
  {
    id: serial("id").primaryKey(),
    followerId: text("follower_id")
      .references(() => users.id)
      .notNull(),
    followingId: text("following_id")
      .references(() => users.id)
      .notNull(),
    status: followStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    followerIdx: index("follows_follower_idx").on(table.followerId),
    followingIdx: index("follows_following_idx").on(table.followingId),
    uniqueFollow: uniqueIndex("follows_unique_idx").on(
      table.followerId,
      table.followingId
    ),
  })
);
```

- [ ] **Step 3: Add social schema to drizzle config**

In `drizzle.config.ts`, add `"./src/domains/social/schema.ts"` to the `schema` array.

- [ ] **Step 4: Push schema**

Run: `pnpm db:push`
Expected: `follows` table created.

- [ ] **Step 5: Commit**

```bash
git add src/domains/social/schema.ts drizzle.config.ts
git commit -m "feat: add follows table with status enum for follow requests"
```

---

### Task 3: Create follow router

**Files:**
- Create: `src/domains/social/routers/follow.ts`

- [ ] **Step 1: Create follow router**

Create `src/domains/social/routers/follow.ts`:

```typescript
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { follows } from "@/domains/social/schema";

export const followRouter = router({
  /** Follow a user. Returns the follow status ('active' or 'pending'). */
  follow: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId === input.targetUserId) {
        return { error: "cannot_follow_self" as const };
      }

      // Check if already following
      const [existing] = await db
        .select({ id: follows.id, status: follows.status })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, ctx.userId),
            eq(follows.followingId, input.targetUserId)
          )
        );

      if (existing) {
        return { status: existing.status };
      }

      // Check if target account is private
      const [target] = await db
        .select({ isPrivate: users.isPrivate })
        .from(users)
        .where(eq(users.id, input.targetUserId));

      if (!target) {
        return { error: "user_not_found" as const };
      }

      const status = target.isPrivate ? "pending" : "active";

      await db.insert(follows).values({
        followerId: ctx.userId,
        followingId: input.targetUserId,
        status,
      });

      return { status };
    }),

  /** Unfollow a user (or cancel a pending request). */
  unfollow: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, ctx.userId),
            eq(follows.followingId, input.targetUserId)
          )
        );
      return { success: true };
    }),

  /** Accept a follow request (only the followed user can do this). */
  acceptRequest: protectedProcedure
    .input(z.object({ followerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(follows)
        .set({ status: "active" })
        .where(
          and(
            eq(follows.followerId, input.followerId),
            eq(follows.followingId, ctx.userId),
            eq(follows.status, "pending")
          )
        )
        .returning();
      return { success: !!updated };
    }),

  /** Decline a follow request (deletes it). */
  declineRequest: protectedProcedure
    .input(z.object({ followerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, input.followerId),
            eq(follows.followingId, ctx.userId),
            eq(follows.status, "pending")
          )
        );
      return { success: true };
    }),

  /** Get pending follow requests for the current user. */
  pendingRequests: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: follows.id,
        followerId: follows.followerId,
        followerUsername: users.username,
        followerDisplayName: users.displayName,
        followerAvatarUrl: users.avatarUrl,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(
        and(
          eq(follows.followingId, ctx.userId),
          eq(follows.status, "pending")
        )
      );
  }),

  /** Get the follow relationship between current user and target. */
  status: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [outgoing] = await db
        .select({ status: follows.status })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, ctx.userId),
            eq(follows.followingId, input.targetUserId)
          )
        );

      const [incoming] = await db
        .select({ status: follows.status })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, input.targetUserId),
            eq(follows.followingId, ctx.userId)
          )
        );

      return {
        following: outgoing?.status ?? null,
        followedBy: incoming?.status ?? null,
      };
    }),
});
```

- [ ] **Step 2: Register follow router in appRouter**

In `src/shared/auth/routers.ts`, add:

```typescript
import { followRouter } from "@/domains/social/routers/follow";
```

And add to the router object:

```typescript
export const appRouter = router({
  dance: danceRouter,
  figure: figureRouter,
  routine: routineRouter,
  follow: followRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/follow.ts src/shared/auth/routers.ts
git commit -m "feat: add follow router with follow/unfollow/accept/decline procedures"
```

---

### Task 4: Create profile router

**Files:**
- Create: `src/domains/social/routers/profile.ts`
- Modify: `src/shared/auth/routers.ts`

- [ ] **Step 1: Create profile router**

Create `src/domains/social/routers/profile.ts`:

```typescript
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { follows } from "@/domains/social/schema";

const COMPETITION_LEVELS = [
  "newcomer", "bronze", "silver", "gold",
  "novice", "prechamp", "champ", "professional",
] as const;

export const profileRouter = router({
  /** Get a public profile by username. */
  getByUsername: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          bio: users.bio,
          competitionLevel: users.competitionLevel,
          competitionLevelHigh: users.competitionLevelHigh,
          isPrivate: users.isPrivate,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.username, input.username));

      if (!user) return null;

      // Count followers and following
      const [followerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(
          and(
            eq(follows.followingId, user.id),
            eq(follows.status, "active")
          )
        );

      const [followingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, user.id),
            eq(follows.status, "active")
          )
        );

      return {
        ...user,
        followerCount: followerCount?.count ?? 0,
        followingCount: followingCount?.count ?? 0,
      };
    }),

  /** Get the current user's own profile for editing. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.userId));
    return user ?? null;
  }),

  /** Update the current user's profile. */
  update: protectedProcedure
    .input(
      z.object({
        username: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric or underscores")
          .optional(),
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).nullable().optional(),
        competitionLevel: z.enum(COMPETITION_LEVELS).nullable().optional(),
        competitionLevelHigh: z.enum(COMPETITION_LEVELS).nullable().optional(),
        isPrivate: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate competition level range if both are set
      if (input.competitionLevel && input.competitionLevelHigh) {
        const lowIdx = COMPETITION_LEVELS.indexOf(input.competitionLevel);
        const highIdx = COMPETITION_LEVELS.indexOf(input.competitionLevelHigh);
        if (highIdx !== lowIdx + 1) {
          return { error: "levels_must_be_consecutive" as const };
        }
        if (input.competitionLevel === "professional") {
          return { error: "professional_must_be_standalone" as const };
        }
      }

      // Check username uniqueness if changing
      if (input.username) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, input.username));
        if (existing && existing.id !== ctx.userId) {
          return { error: "username_taken" as const };
        }
      }

      const [updated] = await db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId))
        .returning();

      return { user: updated };
    }),

  /** Get followers of a user. */
  followers: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(follows)
        .innerJoin(users, eq(follows.followerId, users.id))
        .where(
          and(
            eq(follows.followingId, input.userId),
            eq(follows.status, "active")
          )
        );
    }),

  /** Get users that a user is following. */
  following: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(follows)
        .innerJoin(users, eq(follows.followingId, users.id))
        .where(
          and(
            eq(follows.followerId, input.userId),
            eq(follows.status, "active")
          )
        );
    }),
});
```

- [ ] **Step 2: Register profile router**

In `src/shared/auth/routers.ts`, add:

```typescript
import { profileRouter } from "@/domains/social/routers/profile";
```

And add `profile: profileRouter` to the router object.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/profile.ts src/shared/auth/routers.ts
git commit -m "feat: add profile router with getByUsername, update, followers, following"
```

---

### Task 5: Create follow button component

**Files:**
- Create: `src/domains/social/components/follow-button.tsx`

- [ ] **Step 1: Create follow button**

Create `src/domains/social/components/follow-button.tsx`:

```tsx
"use client";

import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface FollowButtonProps {
  targetUserId: string;
  isOwnProfile: boolean;
}

export function FollowButton({ targetUserId, isOwnProfile }: FollowButtonProps) {
  const utils = trpc.useUtils();

  const { data: followStatus, isLoading } = trpc.follow.status.useQuery(
    { targetUserId },
    { enabled: !isOwnProfile }
  );

  const followMutation = trpc.follow.follow.useMutation({
    onSuccess: () => {
      utils.follow.status.invalidate({ targetUserId });
    },
  });

  const unfollowMutation = trpc.follow.unfollow.useMutation({
    onSuccess: () => {
      utils.follow.status.invalidate({ targetUserId });
    },
  });

  if (isOwnProfile || isLoading) return null;

  const currentStatus = followStatus?.following;

  if (currentStatus === "active") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => unfollowMutation.mutate({ targetUserId })}
        disabled={unfollowMutation.isPending}
      >
        Following
      </Button>
    );
  }

  if (currentStatus === "pending") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => unfollowMutation.mutate({ targetUserId })}
        disabled={unfollowMutation.isPending}
      >
        Requested
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => followMutation.mutate({ targetUserId })}
      disabled={followMutation.isPending}
    >
      Follow
    </Button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/social/components/follow-button.tsx
git commit -m "feat: add follow button component with follow/unfollow/requested states"
```

---

### Task 6: Create profile header component

**Files:**
- Create: `src/domains/social/components/profile-header.tsx`

- [ ] **Step 1: Create profile header**

Create `src/domains/social/components/profile-header.tsx`:

```tsx
"use client";

import { Badge } from "@shared/ui/badge";
import { FollowButton } from "./follow-button";

const LEVEL_LABELS: Record<string, string> = {
  newcomer: "Newcomer",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  novice: "Novice",
  prechamp: "Pre-Champ",
  champ: "Champ",
  professional: "Professional",
};

interface ProfileHeaderProps {
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    competitionLevel: string | null;
    competitionLevelHigh: string | null;
    isPrivate: boolean;
    followerCount: number;
    followingCount: number;
  };
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: ProfileHeaderProps) {
  const levelDisplay = user.competitionLevel
    ? user.competitionLevelHigh
      ? `${LEVEL_LABELS[user.competitionLevel]}/${LEVEL_LABELS[user.competitionLevelHigh]}`
      : LEVEL_LABELS[user.competitionLevel]
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground shrink-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName ?? user.username ?? ""}
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            (user.displayName?.[0] ?? user.username?.[0] ?? "?").toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold truncate">
              {user.displayName ?? user.username ?? "Anonymous"}
            </h1>
            <FollowButton targetUserId={user.id} isOwnProfile={isOwnProfile} />
          </div>

          {user.username && (
            <p className="text-muted-foreground">@{user.username}</p>
          )}

          <div className="flex items-center gap-4 mt-2 text-sm">
            <span>
              <span className="font-semibold">{user.followerCount}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </span>
            <span>
              <span className="font-semibold">{user.followingCount}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bio and badges */}
      <div className="flex flex-col gap-2">
        {user.bio && <p className="text-sm">{user.bio}</p>}
        {levelDisplay && (
          <Badge variant="secondary" className="w-fit">
            {levelDisplay}
          </Badge>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/social/components/profile-header.tsx
git commit -m "feat: add profile header component with avatar, bio, level badge, follow counts"
```

---

### Task 7: Create user profile page

**Files:**
- Create: `src/app/users/[username]/page.tsx`

- [ ] **Step 1: Create profile page directory**

```bash
mkdir -p src/app/users/\[username\]
```

- [ ] **Step 2: Create profile page**

Create `src/app/users/[username]/page.tsx`:

```tsx
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { getDb } from "@shared/db";
import { users } from "@shared/schema";
import { follows } from "@/domains/social/schema";
import { routines } from "@routines/schema";
import { ProfileHeader } from "@/domains/social/components/profile-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { sql } from "drizzle-orm";
import Link from "next/link";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const db = getDb();
  const { userId: currentUserId } = await auth();

  // Fetch user by username
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));

  if (!user) notFound();

  const isOwnProfile = currentUserId === user.id;

  // Follower/following counts
  const [followerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(
      and(eq(follows.followingId, user.id), eq(follows.status, "active"))
    );

  const [followingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(
      and(eq(follows.followerId, user.id), eq(follows.status, "active"))
    );

  // Check if current user can see content (for private accounts)
  let canViewContent = !user.isPrivate || isOwnProfile;
  if (!canViewContent && currentUserId) {
    const [followRelation] = await db
      .select({ status: follows.status })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, currentUserId),
          eq(follows.followingId, user.id)
        )
      );
    canViewContent = followRelation?.status === "active";
  }

  // Fetch published routines (if visible)
  const userRoutines = canViewContent
    ? await db
        .select()
        .from(routines)
        .where(
          and(
            eq(routines.userId, user.id),
            eq(routines.isPublished, true)
          )
        )
        .orderBy(asc(routines.createdAt))
    : [];

  const profileData = {
    ...user,
    followerCount: followerCount?.count ?? 0,
    followingCount: followingCount?.count ?? 0,
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <ProfileHeader user={profileData} isOwnProfile={isOwnProfile} />

      {canViewContent ? (
        <Tabs defaultValue="posts" className="mt-8">
          <TabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="routines">
              Routines ({userRoutines.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4">
            <p className="text-muted-foreground text-sm">
              No posts yet.
            </p>
          </TabsContent>

          <TabsContent value="routines" className="mt-4">
            {userRoutines.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No published routines.
              </p>
            ) : (
              <div className="space-y-3">
                {userRoutines.map((routine) => (
                  <Card key={routine.id}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {routine.name}
                      </CardTitle>
                      {routine.description && (
                        <CardDescription>
                          {routine.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mt-8 text-center text-muted-foreground">
          <p>This account is private.</p>
          <p className="text-sm mt-1">Follow this user to see their posts and routines.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/users/
git commit -m "feat: add user profile page with posts/routines tabs and private account handling"
```

---

### Task 8: Create profile settings page

**Files:**
- Create: `src/domains/social/components/profile-settings.tsx`
- Create: `src/app/settings/profile/page.tsx`
- Modify: `src/middleware.ts` (protect settings routes)

- [ ] **Step 1: Create profile settings form component**

Create `src/domains/social/components/profile-settings.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { trpc } from "@shared/lib/trpc";

const COMPETITION_LEVELS = [
  { value: "newcomer", label: "Newcomer" },
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "novice", label: "Novice" },
  { value: "prechamp", label: "Pre-Champ" },
  { value: "champ", label: "Champ" },
  { value: "professional", label: "Professional" },
] as const;

export function ProfileSettings() {
  const { data: profile, isLoading } = trpc.profile.me.useQuery();
  const utils = trpc.useUtils();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [level, setLevel] = useState<string>("");
  const [levelHigh, setLevelHigh] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize form from profile data
  if (profile && !initialized) {
    setUsername(profile.username ?? "");
    setDisplayName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setLevel(profile.competitionLevel ?? "");
    setLevelHigh(profile.competitionLevelHigh ?? "");
    setIsPrivate(profile.isPrivate);
    setInitialized(true);
  }

  const updateMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      utils.profile.me.invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      username: username || undefined,
      displayName: displayName || undefined,
      bio: bio || null,
      competitionLevel: (level as typeof COMPETITION_LEVELS[number]["value"]) || null,
      competitionLevelHigh: (levelHigh as typeof COMPETITION_LEVELS[number]["value"]) || null,
      isPrivate,
    });
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  // Find consecutive level options for levelHigh
  const levelIdx = COMPETITION_LEVELS.findIndex((l) => l.value === level);
  const canSelectRange =
    level && level !== "professional" && levelIdx < COMPETITION_LEVELS.length - 1;
  const nextLevel = canSelectRange ? COMPETITION_LEVELS[levelIdx + 1] : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div className="space-y-2">
        <label className="text-sm font-medium">Username</label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Display Name</label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Bio</label>
        <textarea
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself"
          rows={3}
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Competition Level</label>
        <select
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setLevelHigh("");
          }}
        >
          <option value="">Not set</option>
          {COMPETITION_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {canSelectRange && nextLevel && (
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Also competing at {nextLevel.label}?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={levelHigh === nextLevel.value}
              onChange={(e) =>
                setLevelHigh(e.target.checked ? nextLevel.value : "")
              }
            />
            Yes, I compete at {COMPETITION_LEVELS.find((l) => l.value === level)?.label}/{nextLevel.label}
          </label>
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <span>Private account (followers must be approved)</span>
        </label>
      </div>

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? "Saving..." : "Save Profile"}
      </Button>

      {updateMutation.data && "error" in updateMutation.data && (
        <p className="text-sm text-red-500">
          {updateMutation.data.error === "username_taken"
            ? "That username is already taken."
            : updateMutation.data.error === "levels_must_be_consecutive"
            ? "Competition levels must be consecutive."
            : "An error occurred."}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Create settings page**

```bash
mkdir -p src/app/settings/profile
```

Create `src/app/settings/profile/page.tsx`:

```tsx
import { ProfileSettings } from "@/domains/social/components/profile-settings";

export default function ProfileSettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
      <ProfileSettings />
    </div>
  );
}
```

- [ ] **Step 3: Protect settings routes in middleware**

In `src/middleware.ts`, update the route matcher:

```typescript
const isProtectedRoute = createRouteMatcher([
  "/routines(.*)",
  "/settings(.*)",
]);
```

- [ ] **Step 4: Add nav link to settings**

In `src/app/layout.tsx`, inside the `<SignedIn>` block, add a settings link before the `<UserButton />`:

```tsx
<SignedIn>
  <Link
    href="/settings/profile"
    className="text-muted-foreground hover:text-foreground transition-colors"
  >
    Settings
  </Link>
  <UserButton />
</SignedIn>
```

- [ ] **Step 5: Commit**

```bash
git add src/domains/social/components/profile-settings.tsx src/app/settings/ src/middleware.ts src/app/layout.tsx
git commit -m "feat: add profile settings page with competition level, privacy, and bio editing"
```

---

### Task 9: Verify build and test manually

- [ ] **Step 1: Run build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 3: Manual verification**

Run `pnpm dev` and verify:
- `/settings/profile` shows the settings form when signed in, redirects when not
- Filling in username and saving works
- Navigating to `/users/{username}` shows the profile
- Follow button appears on other users' profiles
- Private account toggle works (follow becomes "Requested")

- [ ] **Step 4: Commit verification**

```bash
git add -A
git commit -m "feat: complete Phase 1 — user profiles and follow system"
```
