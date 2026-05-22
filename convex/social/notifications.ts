import { v, type Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { notificationType } from "../schema";
import { getCurrentUser, getCurrentUserOrNull } from "../lib/auth";

/**
 * Notification base for the social domain. Ported from the Drizzle/tRPC
 * `notification` router and the `@social/lib/notify` helper.
 *
 * `createNotification` is the in-process workhorse other Convex mutations
 * import directly; `createInternal` is the `internalMutation` wrapper for
 * callers that reach notifications through a function reference.
 */

type NotificationKind = Infer<typeof notificationType>;

/** Window within which repeat like/comment notifications are coalesced. */
const AGGREGATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Types that coalesce: a burst of likes on one post yields one notice. */
const AGGREGATABLE_TYPES: ReadonlySet<NotificationKind> = new Set([
  "like",
  "comment",
]);

export interface CreateNotificationParams {
  userId: Id<"users">;
  type: NotificationKind;
  actorId?: Id<"users">;
  postId?: Id<"posts">;
  commentId?: Id<"comments">;
  orgId?: Id<"organizations">;
  conversationId?: Id<"conversations">;
}

/**
 * Create a notification. Never notifies a user about their own action, and
 * for aggregatable types skips creation when a recent notification of the
 * same type+post already exists. Other domain mutations import this directly.
 */
export async function createNotification(
  ctx: MutationCtx,
  params: CreateNotificationParams,
): Promise<void> {
  if (params.actorId && params.actorId === params.userId) return;

  if (AGGREGATABLE_TYPES.has(params.type) && params.postId) {
    const postId = params.postId;
    const windowStart = Date.now() - AGGREGATION_WINDOW_MS;
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", params.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), params.type),
          q.eq(q.field("postId"), postId),
          q.gte(q.field("createdAt"), windowStart),
        ),
      )
      .first();
    if (recent) return;
  }

  await ctx.db.insert("notifications", {
    userId: params.userId,
    type: params.type,
    actorId: params.actorId,
    postId: params.postId,
    commentId: params.commentId,
    orgId: params.orgId,
    conversationId: params.conversationId,
    read: false,
    createdAt: Date.now(),
  });
}

/**
 * Internal entry point for `createNotification`, callable via a function
 * reference (`internal.social.notifications.createInternal`) by domain code
 * that does not import the helper directly.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    type: notificationType,
    actorId: v.optional(v.id("users")),
    postId: v.optional(v.id("posts")),
    commentId: v.optional(v.id("comments")),
    orgId: v.optional(v.id("organizations")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    await createNotification(ctx, args);
  },
});

/** Count of the current user's unread notifications. */
export const unreadCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", user._id).eq("read", false),
      )
      .collect();
    return unread.length;
  },
});

/** Paginated notification feed, newest first, with actor info attached. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (notification) => {
        const actor = notification.actorId
          ? await ctx.db.get(notification.actorId)
          : null;
        return {
          notification,
          actor: actor
            ? {
                displayName: actor.displayName ?? null,
                username: actor.username ?? null,
                avatarUrl: actor.avatarUrl ?? null,
              }
            : null,
        };
      }),
    );

    return { ...result, page };
  },
});

/** Mark a single notification read. Only the owner can mark it. */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (notification && notification.userId === user._id) {
      await ctx.db.patch(args.notificationId, { read: true });
    }
    return { success: true };
  },
});

/** Mark every unread notification for the current user read. */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", user._id).eq("read", false),
      )
      .collect();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }
    return { success: true };
  },
});
