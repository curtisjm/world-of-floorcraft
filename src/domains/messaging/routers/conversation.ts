import { z } from "zod";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
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

    const results = [];

    for (const membership of myMemberships) {
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, membership.conversationId),
      });

      if (!conversation) continue;

      // Get last message
      const [lastMessage] = await db
        .select({
          id: messages.id,
          body: messages.body,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, membership.conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      // Get unread count
      const unreadResult = membership.lastReadAt
        ? await db.execute(sql`
            SELECT count(*)::int as count FROM ${messages}
            WHERE conversation_id = ${membership.conversationId}
            AND created_at > ${membership.lastReadAt}
          `)
        : await db.execute(sql`
            SELECT count(*)::int as count FROM ${messages}
            WHERE conversation_id = ${membership.conversationId}
          `);

      const unreadCount = (unreadResult.rows[0] as { count: number }).count ?? 0;

      // For DMs, get the other user info
      let otherUser = null;
      if (conversation.type === "direct") {
        const otherMember = await db
          .select({
            userId: conversationMembers.userId,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(conversationMembers)
          .innerJoin(users, eq(users.id, conversationMembers.userId))
          .where(
            and(
              eq(conversationMembers.conversationId, membership.conversationId),
              sql`${conversationMembers.userId} != ${ctx.userId}`
            )
          )
          .limit(1);

        if (otherMember.length > 0) {
          otherUser = otherMember[0];
        }
      }

      results.push({
        ...conversation,
        lastMessage: lastMessage ?? null,
        unreadCount,
        otherUser,
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
