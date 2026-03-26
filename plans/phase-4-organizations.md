# Phase 4: Organizations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organizations with configurable membership models (open/invite/request), role management (owner/admin/member), org profile pages, org posting, org-only post visibility enforcement, and ownership transfer.

**Architecture:** New `orgs` domain with `organizations`, `memberships`, `org_invites`, `join_requests` tables. Org profile pages at `/orgs/[slug]`. Org posting creates posts with `orgId` set and `authorId` null. Org-only visibility filter from Phase 2 is completed by joining against memberships.

**Tech Stack:** Drizzle ORM, tRPC v11, Next.js App Router, shadcn/ui, nanoid (for invite tokens)

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Organizations", "Orgs Domain", "Org Posting", "Org Channels"

**Depends on:** Phase 2 (posts & feed) must be complete. Phase 3 (interactions) recommended but not required.

---

## File Structure

```
src/
  shared/
    db/
      enums.ts                   ← add membershipModelEnum, orgRoleEnum, inviteStatusEnum, joinRequestStatusEnum
  domains/
    orgs/
      schema.ts                  ← NEW: organizations, memberships, org_invites, join_requests tables
      routers/
        org.ts                   ← NEW: create/update/delete org, get by slug, list user orgs
        membership.ts            ← NEW: join, leave, kick, update role, transfer ownership
        invite.ts                ← NEW: create invite, accept/decline, generate invite link
        join-request.ts          ← NEW: request to join, approve/reject, list pending
        org-post.ts              ← NEW: create/list posts as org
      components/
        org-card.tsx             ← NEW: org preview card for listings
        org-header.tsx           ← NEW: org profile header with name, avatar, member count
        membership-button.tsx    ← NEW: contextual Join/Request/Pending/Member button
        member-list.tsx          ← NEW: member listing with role badges
        org-settings.tsx         ← NEW: org settings form (name, description, membership model)
        invite-manager.tsx       ← NEW: admin UI for sending invites and managing invite links
        join-request-list.tsx    ← NEW: admin UI for approving/rejecting join requests
        org-post-form.tsx        ← NEW: post creation form for org posts
  app/
    orgs/
      page.tsx                   ← NEW: browse/discover organizations
      create/
        page.tsx                 ← NEW: create organization form
      [slug]/
        page.tsx                 ← NEW: org profile page with tabs (Posts, Members, About)
        settings/
          page.tsx               ← NEW: org settings (owner/admin only)
```

---

## Tasks

### Task 1: Add org enums and schema tables

**Files:**
- Modify: `src/shared/db/enums.ts`
- Create: `src/domains/orgs/schema.ts`

- [ ] **Step 1: Add enums to shared/db/enums.ts**

```typescript
export const membershipModelEnum = pgEnum("membership_model", [
  "open",
  "invite",
  "request",
]);

export const orgRoleEnum = pgEnum("org_role", ["member", "admin"]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);

export const joinRequestStatusEnum = pgEnum("join_request_status", [
  "pending",
  "approved",
  "rejected",
]);
```

- [ ] **Step 2: Create orgs/schema.ts with all four tables**

```typescript
import { pgTable, serial, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "@shared/schema";
import {
  membershipModelEnum,
  orgRoleEnum,
  inviteStatusEnum,
  joinRequestStatusEnum,
} from "@shared/db/enums";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  membershipModel: membershipModelEnum("membership_model").notNull().default("open"),
  ownerId: text("owner_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: orgRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("memberships_org_user_idx").on(table.orgId, table.userId),
  })
);

export const orgInvites = pgTable(
  "org_invites",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    invitedUserId: text("invited_user_id").references(() => users.id),
    invitedBy: text("invited_by")
      .references(() => users.id)
      .notNull(),
    token: text("token").unique(),
    status: inviteStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    orgIdx: index("org_invites_org_idx").on(table.orgId),
  })
);

export const joinRequests = pgTable(
  "join_requests",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    status: joinRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => ({
    orgIdx: index("join_requests_org_idx").on(table.orgId),
    orgUserIdx: uniqueIndex("join_requests_org_user_idx").on(table.orgId, table.userId),
  })
);
```

- [ ] **Step 3: Run migration**

Run: `npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: Migration creates organizations, memberships, org_invites, join_requests tables with enums.

- [ ] **Step 4: Commit**

```bash
git add src/shared/db/enums.ts src/domains/orgs/schema.ts drizzle/
git commit -m "feat(orgs): add organization schema tables and enums"
```

---

### Task 2: Org CRUD router

**Files:**
- Create: `src/domains/orgs/routers/org.ts`
- Modify: `src/server/routers/index.ts` (add orgRouter)

- [ ] **Step 1: Create org router with create, getBySlug, update, delete, listUserOrgs**

```typescript
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships } from "@orgs/schema";
import { users } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const orgRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
        description: z.string().max(500).optional(),
        membershipModel: z.enum(["open", "invite", "request"]).default("open"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug ?? slugify(input.name);

      const existing = await db.query.organizations.findFirst({
        where: eq(organizations.slug, slug),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
      }

      const [org] = await db
        .insert(organizations)
        .values({
          name: input.name,
          slug,
          description: input.description,
          membershipModel: input.membershipModel,
          ownerId: ctx.userId,
        })
        .returning();

      // Owner also gets an admin membership row for query simplicity
      await db.insert(memberships).values({
        orgId: org.id,
        userId: ctx.userId,
        role: "admin",
      });

      return org;
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.slug, input.slug),
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const memberCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(memberships)
        .where(eq(memberships.orgId, org.id));

      return { ...org, memberCount: memberCount[0].count };
    }),

  update: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        avatarUrl: z.string().url().optional().nullable(),
        membershipModel: z.enum(["open", "invite", "request"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      // Check owner or admin
      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId),
          eq(memberships.role, "admin")
        ),
      });
      if (!membership && org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Must be admin or owner" });
      }

      const { orgId, ...updates } = input;
      const [updated] = await db
        .update(organizations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      if (org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete the org" });
      }

      await db.delete(organizations).where(eq(organizations.id, input.orgId));
      return { success: true };
    }),

  listUserOrgs: protectedProcedure.query(async ({ ctx }) => {
    const userMemberships = await db
      .select({
        org: organizations,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.orgId, organizations.id))
      .where(eq(memberships.userId, ctx.userId))
      .orderBy(desc(organizations.createdAt));

    return userMemberships;
  }),

  discover: publicProcedure
    .input(
      z.object({
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const orgs = await db
        .select()
        .from(organizations)
        .where(input.cursor ? lt(organizations.id, input.cursor) : undefined)
        .orderBy(desc(organizations.createdAt))
        .limit(input.limit + 1);

      const hasMore = orgs.length > input.limit;
      if (hasMore) orgs.pop();

      return {
        orgs,
        nextCursor: hasMore ? orgs[orgs.length - 1].id : undefined,
      };
    }),
});
```

Note: Add `import { sql, lt } from "drizzle-orm";` at the top.

- [ ] **Step 2: Register org router in the root app router**

In `src/server/routers/index.ts`, add:

```typescript
import { orgRouter } from "@orgs/routers/org";

export const appRouter = router({
  // ...existing routers
  org: orgRouter,
});
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/domains/orgs/routers/org.ts src/server/routers/index.ts
git commit -m "feat(orgs): add org CRUD router with create, update, delete, list, discover"
```

---

### Task 3: Membership router

**Files:**
- Create: `src/domains/orgs/routers/membership.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create membership router**

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships } from "@orgs/schema";
import { users } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

async function requireAdminOrOwner(orgId: number, userId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) throw new TRPCError({ code: "NOT_FOUND" });

  if (org.ownerId === userId) return { org, isOwner: true };

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.orgId, orgId),
      eq(memberships.userId, userId),
      eq(memberships.role, "admin")
    ),
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

  return { org, isOwner: false };
}

export const membershipRouter = router({
  // For "open" membership model — immediate join
  join: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      if (org.membershipModel !== "open") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This org does not allow open joining",
        });
      }

      const existing = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Already a member" });

      const [membership] = await db
        .insert(memberships)
        .values({
          orgId: input.orgId,
          userId: ctx.userId,
          role: "member",
        })
        .returning();

      return membership;
    }),

  leave: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      if (org.ownerId === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Owner cannot leave. Transfer ownership first.",
        });
      }

      await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, ctx.userId)
          )
        );

      return { success: true };
    }),

  kick: protectedProcedure
    .input(z.object({ orgId: z.number(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { org } = await requireAdminOrOwner(input.orgId, ctx.userId);

      if (input.userId === org.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot kick the owner" });
      }

      await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, input.userId)
          )
        );

      return { success: true };
    }),

  updateRole: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        userId: z.string(),
        role: z.enum(["member", "admin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { org } = await requireAdminOrOwner(input.orgId, ctx.userId);

      if (input.userId === org.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change owner's role" });
      }

      const [updated] = await db
        .update(memberships)
        .set({ role: input.role })
        .where(
          and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, input.userId)
          )
        )
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      return updated;
    }),

  transferOwnership: protectedProcedure
    .input(z.object({ orgId: z.number(), newOwnerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      if (org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can transfer ownership" });
      }

      // Verify new owner is an admin member
      const targetMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, input.newOwnerId),
          eq(memberships.role, "admin")
        ),
      });
      if (!targetMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New owner must be an admin",
        });
      }

      // Atomic swap: update org owner, old owner stays admin
      await db
        .update(organizations)
        .set({ ownerId: input.newOwnerId, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId));

      return { success: true };
    }),

  getMyMembership: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      return {
        membership: membership ?? null,
        isOwner: org.ownerId === ctx.userId,
      };
    }),

  listMembers: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const members = await db
        .select({
          membership: memberships,
          user: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.orgId, input.orgId))
        .orderBy(memberships.createdAt);

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      return members.map((m) => ({
        ...m,
        isOwner: org?.ownerId === m.user.id,
      }));
    }),
});
```

- [ ] **Step 2: Register membership router**

In `src/server/routers/index.ts`, add:

```typescript
import { membershipRouter } from "@orgs/routers/membership";

export const appRouter = router({
  // ...existing
  membership: membershipRouter,
});
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/domains/orgs/routers/membership.ts src/server/routers/index.ts
git commit -m "feat(orgs): add membership router with join, leave, kick, role management, ownership transfer"
```

---

### Task 4: Invite router

**Files:**
- Create: `src/domains/orgs/routers/invite.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create invite router**

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships, orgInvites } from "@orgs/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

async function requireAdminOrOwner(orgId: number, userId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) throw new TRPCError({ code: "NOT_FOUND" });
  if (org.ownerId === userId) return org;

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.orgId, orgId),
      eq(memberships.userId, userId),
      eq(memberships.role, "admin")
    ),
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
  return org;
}

export const inviteRouter = router({
  // Send a direct invite to a user
  sendInvite: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        invitedUserId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      // Check if already a member
      const existing = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, input.invitedUserId)
        ),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "User is already a member" });

      // Check if there's already a pending invite
      const pendingInvite = await db.query.orgInvites.findFirst({
        where: and(
          eq(orgInvites.orgId, input.orgId),
          eq(orgInvites.invitedUserId, input.invitedUserId),
          eq(orgInvites.status, "pending")
        ),
      });
      if (pendingInvite) throw new TRPCError({ code: "CONFLICT", message: "Invite already pending" });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      const [invite] = await db
        .insert(orgInvites)
        .values({
          orgId: input.orgId,
          invitedUserId: input.invitedUserId,
          invitedBy: ctx.userId,
          expiresAt,
        })
        .returning();

      return invite;
    }),

  // Generate a shareable invite link
  generateLink: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const token = nanoid(24);

      const [invite] = await db
        .insert(orgInvites)
        .values({
          orgId: input.orgId,
          invitedBy: ctx.userId,
          token,
          expiresAt,
        })
        .returning();

      return { ...invite, token };
    }),

  // Accept an invite (direct or link)
  accept: protectedProcedure
    .input(
      z.object({
        inviteId: z.number().optional(),
        token: z.string().optional(),
      }).refine((d) => d.inviteId || d.token, "Must provide inviteId or token")
    )
    .mutation(async ({ ctx, input }) => {
      let invite;

      if (input.token) {
        invite = await db.query.orgInvites.findFirst({
          where: and(eq(orgInvites.token, input.token), eq(orgInvites.status, "pending")),
        });
      } else {
        invite = await db.query.orgInvites.findFirst({
          where: and(
            eq(orgInvites.id, input.inviteId!),
            eq(orgInvites.invitedUserId, ctx.userId),
            eq(orgInvites.status, "pending")
          ),
        });
      }

      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or expired" });
      if (new Date() > invite.expiresAt) {
        await db
          .update(orgInvites)
          .set({ status: "expired" })
          .where(eq(orgInvites.id, invite.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }

      // Add as member
      await db
        .insert(memberships)
        .values({
          orgId: invite.orgId,
          userId: ctx.userId,
          role: "member",
        })
        .onConflictDoNothing(); // Already a member

      // Mark invite accepted (for direct invites; link invites stay pending for others)
      if (invite.invitedUserId) {
        await db
          .update(orgInvites)
          .set({ status: "accepted" })
          .where(eq(orgInvites.id, invite.id));
      }

      return { success: true };
    }),

  decline: protectedProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(orgInvites)
        .set({ status: "declined" })
        .where(
          and(
            eq(orgInvites.id, input.inviteId),
            eq(orgInvites.invitedUserId, ctx.userId),
            eq(orgInvites.status, "pending")
          )
        );

      return { success: true };
    }),

  // List pending invites for user
  listMyInvites: protectedProcedure.query(async ({ ctx }) => {
    const invites = await db
      .select({
        invite: orgInvites,
        org: {
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          avatarUrl: organizations.avatarUrl,
        },
      })
      .from(orgInvites)
      .innerJoin(organizations, eq(orgInvites.orgId, organizations.id))
      .where(
        and(
          eq(orgInvites.invitedUserId, ctx.userId),
          eq(orgInvites.status, "pending")
        )
      );

    return invites;
  }),
});
```

- [ ] **Step 2: Register invite router and add nanoid dependency**

Run: `npm install nanoid`

In `src/server/routers/index.ts`, add:

```typescript
import { inviteRouter } from "@orgs/routers/invite";

export const appRouter = router({
  // ...existing
  invite: inviteRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/orgs/routers/invite.ts src/server/routers/index.ts package.json package-lock.json
git commit -m "feat(orgs): add invite router with direct invites and shareable invite links"
```

---

### Task 5: Join request router

**Files:**
- Create: `src/domains/orgs/routers/join-request.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create join request router**

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships, joinRequests } from "@orgs/schema";
import { users } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const joinRequestRouter = router({
  request: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      if (org.membershipModel !== "request") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This org does not use request-based membership" });
      }

      // Check if already a member
      const existingMember = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });
      if (existingMember) throw new TRPCError({ code: "CONFLICT", message: "Already a member" });

      // Check for existing pending request
      const existingRequest = await db.query.joinRequests.findFirst({
        where: and(
          eq(joinRequests.orgId, input.orgId),
          eq(joinRequests.userId, ctx.userId),
          eq(joinRequests.status, "pending")
        ),
      });
      if (existingRequest) throw new TRPCError({ code: "CONFLICT", message: "Request already pending" });

      const [request] = await db
        .insert(joinRequests)
        .values({
          orgId: input.orgId,
          userId: ctx.userId,
        })
        .returning();

      return request;
    }),

  approve: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.joinRequests.findFirst({
        where: and(eq(joinRequests.id, input.requestId), eq(joinRequests.status, "pending")),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify caller is admin/owner
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, request.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin =
        org.ownerId === ctx.userId ||
        !!(await db.query.memberships.findFirst({
          where: and(
            eq(memberships.orgId, request.orgId),
            eq(memberships.userId, ctx.userId),
            eq(memberships.role, "admin")
          ),
        }));
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN" });

      // Add member and update request
      await db.insert(memberships).values({
        orgId: request.orgId,
        userId: request.userId,
        role: "member",
      });

      await db
        .update(joinRequests)
        .set({
          status: "approved",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(joinRequests.id, input.requestId));

      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.joinRequests.findFirst({
        where: and(eq(joinRequests.id, input.requestId), eq(joinRequests.status, "pending")),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, request.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin =
        org.ownerId === ctx.userId ||
        !!(await db.query.memberships.findFirst({
          where: and(
            eq(memberships.orgId, request.orgId),
            eq(memberships.userId, ctx.userId),
            eq(memberships.role, "admin")
          ),
        }));
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN" });

      await db
        .update(joinRequests)
        .set({
          status: "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(joinRequests.id, input.requestId));

      return { success: true };
    }),

  // List pending requests for an org (admin view)
  listPending: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin =
        org.ownerId === ctx.userId ||
        !!(await db.query.memberships.findFirst({
          where: and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, ctx.userId),
            eq(memberships.role, "admin")
          ),
        }));
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN" });

      const requests = await db
        .select({
          request: joinRequests,
          user: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(joinRequests)
        .innerJoin(users, eq(joinRequests.userId, users.id))
        .where(
          and(eq(joinRequests.orgId, input.orgId), eq(joinRequests.status, "pending"))
        )
        .orderBy(desc(joinRequests.createdAt));

      return requests;
    }),

  // Get my request status for an org
  getMyRequest: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const request = await db.query.joinRequests.findFirst({
        where: and(
          eq(joinRequests.orgId, input.orgId),
          eq(joinRequests.userId, ctx.userId),
          eq(joinRequests.status, "pending")
        ),
      });
      return request ?? null;
    }),
});
```

- [ ] **Step 2: Register join request router**

In `src/server/routers/index.ts`, add:

```typescript
import { joinRequestRouter } from "@orgs/routers/join-request";

export const appRouter = router({
  // ...existing
  joinRequest: joinRequestRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/orgs/routers/join-request.ts src/server/routers/index.ts
git commit -m "feat(orgs): add join request router with request, approve, reject"
```

---

### Task 6: Org posting router

**Files:**
- Create: `src/domains/orgs/routers/org-post.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create org post router**

```typescript
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships } from "@orgs/schema";
import { posts } from "@social/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const orgPostRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        type: z.enum(["routine_share", "article"]),
        visibility: z.enum(["public", "organization"]),
        title: z.string().optional(),
        body: z.string().optional(),
        routineId: z.number().optional(),
        publish: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is admin or owner
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin =
        org.ownerId === ctx.userId ||
        !!(await db.query.memberships.findFirst({
          where: and(
            eq(memberships.orgId, input.orgId),
            eq(memberships.userId, ctx.userId),
            eq(memberships.role, "admin")
          ),
        }));
      if (!isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can post on behalf of the org" });
      }

      const [post] = await db
        .insert(posts)
        .values({
          authorId: null, // org post, no personal author
          orgId: input.orgId,
          type: input.type,
          visibility: input.visibility,
          visibilityOrgId: input.visibility === "organization" ? input.orgId : null,
          title: input.title,
          body: input.body,
          routineId: input.routineId,
          publishedAt: input.publish ? new Date() : null,
        })
        .returning();

      return post;
    }),

  listByOrg: publicProcedure
    .input(
      z.object({
        orgId: z.number(),
        cursor: z.object({ publishedAt: z.string(), id: z.number() }).optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      // For public viewing, only show published public posts
      // Org-only visibility requires membership check (handled in feed router)
      const results = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.orgId, input.orgId),
            isNotNull(posts.publishedAt),
            eq(posts.visibility, "public")
          )
        )
        .orderBy(desc(posts.publishedAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      if (hasMore) results.pop();

      return {
        posts: results,
        nextCursor: hasMore
          ? {
              publishedAt: results[results.length - 1].publishedAt!.toISOString(),
              id: results[results.length - 1].id,
            }
          : undefined,
      };
    }),
});
```

- [ ] **Step 2: Register org post router**

In `src/server/routers/index.ts`, add:

```typescript
import { orgPostRouter } from "@orgs/routers/org-post";

export const appRouter = router({
  // ...existing
  orgPost: orgPostRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/orgs/routers/org-post.ts src/server/routers/index.ts
git commit -m "feat(orgs): add org posting router for admin-created org posts"
```

---

### Task 7: Complete org-only visibility in feed router

**Files:**
- Modify: `src/domains/social/routers/feed.ts`

- [ ] **Step 1: Update feed following query to include org-only posts**

In the feed router's `following` query, add a condition to include posts where `visibility = 'organization'` AND the viewer shares org membership with the author or the org itself:

```typescript
// Add to the WHERE clause of the following feed query:
// Include org-only posts where the viewer is a member of the visibility org
import { memberships } from "@orgs/schema";

// In the following feed query, add this as an OR condition:
// OR (posts.visibility = 'organization' AND posts.visibilityOrgId IN (
//   SELECT orgId FROM memberships WHERE userId = ctx.userId
// ))

// Concrete implementation: add a subquery for user's org IDs
const userOrgIds = db
  .select({ orgId: memberships.orgId })
  .from(memberships)
  .where(eq(memberships.userId, ctx.userId));

// Add to the existing WHERE conditions with or():
// or(
//   ...existing conditions,
//   and(
//     eq(posts.visibility, "organization"),
//     inArray(posts.visibilityOrgId, userOrgIds)
//   )
// )
```

The exact integration depends on how the feed router query is structured in Phase 2. The key change: add `inArray(posts.visibilityOrgId, userOrgIds)` as an additional OR branch for org-visible posts.

- [ ] **Step 2: Verify the explore feed excludes org-only posts**

The explore feed should already filter to `visibility = 'public'` only. Verify this is the case and no org-only posts leak.

- [ ] **Step 3: Commit**

```bash
git add src/domains/social/routers/feed.ts
git commit -m "feat(orgs): complete org-only visibility enforcement in feed router"
```

---

### Task 8: Org UI components

**Files:**
- Create: `src/domains/orgs/components/org-card.tsx`
- Create: `src/domains/orgs/components/org-header.tsx`
- Create: `src/domains/orgs/components/membership-button.tsx`
- Create: `src/domains/orgs/components/member-list.tsx`

- [ ] **Step 1: Create org card component**

```tsx
"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Card, CardContent } from "@shared/ui/card";

interface OrgCardProps {
  org: {
    slug: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    memberCount?: number;
  };
}

export function OrgCard({ org }: OrgCardProps) {
  return (
    <Link href={`/orgs/${org.slug}`}>
      <Card className="hover:bg-accent/50 transition-colors">
        <CardContent className="flex items-center gap-4 p-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={org.avatarUrl ?? undefined} />
            <AvatarFallback>{org.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{org.name}</p>
            {org.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {org.description}
              </p>
            )}
            {org.memberCount !== undefined && (
              <p className="text-xs text-muted-foreground">
                {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Create org header component**

```tsx
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { MembershipButton } from "./membership-button";

interface OrgHeaderProps {
  org: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    membershipModel: "open" | "invite" | "request";
    ownerId: string;
    memberCount: number;
  };
  membership: { role: string } | null;
  isOwner: boolean;
  pendingRequest: boolean;
}

export function OrgHeader({ org, membership, isOwner, pendingRequest }: OrgHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-4 pb-6 border-b">
      <Avatar className="h-24 w-24">
        <AvatarImage src={org.avatarUrl ?? undefined} />
        <AvatarFallback className="text-2xl">{org.name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="text-center">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        {org.description && (
          <p className="text-muted-foreground mt-1 max-w-md">{org.description}</p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
        </p>
      </div>
      <MembershipButton
        orgId={org.id}
        membershipModel={org.membershipModel}
        membership={membership}
        isOwner={isOwner}
        pendingRequest={pendingRequest}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create membership button component**

```tsx
"use client";

import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";
import { useRouter } from "next/navigation";

interface MembershipButtonProps {
  orgId: number;
  membershipModel: "open" | "invite" | "request";
  membership: { role: string } | null;
  isOwner: boolean;
  pendingRequest: boolean;
}

export function MembershipButton({
  orgId,
  membershipModel,
  membership,
  isOwner,
  pendingRequest,
}: MembershipButtonProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const joinMutation = trpc.membership.join.useMutation({
    onSuccess: () => utils.membership.getMyMembership.invalidate({ orgId }),
  });
  const leaveMutation = trpc.membership.leave.useMutation({
    onSuccess: () => utils.membership.getMyMembership.invalidate({ orgId }),
  });
  const requestMutation = trpc.joinRequest.request.useMutation({
    onSuccess: () => utils.joinRequest.getMyRequest.invalidate({ orgId }),
  });

  if (isOwner) {
    return (
      <Button variant="outline" onClick={() => router.push(`/orgs/${orgId}/settings`)}>
        Manage Organization
      </Button>
    );
  }

  if (membership) {
    return (
      <Button
        variant="outline"
        onClick={() => leaveMutation.mutate({ orgId })}
        disabled={leaveMutation.isPending}
      >
        {membership.role === "admin" ? "Admin · Leave" : "Member · Leave"}
      </Button>
    );
  }

  if (pendingRequest) {
    return (
      <Button variant="outline" disabled>
        Request Pending
      </Button>
    );
  }

  if (membershipModel === "open") {
    return (
      <Button onClick={() => joinMutation.mutate({ orgId })} disabled={joinMutation.isPending}>
        Join
      </Button>
    );
  }

  if (membershipModel === "request") {
    return (
      <Button onClick={() => requestMutation.mutate({ orgId })} disabled={requestMutation.isPending}>
        Request to Join
      </Button>
    );
  }

  // invite-only: no action button unless user has an invite
  return (
    <Button variant="outline" disabled>
      Invite Only
    </Button>
  );
}
```

- [ ] **Step 4: Create member list component**

```tsx
"use client";

import { trpc } from "@shared/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import Link from "next/link";

interface MemberListProps {
  orgId: number;
}

export function MemberList({ orgId }: MemberListProps) {
  const { data: members, isLoading } = trpc.membership.listMembers.useQuery({ orgId });

  if (isLoading) return <div className="text-muted-foreground">Loading members...</div>;

  return (
    <div className="space-y-3">
      {members?.map((m) => (
        <Link
          key={m.user.id}
          href={`/users/${m.user.username}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={m.user.avatarUrl ?? undefined} />
            <AvatarFallback>{m.user.displayName?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{m.user.displayName ?? m.user.username}</p>
            <p className="text-sm text-muted-foreground">@{m.user.username}</p>
          </div>
          <div className="flex gap-1">
            {m.isOwner && <Badge variant="default">Owner</Badge>}
            {!m.isOwner && m.membership.role === "admin" && <Badge variant="secondary">Admin</Badge>}
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/domains/orgs/components/
git commit -m "feat(orgs): add org card, header, membership button, and member list components"
```

---

### Task 9: Org profile page

**Files:**
- Create: `src/app/orgs/page.tsx`
- Create: `src/app/orgs/create/page.tsx`
- Create: `src/app/orgs/[slug]/page.tsx`

- [ ] **Step 1: Create orgs browse/discover page**

```tsx
import { trpc } from "@shared/lib/trpc";
import { OrgCard } from "@orgs/components/org-card";
import { Button } from "@shared/ui/button";
import Link from "next/link";

export default function OrgsPage() {
  // Server component — use RSC trpc caller or convert to client component
  // For simplicity, make this a client component:
  return <OrgsBrowser />;
}

// In the same file or extracted:
"use client";

function OrgsBrowser() {
  const { data, isLoading } = trpc.org.discover.useQuery({ limit: 20 });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <Link href="/orgs/create">
          <Button>Create Organization</Button>
        </Link>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      <div className="space-y-3">
        {data?.orgs.map((org) => (
          <OrgCard key={org.id} org={org} />
        ))}
      </div>
    </div>
  );
}
```

Note: The file should export a single default client component since it uses hooks. Structure as:

```tsx
"use client";

// ... imports and component code
export default function OrgsPage() { ... }
```

- [ ] **Step 2: Create org creation page**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";

export default function CreateOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membershipModel, setMembershipModel] = useState<"open" | "invite" | "request">("open");

  const createMutation = trpc.org.create.useMutation({
    onSuccess: (org) => router.push(`/orgs/${org.slug}`),
  });

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create Organization</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate({ name, description, membershipModel });
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="name">Organization Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., MIT Ballroom Dance Team"
            required
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this organization about?"
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="membership">Membership Model</Label>
          <Select value={membershipModel} onValueChange={(v) => setMembershipModel(v as typeof membershipModel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open — anyone can join</SelectItem>
              <SelectItem value="request">Request — admins approve members</SelectItem>
              <SelectItem value="invite">Invite — admins invite members</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
          {createMutation.isPending ? "Creating..." : "Create Organization"}
        </Button>
        {createMutation.error && (
          <p className="text-destructive text-sm">{createMutation.error.message}</p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create org profile page with tabs**

```tsx
"use client";

import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { OrgHeader } from "@orgs/components/org-header";
import { MemberList } from "@orgs/components/member-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";

export default function OrgProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org, isLoading: orgLoading } = trpc.org.getBySlug.useQuery({ slug });
  const { data: myMembership } = trpc.membership.getMyMembership.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org }
  );
  const { data: myRequest } = trpc.joinRequest.getMyRequest.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org }
  );

  if (orgLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!org) return <div className="p-6">Organization not found</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <OrgHeader
        org={org}
        membership={myMembership?.membership ?? null}
        isOwner={myMembership?.isOwner ?? false}
        pendingRequest={!!myRequest}
      />

      <Tabs defaultValue="posts" className="mt-6">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          {/* Org posts list — uses orgPost.listByOrg */}
          <OrgPosts orgId={org.id} />
        </TabsContent>

        <TabsContent value="members">
          <MemberList orgId={org.id} />
        </TabsContent>

        <TabsContent value="about">
          <div className="py-4">
            <p>{org.description ?? "No description provided."}</p>
            <p className="text-sm text-muted-foreground mt-4">
              Membership: {org.membershipModel === "open"
                ? "Open to all"
                : org.membershipModel === "request"
                  ? "Request to join"
                  : "Invite only"}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgPosts({ orgId }: { orgId: number }) {
  const { data, isLoading } = trpc.orgPost.listByOrg.useQuery({ orgId, limit: 20 });

  if (isLoading) return <p className="text-muted-foreground py-4">Loading posts...</p>;
  if (!data?.posts.length) return <p className="text-muted-foreground py-4">No posts yet.</p>;

  return (
    <div className="space-y-4 py-4">
      {data.posts.map((post) => (
        <div key={post.id} className="border rounded-lg p-4">
          {post.title && <h3 className="font-semibold">{post.title}</h3>}
          <p className="text-sm text-muted-foreground line-clamp-3">{post.body}</p>
        </div>
      ))}
    </div>
  );
}
```

Note: The `OrgPosts` rendering here is minimal — it will use the shared `PostCard` component from Phase 2 once integrated. This placeholder ensures the page works standalone.

- [ ] **Step 4: Commit**

```bash
git add src/app/orgs/
git commit -m "feat(orgs): add org browse, create, and profile pages"
```

---

### Task 10: Org settings page

**Files:**
- Create: `src/app/orgs/[slug]/settings/page.tsx`

- [ ] **Step 1: Create org settings page with admin management**

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { JoinRequestList } from "@orgs/components/join-request-list";
import { InviteManager } from "@orgs/components/invite-manager";

export default function OrgSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: org, isLoading } = trpc.org.getBySlug.useQuery({ slug });
  const { data: myMembership } = trpc.membership.getMyMembership.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org }
  );

  const updateMutation = trpc.org.update.useMutation({
    onSuccess: () => utils.org.getBySlug.invalidate({ slug }),
  });
  const deleteMutation = trpc.org.delete.useMutation({
    onSuccess: () => router.push("/orgs"),
  });
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membershipModel, setMembershipModel] = useState<string>("");

  // Initialize form when data loads
  if (org && !name) {
    setName(org.name);
    setDescription(org.description ?? "");
    setMembershipModel(org.membershipModel);
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!org) return <div className="p-6">Organization not found</div>;

  const isOwner = myMembership?.isOwner ?? false;
  const isAdmin = myMembership?.membership?.role === "admin";
  if (!isOwner && !isAdmin) return <div className="p-6">Access denied</div>;

  return (
    <div className="max-w-lg mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Organization Settings</h1>

      {/* General Settings */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">General</h2>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div>
          <Label>Membership Model</Label>
          <Select value={membershipModel} onValueChange={setMembershipModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="request">Request</SelectItem>
              <SelectItem value="invite">Invite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() =>
            updateMutation.mutate({
              orgId: org.id,
              name,
              description,
              membershipModel: membershipModel as "open" | "invite" | "request",
            })
          }
          disabled={updateMutation.isPending}
        >
          Save Changes
        </Button>
      </section>

      {/* Join Requests (shown when model is 'request') */}
      {org.membershipModel === "request" && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Pending Join Requests</h2>
          <JoinRequestList orgId={org.id} />
        </section>
      )}

      {/* Invite Management (shown when model is 'invite') */}
      {org.membershipModel === "invite" && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Invite Members</h2>
          <InviteManager orgId={org.id} />
        </section>
      )}

      {/* Danger Zone — owner only */}
      {isOwner && (
        <section className="border border-destructive rounded-lg p-4 space-y-4">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>

          {/* Transfer Ownership */}
          <TransferOwnership orgId={org.id} />

          {/* Delete Org */}
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Are you sure? This cannot be undone.")) {
                deleteMutation.mutate({ orgId: org.id });
              }
            }}
            disabled={deleteMutation.isPending}
          >
            Delete Organization
          </Button>
        </section>
      )}
    </div>
  );
}

function TransferOwnership({ orgId }: { orgId: number }) {
  const { data: members } = trpc.membership.listMembers.useQuery({ orgId });
  const transferMutation = trpc.membership.transferOwnership.useMutation();
  const [selectedAdmin, setSelectedAdmin] = useState<string>("");

  const admins = members?.filter((m) => m.membership.role === "admin" && !m.isOwner) ?? [];

  if (admins.length === 0) {
    return <p className="text-sm text-muted-foreground">Promote a member to admin before transferring ownership.</p>;
  }

  return (
    <div className="space-y-2">
      <Label>Transfer Ownership</Label>
      <div className="flex gap-2">
        <Select value={selectedAdmin} onValueChange={setSelectedAdmin}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select an admin" />
          </SelectTrigger>
          <SelectContent>
            {admins.map((a) => (
              <SelectItem key={a.user.id} value={a.user.id}>
                {a.user.displayName ?? a.user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="destructive"
          onClick={() => {
            if (selectedAdmin && confirm("Transfer ownership? You will become an admin.")) {
              transferMutation.mutate({ orgId, newOwnerId: selectedAdmin });
            }
          }}
          disabled={!selectedAdmin || transferMutation.isPending}
        >
          Transfer
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/orgs/[slug]/settings/page.tsx
git commit -m "feat(orgs): add org settings page with membership, ownership transfer, and danger zone"
```

---

### Task 11: Join request list and invite manager components

**Files:**
- Create: `src/domains/orgs/components/join-request-list.tsx`
- Create: `src/domains/orgs/components/invite-manager.tsx`

- [ ] **Step 1: Create join request list component**

```tsx
"use client";

import { trpc } from "@shared/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Button } from "@shared/ui/button";

interface JoinRequestListProps {
  orgId: number;
}

export function JoinRequestList({ orgId }: JoinRequestListProps) {
  const utils = trpc.useUtils();
  const { data: requests, isLoading } = trpc.joinRequest.listPending.useQuery({ orgId });
  const approveMutation = trpc.joinRequest.approve.useMutation({
    onSuccess: () => utils.joinRequest.listPending.invalidate({ orgId }),
  });
  const rejectMutation = trpc.joinRequest.reject.useMutation({
    onSuccess: () => utils.joinRequest.listPending.invalidate({ orgId }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (!requests?.length) return <p className="text-muted-foreground">No pending requests.</p>;

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.request.id} className="flex items-center gap-3 p-2 border rounded-lg">
          <Avatar className="h-10 w-10">
            <AvatarImage src={r.user.avatarUrl ?? undefined} />
            <AvatarFallback>{r.user.displayName?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{r.user.displayName ?? r.user.username}</p>
            <p className="text-sm text-muted-foreground">@{r.user.username}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => approveMutation.mutate({ requestId: r.request.id })}
              disabled={approveMutation.isPending}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rejectMutation.mutate({ requestId: r.request.id })}
              disabled={rejectMutation.isPending}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create invite manager component**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";

interface InviteManagerProps {
  orgId: number;
}

export function InviteManager({ orgId }: InviteManagerProps) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateLinkMutation = trpc.invite.generateLink.useMutation({
    onSuccess: (data) => {
      const link = `${window.location.origin}/orgs/invite/${data.token}`;
      setInviteLink(link);
    },
  });

  const copyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Button
          onClick={() => generateLinkMutation.mutate({ orgId })}
          disabled={generateLinkMutation.isPending}
        >
          Generate Invite Link
        </Button>
        <p className="text-sm text-muted-foreground mt-1">Link expires in 7 days.</p>
      </div>

      {inviteLink && (
        <div className="flex gap-2">
          <Input value={inviteLink} readOnly className="flex-1" />
          <Button variant="outline" onClick={copyLink}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/orgs/components/join-request-list.tsx src/domains/orgs/components/invite-manager.tsx
git commit -m "feat(orgs): add join request list and invite manager admin components"
```

---

### Task 12: Add orgs link to navigation

**Files:**
- Modify: `src/app/layout.tsx` (or `src/shared/components/nav.tsx` depending on Phase 0 structure)
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add "Organizations" link to the nav**

Add a nav link for `/orgs` alongside the existing Dances and Routines links.

```tsx
<Link href="/orgs" className="...">Organizations</Link>
```

- [ ] **Step 2: Update Clerk middleware to protect org settings routes**

In `src/middleware.ts`, add `/orgs/*/settings` to the protected routes:

```typescript
export default clerkMiddleware((auth, req) => {
  if (
    req.nextUrl.pathname.startsWith("/routines") ||
    req.nextUrl.pathname.startsWith("/orgs/create") ||
    req.nextUrl.pathname.match(/^\/orgs\/[^/]+\/settings/)
  ) {
    auth().protect();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/middleware.ts
git commit -m "feat(orgs): add organizations nav link and protect settings routes"
```
