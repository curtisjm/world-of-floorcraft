import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, createOrg, createConversation, truncateAll } from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { memberships } from "@orgs/schema";

describe("conversation router", () => {
  let alice: { id: string };
  let bob: { id: string };

  beforeEach(async () => {
    await truncateAll();
    alice = await createUser({ username: "alice" });
    bob = await createUser({ username: "bob" });
  });

  describe("getOrCreateDM", () => {
    it("creates a new DM conversation", async () => {
      const caller = createCaller(alice.id);
      const result = await caller.conversation.getOrCreateDM({
        otherUserId: bob.id,
      });
      expect(result.id).toBeDefined();
    });

    it("returns existing DM on second call", async () => {
      const caller = createCaller(alice.id);
      const first = await caller.conversation.getOrCreateDM({
        otherUserId: bob.id,
      });
      const second = await caller.conversation.getOrCreateDM({
        otherUserId: bob.id,
      });
      expect(second.id).toBe(first.id);
    });

    it("prevents self-DM", async () => {
      const caller = createCaller(alice.id);
      await expect(
        caller.conversation.getOrCreateDM({ otherUserId: alice.id })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("createGroup", () => {
    it("creates a group conversation", async () => {
      const caller = createCaller(alice.id);
      const conv = await caller.conversation.createGroup({
        name: "Dance Group",
        memberIds: [bob.id],
      });
      expect(conv.type).toBe("group");
      expect(conv.name).toBe("Dance Group");
    });
  });

  describe("createOrgChannel", () => {
    it("creates an org channel and adds all members", async () => {
      const org = await createOrg(alice.id, { membershipModel: "open" });

      // Add bob to org
      const db = getTestDb();
      await db.insert(memberships).values({
        orgId: org.id,
        userId: bob.id,
        role: "member",
      });

      const caller = createCaller(alice.id);
      const conv = await caller.conversation.createOrgChannel({
        orgId: org.id,
        name: "Announcements",
      });
      expect(conv.type).toBe("org_channel");
      expect(conv.name).toBe("Announcements");
    });

    it("rejects non-admin creating channel", async () => {
      const org = await createOrg(alice.id);
      const caller = createCaller(bob.id);
      await expect(
        caller.conversation.createOrgChannel({
          orgId: org.id,
          name: "Unauthorized",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("list", () => {
    it("returns user's conversations with last message and unread count", async () => {
      const conv = await createConversation("direct", [alice.id, bob.id]);

      const caller = createCaller(alice.id);
      const result = await caller.conversation.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(conv.id);
      expect(result[0].unreadCount).toBe(0);
    });

    it("returns empty for user with no conversations", async () => {
      const caller = createCaller(alice.id);
      const result = await caller.conversation.list();
      expect(result).toHaveLength(0);
    });
  });

  describe("markRead", () => {
    it("marks a conversation as read", async () => {
      await createConversation("direct", [alice.id, bob.id]);
      const caller = createCaller(alice.id);

      const convs = await caller.conversation.list();
      const result = await caller.conversation.markRead({
        conversationId: convs[0].id,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("addMember", () => {
    it("adds a member to a group conversation", async () => {
      const charlie = await createUser({ username: "charlie" });
      const conv = await createConversation("group", [alice.id, bob.id], {
        name: "Group",
      });

      const caller = createCaller(alice.id);
      const result = await caller.conversation.addMember({
        conversationId: conv.id,
        userId: charlie.id,
      });
      expect(result.success).toBe(true);
    });

    it("rejects adding member to DM", async () => {
      const charlie = await createUser({ username: "charlie" });
      const conv = await createConversation("direct", [alice.id, bob.id]);

      const caller = createCaller(alice.id);
      await expect(
        caller.conversation.addMember({
          conversationId: conv.id,
          userId: charlie.id,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});
