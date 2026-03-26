# Phase 6: Direct Messaging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time messaging with 1:1 DMs, group conversations, and org channels. Ably provides WebSocket delivery, presence, and typing indicators. Message history from the database. Unread tracking per conversation.

**Architecture:** New `messaging` domain with `conversations`, `conversation_members`, `messages` tables. Ably SDK on the client subscribes to conversation channels. Server-side tRPC mutations save messages to DB then publish to Ably. Token auth via a tRPC endpoint that generates short-lived Ably tokens scoped to the user's conversations.

**Tech Stack:** Drizzle ORM, tRPC v11, Ably (real-time), Next.js App Router, shadcn/ui

**Spec Reference:** `docs/superpowers/specs/2026-03-26-social-platform-design.md` — "Direct Messaging", "Messaging Domain"

**Depends on:** Phase 4 (organizations) must be complete for org channels. Phase 5 (notifications) recommended for message notifications.

---

## File Structure

```
src/
  domains/
    messaging/
      schema.ts                  ← NEW: conversations, conversation_members, messages tables
      routers/
        conversation.ts          ← NEW: create DM/group/channel, list conversations
        message.ts               ← NEW: send message, list history (paginated)
        ably-auth.ts             ← NEW: token auth endpoint for Ably
      lib/
        ably-server.ts           ← NEW: server-side Ably client for publishing
        ably-client.ts           ← NEW: client-side Ably setup with React hooks
      components/
        messaging-layout.tsx     ← NEW: sidebar + chat area layout
        conversation-sidebar.tsx ← NEW: conversation list with unread badges
        conversation-item.tsx    ← NEW: single conversation preview in sidebar
        chat-area.tsx            ← NEW: message list + input for active conversation
        message-bubble.tsx       ← NEW: single message display
        message-input.tsx        ← NEW: text input with send button
        typing-indicator.tsx     ← NEW: "user is typing..." display
        new-conversation.tsx     ← NEW: dialog for starting new DM or group
  shared/
    db/
      enums.ts                   ← add conversationTypeEnum
  app/
    messages/
      page.tsx                   ← NEW: messaging page
      [conversationId]/
        page.tsx                 ← NEW: specific conversation view
```

---

## Tasks

### Task 1: Add Ably dependency and environment config

**Files:**
- Modify: `package.json`
- Modify: `.env.local` (add Ably keys)

- [ ] **Step 1: Install Ably SDK**

Run: `npm install ably`

- [ ] **Step 2: Add environment variables**

Add to `.env.local`:

```
ABLY_API_KEY=your-ably-api-key-here
NEXT_PUBLIC_ABLY_PUBLIC_KEY=your-ably-public-key-here
```

The `ABLY_API_KEY` is the server-side key with full permissions. `NEXT_PUBLIC_ABLY_PUBLIC_KEY` is not used directly — tokens are issued via the auth endpoint instead. Only `ABLY_API_KEY` is needed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(messaging): add ably SDK dependency"
```

---

### Task 2: Add messaging schema

**Files:**
- Modify: `src/shared/db/enums.ts`
- Create: `src/domains/messaging/schema.ts`

- [ ] **Step 1: Add conversation type enum**

In `src/shared/db/enums.ts`:

```typescript
export const conversationTypeEnum = pgEnum("conversation_type", [
  "direct",
  "group",
  "org_channel",
]);
```

- [ ] **Step 2: Create messaging schema**

```typescript
import { pgTable, serial, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "@shared/schema";
import { organizations } from "@orgs/schema";
import { conversationTypeEnum } from "@shared/db/enums";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  type: conversationTypeEnum("type").notNull(),
  name: text("name"), // null for DMs, set for groups/channels
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at"),
  },
  (table) => ({
    convUserUnique: uniqueIndex("conv_members_conv_user_idx").on(
      table.conversationId,
      table.userId
    ),
    userIdx: index("conv_members_user_idx").on(table.userId),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    senderId: text("sender_id")
      .references(() => users.id)
      .notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    convCreatedIdx: index("messages_conv_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  })
);
```

- [ ] **Step 3: Run migration**

Run: `npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: Migration creates conversations, conversation_members, messages tables.

- [ ] **Step 4: Commit**

```bash
git add src/shared/db/enums.ts src/domains/messaging/schema.ts drizzle/
git commit -m "feat(messaging): add conversations, conversation_members, messages schema"
```

---

### Task 3: Ably server and client setup

**Files:**
- Create: `src/domains/messaging/lib/ably-server.ts`
- Create: `src/domains/messaging/lib/ably-client.ts`

- [ ] **Step 1: Create server-side Ably client**

```typescript
import Ably from "ably";

let ablyServer: Ably.Rest | null = null;

export function getAblyServer(): Ably.Rest {
  if (!ablyServer) {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) throw new Error("ABLY_API_KEY not set");
    ablyServer = new Ably.Rest({ key: apiKey });
  }
  return ablyServer;
}

/**
 * Publish a message to an Ably channel.
 * Channel naming: "conversation:{id}"
 */
export async function publishToConversation(
  conversationId: number,
  event: string,
  data: unknown
) {
  const ably = getAblyServer();
  const channel = ably.channels.get(`conversation:${conversationId}`);
  await channel.publish(event, data);
}

/**
 * Generate a token request for a user, scoped to their conversation channels.
 */
export async function createAblyTokenRequest(
  userId: string,
  conversationIds: number[]
): Promise<Ably.TokenRequest> {
  const ably = getAblyServer();
  const capability: Record<string, string[]> = {};

  for (const id of conversationIds) {
    capability[`conversation:${id}`] = ["subscribe", "presence", "publish"];
  }

  // If no conversations yet, grant a minimal capability
  if (conversationIds.length === 0) {
    capability["*"] = ["subscribe"];
  }

  return ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
  });
}
```

- [ ] **Step 2: Create client-side Ably hooks**

```typescript
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Ably from "ably";
import { trpc } from "@shared/lib/trpc";

let ablyClient: Ably.Realtime | null = null;

/**
 * Initialize or retrieve the Ably realtime client.
 * Uses token auth — fetches tokens from the server via tRPC.
 */
function getAblyClient(authCallback: (callback: Ably.TokenCallback) => void): Ably.Realtime {
  if (!ablyClient) {
    ablyClient = new Ably.Realtime({
      authCallback: (tokenParams, callback) => {
        authCallback(callback);
      },
    });
  }
  return ablyClient;
}

/**
 * Hook to subscribe to real-time messages in a conversation.
 */
export function useConversationMessages(
  conversationId: number | null,
  onMessage: (message: { id: number; senderId: string; body: string; createdAt: string }) => void
) {
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const tokenMutation = trpc.ablyAuth.getToken.useMutation();

  useEffect(() => {
    if (!conversationId) return;

    const client = getAblyClient((callback) => {
      tokenMutation.mutateAsync().then(
        (tokenRequest) => callback(null, tokenRequest),
        (err) => callback(err, null)
      );
    });

    const channel = client.channels.get(`conversation:${conversationId}`);
    channelRef.current = channel;

    channel.subscribe("message", (msg) => {
      onMessageRef.current(msg.data);
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [conversationId]);
}

/**
 * Hook for presence (who's online) in a conversation.
 */
export function useConversationPresence(conversationId: number | null) {
  const [presentUsers, setPresentUsers] = useState<string[]>([]);
  const tokenMutation = trpc.ablyAuth.getToken.useMutation();

  useEffect(() => {
    if (!conversationId) return;

    const client = getAblyClient((callback) => {
      tokenMutation.mutateAsync().then(
        (tokenRequest) => callback(null, tokenRequest),
        (err) => callback(err, null)
      );
    });

    const channel = client.channels.get(`conversation:${conversationId}`);

    channel.presence.subscribe("enter", () => {
      channel.presence.get((err, members) => {
        if (!err && members) {
          setPresentUsers(members.map((m) => m.clientId));
        }
      });
    });

    channel.presence.subscribe("leave", () => {
      channel.presence.get((err, members) => {
        if (!err && members) {
          setPresentUsers(members.map((m) => m.clientId));
        }
      });
    });

    channel.presence.enter();

    return () => {
      channel.presence.leave();
      channel.presence.unsubscribe();
    };
  }, [conversationId]);

  return presentUsers;
}

/**
 * Hook for typing indicators.
 */
export function useTypingIndicator(conversationId: number | null) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const tokenMutation = trpc.ablyAuth.getToken.useMutation();
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (!conversationId) return;

    const client = getAblyClient((callback) => {
      tokenMutation.mutateAsync().then(
        (tokenRequest) => callback(null, tokenRequest),
        (err) => callback(err, null)
      );
    });

    const channel = client.channels.get(`conversation:${conversationId}`);

    channel.subscribe("typing", (msg) => {
      const userId = msg.data?.userId as string;
      if (!userId) return;

      setTypingUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]));

      // Clear previous timeout for this user
      const existing = timeoutsRef.current.get(userId);
      if (existing) clearTimeout(existing);

      // Remove after 3 seconds of no typing
      const timeout = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((id) => id !== userId));
        timeoutsRef.current.delete(userId);
      }, 3000);
      timeoutsRef.current.set(userId, timeout);
    });

    return () => {
      channel.unsubscribe("typing");
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
    };
  }, [conversationId]);

  const sendTyping = useCallback(() => {
    if (!conversationId) return;
    const client = getAblyClient(() => {});
    const channel = client.channels.get(`conversation:${conversationId}`);
    channel.publish("typing", { userId: ablyClient?.auth.clientId });
  }, [conversationId]);

  return { typingUsers, sendTyping };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/messaging/lib/ably-server.ts src/domains/messaging/lib/ably-client.ts
git commit -m "feat(messaging): add Ably server client, token auth, and real-time React hooks"
```

---

### Task 4: Ably auth router

**Files:**
- Create: `src/domains/messaging/routers/ably-auth.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create Ably token auth endpoint**

```typescript
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { conversationMembers } from "@messaging/schema";
import { eq } from "drizzle-orm";
import { createAblyTokenRequest } from "@messaging/lib/ably-server";

export const ablyAuthRouter = router({
  getToken: protectedProcedure.mutation(async ({ ctx }) => {
    // Get all conversation IDs for this user
    const memberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, ctx.userId));

    const conversationIds = memberships.map((m) => m.conversationId);

    const tokenRequest = await createAblyTokenRequest(ctx.userId, conversationIds);
    return tokenRequest;
  }),
});
```

- [ ] **Step 2: Register ably auth router**

In `src/server/routers/index.ts`:

```typescript
import { ablyAuthRouter } from "@messaging/routers/ably-auth";

export const appRouter = router({
  // ...existing
  ablyAuth: ablyAuthRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/messaging/routers/ably-auth.ts src/server/routers/index.ts
git commit -m "feat(messaging): add Ably token auth endpoint scoped to user conversations"
```

---

### Task 5: Conversation router

**Files:**
- Create: `src/domains/messaging/routers/conversation.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create conversation router**

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  conversations,
  conversationMembers,
  messages,
} from "@messaging/schema";
import { users } from "@shared/schema";
import { memberships } from "@orgs/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const conversationRouter = router({
  // Create or get existing DM between two users
  getOrCreateDM: protectedProcedure
    .input(z.object({ otherUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId === input.otherUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot DM yourself" });
      }

      // Check DM privacy rules:
      // Allowed if mutual follows, shared org, or recipient is public
      const otherUser = await db.query.users.findFirst({
        where: eq(users.id, input.otherUserId),
      });
      if (!otherUser) throw new TRPCError({ code: "NOT_FOUND" });

      // Check for existing DM
      const myConvos = await db
        .select({ conversationId: conversationMembers.conversationId })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, ctx.userId));

      if (myConvos.length > 0) {
        const myConvoIds = myConvos.map((c) => c.conversationId);
        const existingDM = await db
          .select({ conversationId: conversationMembers.conversationId })
          .from(conversationMembers)
          .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
          .where(
            and(
              eq(conversationMembers.userId, input.otherUserId),
              eq(conversations.type, "direct"),
              inArray(conversationMembers.conversationId, myConvoIds)
            )
          );

        if (existingDM.length > 0) {
          return { conversationId: existingDM[0].conversationId, created: false };
        }
      }

      // Create new DM
      const [conv] = await db
        .insert(conversations)
        .values({ type: "direct" })
        .returning();

      await db.insert(conversationMembers).values([
        { conversationId: conv.id, userId: ctx.userId },
        { conversationId: conv.id, userId: input.otherUserId },
      ]);

      return { conversationId: conv.id, created: true };
    }),

  // Create a group conversation
  createGroup: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        memberIds: z.array(z.string()).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db
        .insert(conversations)
        .values({ type: "group", name: input.name })
        .returning();

      const allMembers = [ctx.userId, ...input.memberIds.filter((id) => id !== ctx.userId)];

      await db.insert(conversationMembers).values(
        allMembers.map((userId) => ({
          conversationId: conv.id,
          userId,
        }))
      );

      return conv;
    }),

  // Create an org channel (admin only)
  createOrgChannel: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify admin/owner
      const org = await db.query.organizations.findFirst({
        where: eq(memberships.orgId, input.orgId),
      });
      // Use the orgs domain for auth check
      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId),
          eq(memberships.role, "admin")
        ),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const [conv] = await db
        .insert(conversations)
        .values({
          type: "org_channel",
          name: input.name,
          orgId: input.orgId,
        })
        .returning();

      // Add all current org members
      const orgMembers = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.orgId, input.orgId));

      if (orgMembers.length > 0) {
        await db.insert(conversationMembers).values(
          orgMembers.map((m) => ({
            conversationId: conv.id,
            userId: m.userId,
          }))
        );
      }

      return conv;
    }),

  // List user's conversations with last message preview
  list: protectedProcedure.query(async ({ ctx }) => {
    const myMemberships = await db
      .select({
        conversationId: conversationMembers.conversationId,
        lastReadAt: conversationMembers.lastReadAt,
      })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, ctx.userId));

    if (myMemberships.length === 0) return [];

    const convIds = myMemberships.map((m) => m.conversationId);
    const lastReadMap = new Map(
      myMemberships.map((m) => [m.conversationId, m.lastReadAt])
    );

    const convos = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds))
      .orderBy(desc(conversations.updatedAt));

    // Get last message for each conversation
    const results = await Promise.all(
      convos.map(async (conv) => {
        const [lastMessage] = await db
          .select({
            message: messages,
            sender: {
              id: users.id,
              displayName: users.displayName,
              username: users.username,
            },
          })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        // Unread count
        const lastRead = lastReadMap.get(conv.id);
        const [unreadResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conv.id),
              lastRead ? sql`${messages.createdAt} > ${lastRead}` : sql`true`
            )
          );

        // For DMs, get the other user's info
        let otherUser = null;
        if (conv.type === "direct") {
          const members = await db
            .select({
              id: users.id,
              displayName: users.displayName,
              username: users.username,
              avatarUrl: users.avatarUrl,
            })
            .from(conversationMembers)
            .innerJoin(users, eq(conversationMembers.userId, users.id))
            .where(
              and(
                eq(conversationMembers.conversationId, conv.id),
                sql`${conversationMembers.userId} != ${ctx.userId}`
              )
            );
          otherUser = members[0] ?? null;
        }

        return {
          conversation: conv,
          lastMessage: lastMessage ?? null,
          unreadCount: unreadResult.count,
          otherUser,
        };
      })
    );

    return results;
  }),

  // Mark conversation as read
  markRead: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(conversationMembers)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId)
          )
        );

      return { success: true };
    }),

  // Add member to group conversation
  addMember: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });
      if (!conv || conv.type === "direct") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot add members to DMs" });
      }

      // Verify caller is a member
      const callerMembership = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, input.conversationId),
          eq(conversationMembers.userId, ctx.userId)
        ),
      });
      if (!callerMembership) throw new TRPCError({ code: "FORBIDDEN" });

      await db
        .insert(conversationMembers)
        .values({
          conversationId: input.conversationId,
          userId: input.userId,
        })
        .onConflictDoNothing();

      return { success: true };
    }),
});
```

- [ ] **Step 2: Register conversation router**

In `src/server/routers/index.ts`:

```typescript
import { conversationRouter } from "@messaging/routers/conversation";

export const appRouter = router({
  // ...existing
  conversation: conversationRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/messaging/routers/conversation.ts src/server/routers/index.ts
git commit -m "feat(messaging): add conversation router with DM, group, org channel, and unread tracking"
```

---

### Task 6: Message router

**Files:**
- Create: `src/domains/messaging/routers/message.ts`
- Modify: `src/server/routers/index.ts`

- [ ] **Step 1: Create message router**

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { conversations, conversationMembers, messages } from "@messaging/schema";
import { users } from "@shared/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publishToConversation } from "@messaging/lib/ably-server";
import { createNotification } from "@social/lib/notify";

export const messageRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        body: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify sender is a member
      const membership = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, input.conversationId),
          eq(conversationMembers.userId, ctx.userId)
        ),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      // Save to DB
      const [message] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.userId,
          body: input.body,
        })
        .returning();

      // Update conversation's updatedAt
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      // Publish to Ably for real-time delivery
      await publishToConversation(input.conversationId, "message", {
        id: message.id,
        senderId: ctx.userId,
        body: input.body,
        createdAt: message.createdAt.toISOString(),
      });

      // Create notifications for other members (message type)
      const otherMembers = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            // Exclude sender
          )
        );

      for (const member of otherMembers) {
        if (member.userId !== ctx.userId) {
          await createNotification({
            userId: member.userId,
            type: "message",
            actorId: ctx.userId,
            conversationId: input.conversationId,
          });
        }
      }

      return message;
    }),

  // Load message history (newest first, cursor-based)
  history: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        cursor: z.number().optional(), // message ID
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify membership
      const membership = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, input.conversationId),
          eq(conversationMembers.userId, ctx.userId)
        ),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const conditions = [eq(messages.conversationId, input.conversationId)];
      if (input.cursor) {
        conditions.push(lt(messages.id, input.cursor));
      }

      const results = await db
        .select({
          message: messages,
          sender: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      if (hasMore) results.pop();

      return {
        messages: results.reverse(), // Oldest first for display
        nextCursor: hasMore ? results[0].message.id : undefined,
      };
    }),
});
```

- [ ] **Step 2: Register message router**

In `src/server/routers/index.ts`:

```typescript
import { messageRouter } from "@messaging/routers/message";

export const appRouter = router({
  // ...existing
  message: messageRouter,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/domains/messaging/routers/message.ts src/server/routers/index.ts
git commit -m "feat(messaging): add message router with send, history, and real-time Ably publish"
```

---

### Task 7: Messaging UI components

**Files:**
- Create: `src/domains/messaging/components/message-bubble.tsx`
- Create: `src/domains/messaging/components/message-input.tsx`
- Create: `src/domains/messaging/components/typing-indicator.tsx`

- [ ] **Step 1: Create message bubble component**

```tsx
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { cn } from "@shared/lib/utils";

interface MessageBubbleProps {
  message: {
    body: string;
    createdAt: string;
  };
  sender: {
    id: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  isOwnMessage: boolean;
}

export function MessageBubble({ message, sender, isOwnMessage }: MessageBubbleProps) {
  return (
    <div
      className={cn("flex gap-2 max-w-[80%]", isOwnMessage ? "ml-auto flex-row-reverse" : "")}
    >
      {!isOwnMessage && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={sender.avatarUrl ?? undefined} />
          <AvatarFallback>
            {(sender.displayName ?? sender.username ?? "?")?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div>
        {!isOwnMessage && (
          <p className="text-xs text-muted-foreground mb-1">
            {sender.displayName ?? sender.username}
          </p>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-sm",
            isOwnMessage
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          {message.body}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create message input component**

```tsx
"use client";

import { useState, useCallback } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Send } from "lucide-react";
import { trpc } from "@shared/lib/trpc";

interface MessageInputProps {
  conversationId: number;
  onTyping?: () => void;
}

export function MessageInput({ conversationId, onTyping }: MessageInputProps) {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: () => {
      setText("");
      utils.message.history.invalidate({ conversationId });
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      sendMutation.mutate({ conversationId, body: trimmed });
    },
    [text, conversationId, sendMutation]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
      onTyping?.();
    },
    [onTyping]
  );

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t">
      <Input
        value={text}
        onChange={handleChange}
        placeholder="Type a message..."
        className="flex-1"
        autoComplete="off"
      />
      <Button
        type="submit"
        size="icon"
        disabled={!text.trim() || sendMutation.isPending}
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create typing indicator component**

```tsx
"use client";

interface TypingIndicatorProps {
  typingUsers: string[];
  userNames: Map<string, string>;
  currentUserId: string;
}

export function TypingIndicator({ typingUsers, userNames, currentUserId }: TypingIndicatorProps) {
  const others = typingUsers.filter((id) => id !== currentUserId);

  if (others.length === 0) return null;

  const names = others.map((id) => userNames.get(id) ?? "Someone");
  let text: string;

  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing...`;
  }

  return (
    <div className="px-4 py-1 text-xs text-muted-foreground animate-pulse">
      {text}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/domains/messaging/components/message-bubble.tsx src/domains/messaging/components/message-input.tsx src/domains/messaging/components/typing-indicator.tsx
git commit -m "feat(messaging): add message bubble, input, and typing indicator components"
```

---

### Task 8: Conversation sidebar and layout

**Files:**
- Create: `src/domains/messaging/components/conversation-item.tsx`
- Create: `src/domains/messaging/components/conversation-sidebar.tsx`
- Create: `src/domains/messaging/components/messaging-layout.tsx`
- Create: `src/domains/messaging/components/new-conversation.tsx`

- [ ] **Step 1: Create conversation item component**

```tsx
"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import { cn } from "@shared/lib/utils";

interface ConversationItemProps {
  conversation: {
    id: number;
    type: string;
    name: string | null;
  };
  otherUser: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null;
  lastMessage: {
    message: { body: string; createdAt: string };
    sender: { displayName: string | null; username: string | null };
  } | null;
  unreadCount: number;
  isActive: boolean;
}

export function ConversationItem({
  conversation,
  otherUser,
  lastMessage,
  unreadCount,
  isActive,
}: ConversationItemProps) {
  const displayName =
    conversation.type === "direct"
      ? otherUser?.displayName ?? otherUser?.username ?? "Unknown"
      : conversation.name ?? "Group";

  const avatar = conversation.type === "direct" ? otherUser?.avatarUrl : null;

  return (
    <Link
      href={`/messages/${conversation.id}`}
      className={cn(
        "flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors rounded-lg",
        isActive && "bg-accent"
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={avatar ?? undefined} />
        <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium truncate text-sm">{displayName}</p>
          {lastMessage && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {new Date(lastMessage.message.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {lastMessage && (
          <p className="text-xs text-muted-foreground truncate">
            {lastMessage.sender.displayName ?? lastMessage.sender.username}:{" "}
            {lastMessage.message.body}
          </p>
        )}
      </div>
      {unreadCount > 0 && (
        <Badge variant="destructive" className="rounded-full h-5 w-5 p-0 flex items-center justify-center text-xs">
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Create conversation sidebar**

```tsx
"use client";

import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { ConversationItem } from "./conversation-item";
import { NewConversation } from "./new-conversation";
import { ScrollArea } from "@shared/ui/scroll-area";

export function ConversationSidebar() {
  const params = useParams();
  const activeId = params.conversationId ? Number(params.conversationId) : null;

  const { data: conversations, isLoading } = trpc.conversation.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  // Group org channels separately
  const dms = conversations?.filter((c) => c.conversation.type !== "org_channel") ?? [];
  const channels = conversations?.filter((c) => c.conversation.type === "org_channel") ?? [];

  return (
    <div className="w-80 border-r flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="font-semibold">Messages</h2>
        <NewConversation />
      </div>
      <ScrollArea className="flex-1">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}

        {dms.length > 0 && (
          <div className="p-2">
            {dms.map((c) => (
              <ConversationItem
                key={c.conversation.id}
                conversation={c.conversation}
                otherUser={c.otherUser}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                isActive={activeId === c.conversation.id}
              />
            ))}
          </div>
        )}

        {channels.length > 0 && (
          <div className="p-2">
            <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
              Channels
            </p>
            {channels.map((c) => (
              <ConversationItem
                key={c.conversation.id}
                conversation={c.conversation}
                otherUser={null}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                isActive={activeId === c.conversation.id}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 3: Create new conversation dialog**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@shared/ui/dialog";

export function NewConversation() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const router = useRouter();

  // Look up user by username, then create DM
  const dmMutation = trpc.conversation.getOrCreateDM.useMutation({
    onSuccess: (result) => {
      setOpen(false);
      setUsername("");
      router.push(`/messages/${result.conversationId}`);
    },
  });

  // For simplicity, this finds the user by username via the profile router
  // In production, you'd add a user search endpoint
  const handleStartDM = () => {
    // This would need a lookup step — for now, assume we have the userId
    // The full implementation would use a user search/autocomplete
    dmMutation.mutate({ otherUserId: username });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username or user ID"
          />
          <Button
            onClick={handleStartDM}
            disabled={!username.trim() || dmMutation.isPending}
            className="w-full"
          >
            Start Conversation
          </Button>
          {dmMutation.error && (
            <p className="text-destructive text-sm">{dmMutation.error.message}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create messaging layout**

```tsx
"use client";

import { ConversationSidebar } from "./conversation-sidebar";

interface MessagingLayoutProps {
  children: React.ReactNode;
}

export function MessagingLayout({ children }: MessagingLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ConversationSidebar />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/domains/messaging/components/conversation-item.tsx src/domains/messaging/components/conversation-sidebar.tsx src/domains/messaging/components/new-conversation.tsx src/domains/messaging/components/messaging-layout.tsx
git commit -m "feat(messaging): add conversation sidebar, item, new conversation dialog, and layout"
```

---

### Task 9: Chat area component

**Files:**
- Create: `src/domains/messaging/components/chat-area.tsx`

- [ ] **Step 1: Create chat area with real-time messages**

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@shared/lib/trpc";
import { useAuth } from "@clerk/nextjs";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import {
  useConversationMessages,
  useTypingIndicator,
} from "@messaging/lib/ably-client";
import { ScrollArea } from "@shared/ui/scroll-area";

interface ChatAreaProps {
  conversationId: number;
}

interface MessageData {
  message: {
    id: number;
    body: string;
    createdAt: string;
    conversationId: number;
    senderId: string;
  };
  sender: {
    id: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
}

export function ChatArea({ conversationId }: ChatAreaProps) {
  const { userId } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [realtimeMessages, setRealtimeMessages] = useState<MessageData[]>([]);

  const { data, isLoading, fetchNextPage, hasNextPage } =
    trpc.message.history.useInfiniteQuery(
      { conversationId, limit: 50 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  // Mark as read when opening
  const markReadMutation = trpc.conversation.markRead.useMutation();
  useEffect(() => {
    markReadMutation.mutate({ conversationId });
  }, [conversationId]);

  // Subscribe to real-time messages
  useConversationMessages(conversationId, (msg) => {
    setRealtimeMessages((prev) => [
      ...prev,
      {
        message: { ...msg, conversationId, senderId: msg.senderId },
        sender: {
          id: msg.senderId,
          displayName: null,
          username: null,
          avatarUrl: null,
        },
      },
    ]);
  });

  // Reset realtime messages when conversation changes
  useEffect(() => {
    setRealtimeMessages([]);
  }, [conversationId]);

  // Typing indicator
  const { typingUsers, sendTyping } = useTypingIndicator(conversationId);
  const userNames = new Map<string, string>();
  // Build name map from loaded messages
  const allDbMessages = data?.pages.flatMap((p) => p.messages) ?? [];
  for (const m of allDbMessages) {
    userNames.set(m.sender.id, m.sender.displayName ?? m.sender.username ?? "Unknown");
  }

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [realtimeMessages.length, allDbMessages.length]);

  const allMessages = [...allDbMessages, ...realtimeMessages];

  // Deduplicate by ID (realtime messages may duplicate DB messages after refetch)
  const seen = new Set<number>();
  const deduped = allMessages.filter((m) => {
    if (seen.has(m.message.id)) return false;
    seen.add(m.message.id);
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            className="w-full text-center text-sm text-muted-foreground py-2 hover:underline"
          >
            Load older messages
          </button>
        )}
        {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}
        <div className="space-y-4">
          {deduped.map((m) => (
            <MessageBubble
              key={m.message.id}
              message={{
                body: m.message.body,
                createdAt: typeof m.message.createdAt === "string"
                  ? m.message.createdAt
                  : m.message.createdAt.toISOString(),
              }}
              sender={m.sender}
              isOwnMessage={m.sender.id === userId}
            />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <TypingIndicator
        typingUsers={typingUsers}
        userNames={userNames}
        currentUserId={userId ?? ""}
      />

      <MessageInput
        conversationId={conversationId}
        onTyping={sendTyping}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/messaging/components/chat-area.tsx
git commit -m "feat(messaging): add chat area with real-time messages, typing indicator, and auto-scroll"
```

---

### Task 10: Messaging pages

**Files:**
- Create: `src/app/messages/page.tsx`
- Create: `src/app/messages/[conversationId]/page.tsx`
- Create: `src/app/messages/layout.tsx`

- [ ] **Step 1: Create messaging layout**

```tsx
import { MessagingLayout } from "@messaging/components/messaging-layout";

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessagingLayout>{children}</MessagingLayout>;
}
```

- [ ] **Step 2: Create messages index page**

```tsx
export default function MessagesPage() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Select a conversation or start a new one
    </div>
  );
}
```

- [ ] **Step 3: Create conversation page**

```tsx
"use client";

import { useParams } from "next/navigation";
import { ChatArea } from "@messaging/components/chat-area";

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const id = Number(conversationId);

  if (isNaN(id)) return <div className="p-6">Invalid conversation</div>;

  return <ChatArea conversationId={id} />;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/messages/
git commit -m "feat(messaging): add messages layout, index, and conversation pages"
```

---

### Task 11: Add messages link to navigation and protect routes

**Files:**
- Modify: `src/app/layout.tsx` (or `src/shared/components/nav.tsx`)
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add "Messages" link to the nav**

```tsx
<Link href="/messages" className="...">Messages</Link>
```

- [ ] **Step 2: Update Clerk middleware to protect messaging routes**

In `src/middleware.ts`, add `/messages` to the protected routes:

```typescript
if (
  req.nextUrl.pathname.startsWith("/routines") ||
  req.nextUrl.pathname.startsWith("/messages") ||
  req.nextUrl.pathname.startsWith("/orgs/create") ||
  req.nextUrl.pathname.match(/^\/orgs\/[^/]+\/settings/)
) {
  auth().protect();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/middleware.ts
git commit -m "feat(messaging): add messages nav link and protect messaging routes"
```

---

### Task 12: Auto-add new org members to org channels

**Files:**
- Modify: `src/domains/orgs/routers/membership.ts`

- [ ] **Step 1: After adding a new member, add them to all org channels**

In the `join` mutation (and also after `approve` in join-request router, and `accept` in invite router), add:

```typescript
import { conversations, conversationMembers } from "@messaging/schema";
import { eq } from "drizzle-orm";

// After successfully adding a membership:
const orgChannels = await db
  .select({ id: conversations.id })
  .from(conversations)
  .where(
    and(
      eq(conversations.orgId, input.orgId),
      eq(conversations.type, "org_channel")
    )
  );

if (orgChannels.length > 0) {
  await db.insert(conversationMembers).values(
    orgChannels.map((ch) => ({
      conversationId: ch.id,
      userId: ctx.userId, // or the new member's userId
    }))
  ).onConflictDoNothing();
}
```

Apply this same pattern in:
- `membership.join` (open orgs)
- `joinRequest.approve` (request orgs)
- `invite.accept` (invite orgs)

- [ ] **Step 2: Commit**

```bash
git add src/domains/orgs/routers/membership.ts src/domains/orgs/routers/join-request.ts src/domains/orgs/routers/invite.ts
git commit -m "feat(messaging): auto-add new org members to all org channels"
```

---

### Task 13: Create default "General" channel on org creation

**Files:**
- Modify: `src/domains/orgs/routers/org.ts`

- [ ] **Step 1: After creating an org, create a default General channel**

In the `create` mutation, after inserting the org and the owner's membership:

```typescript
import { conversations, conversationMembers } from "@messaging/schema";

// Create default General channel
const [generalChannel] = await db
  .insert(conversations)
  .values({
    type: "org_channel",
    name: "General",
    orgId: org.id,
  })
  .returning();

// Add owner to the channel
await db.insert(conversationMembers).values({
  conversationId: generalChannel.id,
  userId: ctx.userId,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/orgs/routers/org.ts
git commit -m "feat(messaging): create default General channel on org creation"
```
