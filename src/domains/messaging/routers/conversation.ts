import { z } from "zod";
import { eq, and, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { organizations, memberships } from "@orgs/schema";
import { conversations, conversationMembers, messages } from "@messaging/schema";

export const conversationRouter = router({
  getOrCreateDM: protectedProcedure
    .input(z.object({ otherUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.otherUserId === ctx.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot DM yourself" });
      }

      // Check for existing DM conversation between these two users
      const existing = await db.execute(sql`
        SELECT c.id FROM ${conversations} c
        INNER JOIN ${conversationMembers} m1 ON m1.conversation_id = c.id AND m1.user_id = ${ctx.userId}
        INNER JOIN ${conversationMembers} m2 ON m2.conversation_id = c.id AND m2.user_id = ${input.otherUserId}
        WHERE c.type = 'direct'
        LIMIT 1
      `);

      if (existing.rows.length > 0) {
        const row = existing.rows[0] as { id: number };
        return { id: row.id };
      }

      // Create new DM conversation
      const [conversation] = await db
        .insert(conversations)
        .values({ type: "direct" })
        .returning();

      await db.insert(conversationMembers).values([
        { conversationId: conversation.id, userId: ctx.userId },
        { conversationId: conversation.id, userId: input.otherUserId },
      ]);

      return { id: conversation.id };
    }),

  createGroup: protectedProcedure
    .input(
      z.object({
        name: z.string().max(100).optional().default(""),
        memberIds: z.array(z.string()).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let groupName = input.name;

      // Auto-generate name from member usernames if not provided
      if (!groupName) {
        const allMemberIds = [...new Set([ctx.userId, ...input.memberIds])];
        const members = await db
          .select({ username: users.username, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, allMemberIds));

        groupName = members
          .map((m) => m.displayName || m.username || "Unknown")
          .join(", ");

        if (groupName.length > 100) {
          groupName = groupName.slice(0, 97) + "...";
        }
      }

      const [conversation] = await db
        .insert(conversations)
        .values({ type: "group", name: groupName })
        .returning();

      const allMembers = [...new Set([ctx.userId, ...input.memberIds])];
      await db.insert(conversationMembers).values(
        allMembers.map((userId) => ({ conversationId: conversation.id, userId }))
      );

      return conversation;
    }),

  createOrgChannel: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const callerMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      const isOwner = org.ownerId === ctx.userId;
      const isAdmin = callerMembership?.role === "admin";

      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner required" });
      }

      const [conversation] = await db
        .insert(conversations)
        .values({ type: "org_channel", name: input.name, orgId: input.orgId })
        .returning();

      // Add all current org members
      const orgMembers = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.orgId, input.orgId));

      if (orgMembers.length > 0) {
        await db.insert(conversationMembers).values(
          orgMembers.map((m) => ({ conversationId: conversation.id, userId: m.userId }))
        ).onConflictDoNothing();
      }

      return conversation;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const myMemberships = await db
      .select({ conversationId: conversationMembers.conversationId, lastReadAt: conversationMembers.lastReadAt })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, ctx.userId));

    if (myMemberships.length === 0) return [];

    const convIds = myMemberships.map((m) => m.conversationId);

    // Batch: fetch all conversations
    const allConversations = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds));

    const convMap = new Map(allConversations.map((c) => [c.id, c]));

    // Batch: fetch last message per conversation using subquery + join
    const latestMsgSub = db
      .select({
        conversationId: messages.conversationId,
        maxId: sql<number>`max(${messages.id})`.as("max_id"),
      })
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .groupBy(messages.conversationId)
      .as("latest_msg");

    const lastMessages = await db
      .select({
        id: messages.id,
        body: messages.body,
        senderId: messages.senderId,
        conversationId: messages.conversationId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(
        latestMsgSub,
        and(
          eq(messages.conversationId, latestMsgSub.conversationId),
          eq(messages.id, latestMsgSub.maxId),
        ),
      );

    const lastMessageMap = new Map(
      lastMessages.map((m) => [
        m.conversationId,
        { id: m.id, body: m.body, senderId: m.senderId, createdAt: m.createdAt },
      ]),
    );

    // Batch: fetch unread counts for all conversations in one query
    const unreadRows = await db
      .select({
        conversationId: conversationMembers.conversationId,
        count: sql<number>`count(${messages.id})::int`,
      })
      .from(conversationMembers)
      .leftJoin(
        messages,
        and(
          eq(messages.conversationId, conversationMembers.conversationId),
          sql`(${conversationMembers.lastReadAt} IS NULL OR ${messages.createdAt} > ${conversationMembers.lastReadAt})`,
        ),
      )
      .where(
        and(
          eq(conversationMembers.userId, ctx.userId),
          inArray(conversationMembers.conversationId, convIds),
        ),
      )
      .groupBy(conversationMembers.conversationId);

    const unreadMap = new Map(
      unreadRows.map((r) => [r.conversationId, r.count]),
    );

    // Batch: fetch other user info for all DM conversations
    const dmConvIds = allConversations
      .filter((c) => c.type === "direct")
      .map((c) => c.id);

    const otherUserMap = new Map<number, { userId: string; username: string | null; displayName: string | null; avatarUrl: string | null }>();
    if (dmConvIds.length > 0) {
      const otherMembers = await db
        .select({
          conversationId: conversationMembers.conversationId,
          userId: conversationMembers.userId,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(users.id, conversationMembers.userId))
        .where(
          and(
            inArray(conversationMembers.conversationId, dmConvIds),
            sql`${conversationMembers.userId} != ${ctx.userId}`
          )
        );

      for (const m of otherMembers) {
        otherUserMap.set(m.conversationId, {
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
        });
      }
    }

    // Assemble results
    const results = [];
    for (const membership of myMemberships) {
      const conversation = convMap.get(membership.conversationId);
      if (!conversation) continue;

      results.push({
        ...conversation,
        lastMessage: lastMessageMap.get(membership.conversationId) ?? null,
        unreadCount: unreadMap.get(membership.conversationId) ?? 0,
        otherUser: otherUserMap.get(membership.conversationId) ?? null,
      });
    }

    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, input.conversationId),
          eq(conversationMembers.userId, ctx.userId)
        ),
      });

      if (!member) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this conversation" });
      }

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

  addMember: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      if (conversation.type === "direct") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot add members to a DM conversation" });
      }

      // Verify caller is a member
      const callerMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, input.conversationId),
          eq(conversationMembers.userId, ctx.userId)
        ),
      });

      if (!callerMember) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this conversation" });
      }

      await db
        .insert(conversationMembers)
        .values({ conversationId: input.conversationId, userId: input.userId })
        .onConflictDoNothing();

      return { success: true };
    }),
});
