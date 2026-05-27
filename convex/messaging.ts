import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserOrNull } from "./lib/auth";
import { badRequest, forbidden, notFound } from "./lib/errors";
import { requireOrgRole } from "./lib/permissions";
import { createNotification } from "./social/notifications";

/**
 * Messaging domain. Ported from the Drizzle/tRPC routers under
 * `src/domains/messaging/routers/{conversation,message,ably-auth}` for the
 * Convex migration (docs/superpowers/plans/2026-05-22-convex-migration.md,
 * Task 8).
 *
 * Direct messages, group chats, and org channels share the same
 * `conversations`/`conversationMembers`/`messages` tables. Realtime delivery
 * comes from Convex reactive queries — Ably channels and the
 * `ablyAuth.getToken` mutation are retired together with this slice.
 *
 * Typing and presence use short-lived heartbeat tables that the client
 * refreshes on an interval. Queries take an explicit `now` argument so they
 * stay cacheable (`Date.now()` inside a Convex query would defeat the cache),
 * and a `cleanupStalePresence` internal mutation lets a scheduled function
 * prune expired rows on a schedule.
 */

/** Presence heartbeat lifetime — anyone older than this is treated as gone. */
const PRESENCE_TTL_MS = 60_000;
/** Typing heartbeat lifetime — typing indicators fade quickly after stop. */
const TYPING_TTL_MS = 5_000;

const GROUP_NAME_MAX = 100;
const GROUP_MEMBERS_MIN = 1;
const GROUP_MEMBERS_MAX = 50;
const ORG_CHANNEL_NAME_MAX = 100;
const MESSAGE_BODY_MAX = 5000;

// ── Internal helpers ────────────────────────────────────────────────

async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Doc<"conversationMembers">> {
  const member = await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation_user", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId),
    )
    .unique();
  if (!member) forbidden("Not a member of this conversation");
  return member;
}

async function findExistingDM(
  ctx: QueryCtx,
  userIdA: Id<"users">,
  userIdB: Id<"users">,
): Promise<Doc<"conversations"> | null> {
  // Walk the caller's memberships and look for a direct conversation that
  // also has `userIdB` as a member. Indexed by user, so this scales with the
  // number of conversations the caller is in — not the global table.
  const myMemberships = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user", (q) => q.eq("userId", userIdA))
    .collect();

  for (const m of myMemberships) {
    const conversation = await ctx.db.get(m.conversationId);
    if (!conversation || conversation.type !== "direct") continue;
    const other = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", m.conversationId).eq("userId", userIdB),
      )
      .unique();
    if (other) return conversation;
  }
  return null;
}

async function senderInfo(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{
  id: Id<"users">;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
} | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  return {
    id: user._id,
    username: user.username ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * The current user's conversations, sorted by `updatedAt` desc, each with
 * the last message, unread count, and (for DMs) the other participant's
 * profile fields. Returns `[]` when not signed in.
 */
export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return [];

    const myMemberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const rows = await Promise.all(
      myMemberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) return null;

        const latest = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", membership.conversationId),
          )
          .order("desc")
          .first();

        const unreadCount = membership.unreadCount ?? 0;

        let otherUser: {
          userId: Id<"users">;
          username: string | null;
          displayName: string | null;
          avatarUrl: string | null;
        } | null = null;
        if (conversation.type === "direct") {
          const otherMember = await ctx.db
            .query("conversationMembers")
            .withIndex("by_conversation_user", (q) =>
              q.eq("conversationId", conversation._id),
            )
            .filter((q) => q.neq(q.field("userId"), user._id))
            .first();
          if (otherMember) {
            const other = await ctx.db.get(otherMember.userId);
            if (other) {
              otherUser = {
                userId: other._id,
                username: other.username ?? null,
                displayName: other.displayName ?? null,
                avatarUrl: other.avatarUrl ?? null,
              };
            }
          }
        }

        return {
          _id: conversation._id,
          type: conversation.type,
          name: conversation.name ?? null,
          orgId: conversation.orgId ?? null,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          lastMessage: latest
            ? {
                _id: latest._id,
                body: latest.body,
                senderId: latest.senderId,
                createdAt: latest.createdAt,
              }
            : null,
          unreadCount,
          otherUser,
        };
      }),
    );

    const filtered = rows.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );
    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    return filtered;
  },
});

/**
 * Paginated message history for `conversationId`, newest-first. The client
 * shows pages in chronological order by reversing. Membership is required.
 */
export const history = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireMembership(ctx, args.conversationId, user._id);

    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (message) => ({
        _id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
        sender: await senderInfo(ctx, message.senderId),
      })),
    );

    return { ...result, page };
  },
});

/**
 * User ids currently present in `conversationId` (last heartbeat newer than
 * `now - PRESENCE_TTL_MS`). The caller passes `now` so this query stays
 * cacheable per-tick — `Date.now()` inside a Convex query would defeat the
 * cache. Membership is required.
 */
export const activePresence = query({
  args: {
    conversationId: v.id("conversations"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireMembership(ctx, args.conversationId, user._id);

    const cutoff = args.now - PRESENCE_TTL_MS;
    const records = await ctx.db
      .query("conversationPresence")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    return records
      .filter((r) => r.lastSeenAt >= cutoff)
      .map((r) => r.userId);
  },
});

/**
 * User ids currently typing in `conversationId`, excluding the caller. Same
 * `now` contract as `activePresence`. Membership is required.
 */
export const activeTyping = query({
  args: {
    conversationId: v.id("conversations"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireMembership(ctx, args.conversationId, user._id);

    const cutoff = args.now - TYPING_TTL_MS;
    const records = await ctx.db
      .query("conversationTyping")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    return records
      .filter((r) => r.updatedAt >= cutoff && r.userId !== user._id)
      .map((r) => r.userId);
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Find-or-create a direct conversation between the caller and `otherUserId`.
 * Throws on a self-DM. Idempotent — calling twice returns the same id.
 */
export const getOrCreateDM = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (args.otherUserId === user._id) {
      badRequest("Cannot DM yourself");
    }

    const other = await ctx.db.get(args.otherUserId);
    if (!other) notFound("User not found");

    const existing = await findExistingDM(ctx, user._id, args.otherUserId);
    if (existing) return { _id: existing._id };

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "direct",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: user._id,
      joinedAt: now,
      unreadCount: 0,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: args.otherUserId,
      joinedAt: now,
      unreadCount: 0,
    });

    return { _id: conversationId };
  },
});

/**
 * Create a group conversation with the caller plus `memberIds`. Auto-names
 * the group from member display names when `name` is empty. Caps at 50
 * members and 100-character names.
 */
export const createGroup = mutation({
  args: {
    name: v.optional(v.string()),
    memberIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    if (
      args.memberIds.length < GROUP_MEMBERS_MIN ||
      args.memberIds.length > GROUP_MEMBERS_MAX
    ) {
      badRequest(
        `Group requires ${GROUP_MEMBERS_MIN}-${GROUP_MEMBERS_MAX} additional members`,
      );
    }

    // Dedupe member ids; the caller is always included.
    const uniqueMembers = Array.from(
      new Set<Id<"users">>([user._id, ...args.memberIds]),
    );

    let groupName = args.name?.trim() ?? "";
    if (groupName.length > GROUP_NAME_MAX) {
      badRequest("Group name is too long");
    }
    if (!groupName) {
      const docs = await Promise.all(uniqueMembers.map((id) => ctx.db.get(id)));
      const names = docs.map((d) =>
        d ? d.displayName ?? d.username ?? "Unknown" : "Unknown",
      );
      groupName = names.join(", ");
      if (groupName.length > GROUP_NAME_MAX) {
        groupName = groupName.slice(0, GROUP_NAME_MAX - 3) + "...";
      }
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "group",
      name: groupName,
      createdAt: now,
      updatedAt: now,
    });
    for (const memberId of uniqueMembers) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: memberId,
        joinedAt: now,
        unreadCount: 0,
      });
    }

    const created = await ctx.db.get(conversationId);
    if (!created) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Group conversation creation failed",
      });
    }
    return created;
  },
});

/**
 * Internal mutation that creates an org channel and seeds it with every
 * current org member. Org admins/owners can call this through a future
 * action; for now `orgs.create` continues to insert the default "General"
 * channel directly because that path predates this task.
 */
export const createOrgChannel = internalMutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    requesterId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length === 0 || name.length > ORG_CHANNEL_NAME_MAX) {
      badRequest("Channel name must be 1-100 characters");
    }
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "org_channel",
      name,
      orgId: args.orgId,
      createdAt: now,
      updatedAt: now,
    });

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const membership of memberships) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: membership.userId,
        joinedAt: now,
        unreadCount: 0,
      });
    }

    const created = await ctx.db.get(conversationId);
    if (!created) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Channel creation failed",
      });
    }
    return created;
  },
});

/**
 * Add `userId` to a non-DM conversation. The caller must already be a
 * member. For org channels callers must additionally hold an admin role in
 * the channel's org; this mirrors the legacy `requireAdminOrOwner` check on
 * the tRPC `createOrgChannel` procedure and the implicit member-only addMember.
 */
export const addMember = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) notFound("Conversation not found");
    if (conversation.type === "direct") {
      badRequest("Cannot add members to a DM conversation");
    }

    if (conversation.type === "org_channel" && conversation.orgId) {
      await requireOrgRole(ctx, conversation.orgId, "admin");
    } else {
      await requireMembership(ctx, args.conversationId, user._id);
    }

    const target = await ctx.db.get(args.userId);
    if (!target) notFound("User not found");

    const existing = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId),
      )
      .unique();
    if (existing) return { success: true };

    await ctx.db.insert("conversationMembers", {
      conversationId: args.conversationId,
      userId: args.userId,
      joinedAt: Date.now(),
      unreadCount: 0,
    });
    return { success: true };
  },
});

/**
 * Paginated history of a conversation's messages. See `history` for arg
 * shape — `markRead` is the side-effect counterpart that updates the
 * caller's `lastReadAt` so subsequent `listConversations` calls see the
 * unread count decrease.
 */
export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const member = await requireMembership(ctx, args.conversationId, user._id);
    await ctx.db.patch(member._id, { lastReadAt: Date.now(), unreadCount: 0 });
    return { success: true };
  },
});

/**
 * Post a message to a conversation. Inserts the message, bumps the
 * conversation's `updatedAt`, and creates `message` notifications for every
 * other member. Convex reactive queries deliver the new message to
 * subscribed clients — no Ably publish required.
 */
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.body.trim();
    if (trimmed.length === 0 || trimmed.length > MESSAGE_BODY_MAX) {
      badRequest(`Message body must be 1-${MESSAGE_BODY_MAX} characters`);
    }

    const user = await getCurrentUser(ctx);
    await requireMembership(ctx, args.conversationId, user._id);

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: user._id,
      body: trimmed,
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, { updatedAt: now });

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    for (const member of members) {
      if (member.userId === user._id) {
        await ctx.db.patch(member._id, { unreadCount: 0, lastReadAt: now });
        continue;
      }
      await ctx.db.patch(member._id, {
        unreadCount: (member.unreadCount ?? 0) + 1,
      });
      await createNotification(ctx, {
        userId: member.userId,
        type: "message",
        actorId: user._id,
        conversationId: args.conversationId,
      });
    }

    const message = await ctx.db.get(messageId);
    if (!message) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Message creation failed",
      });
    }
    return {
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt,
      sender: await senderInfo(ctx, message.senderId),
    };
  },
});

/**
 * Refresh the caller's presence record for a conversation. Membership is
 * required. Upserts on `(conversationId, userId)` and writes the current
 * timestamp — the `activePresence` query compares against it under
 * `PRESENCE_TTL_MS`.
 */
export const heartbeatPresence = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireMembership(ctx, args.conversationId, user._id);

    const now = Date.now();
    const existing = await ctx.db
      .query("conversationPresence")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now });
    } else {
      await ctx.db.insert("conversationPresence", {
        conversationId: args.conversationId,
        userId: user._id,
        lastSeenAt: now,
      });
    }
    return { success: true };
  },
});

/**
 * Set or clear the caller's typing state for a conversation. `true` upserts
 * with a fresh `updatedAt`; `false` deletes the row outright so callers can
 * keep their indicator silent without waiting for `TYPING_TTL_MS`.
 */
export const setTyping = mutation({
  args: {
    conversationId: v.id("conversations"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireMembership(ctx, args.conversationId, user._id);

    const existing = await ctx.db
      .query("conversationTyping")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();

    if (!args.isTyping) {
      if (existing) await ctx.db.delete(existing._id);
      return { success: true };
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("conversationTyping", {
        conversationId: args.conversationId,
        userId: user._id,
        updatedAt: now,
      });
    }
    return { success: true };
  },
});

/**
 * Internal mutation that prunes presence and typing rows whose timestamps
 * predate `now - PRESENCE_TTL_MS` / `now - TYPING_TTL_MS`. Intended for
 * scheduled cleanup; queries already filter stale rows, so this is a
 * housekeeping pass to bound storage rather than a freshness gate.
 */
export const cleanupStalePresence = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const presenceCutoff = args.now - PRESENCE_TTL_MS;
    const typingCutoff = args.now - TYPING_TTL_MS;

    const stalePresence = await ctx.db
      .query("conversationPresence")
      .withIndex("by_last_seen", (q) => q.lt("lastSeenAt", presenceCutoff))
      .collect();
    for (const record of stalePresence) {
      await ctx.db.delete(record._id);
    }

    const staleTyping = await ctx.db
      .query("conversationTyping")
      .withIndex("by_updated", (q) => q.lt("updatedAt", typingCutoff))
      .collect();
    for (const record of staleTyping) {
      await ctx.db.delete(record._id);
    }

    return {
      presenceRemoved: stalePresence.length,
      typingRemoved: staleTyping.length,
    };
  },
});
