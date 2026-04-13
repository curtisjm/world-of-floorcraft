import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, createOrg, truncateAll } from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { conversationMembers, conversations } from "@messaging/schema";
import { eq, and } from "drizzle-orm";

describe("membership router", () => {
  let owner: { id: string };
  let member: { id: string };

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: "owner" });
    member = await createUser({ username: "member" });
  });

  describe("join", () => {
    it("joins an open org and gets added to org channels", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });

      // Create a channel for the org (simulating what org.create does)
      const db = getTestDb();
      const [channel] = await db
        .insert(conversations)
        .values({ type: "org_channel", name: "General", orgId: org.id })
        .returning();
      await db.insert(conversationMembers).values({
        conversationId: channel.id,
        userId: owner.id,
      });

      const caller = createCaller(member.id);
      const result = await caller.membership.join({ orgId: org.id });
      expect(result.role).toBe("member");

      // Verify member was added to org channel
      const channelMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, channel.id),
          eq(conversationMembers.userId, member.id)
        ),
      });
      expect(channelMember).not.toBeUndefined();
    });

    it("rejects joining non-open org", async () => {
      const org = await createOrg(owner.id, { membershipModel: "invite" });
      const caller = createCaller(member.id);
      await expect(
        caller.membership.join({ orgId: org.id })
      ).rejects.toThrow();
    });

    it("rejects duplicate membership", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const caller = createCaller(member.id);
      await caller.membership.join({ orgId: org.id });
      await expect(
        caller.membership.join({ orgId: org.id })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("leave", () => {
    it("allows member to leave", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const caller = createCaller(member.id);
      await caller.membership.join({ orgId: org.id });

      const result = await caller.membership.leave({ orgId: org.id });
      expect(result.success).toBe(true);
    });

    it("removes member from org channels on leave", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const db = getTestDb();

      // Create an org channel
      const [channel] = await db
        .insert(conversations)
        .values({ type: "org_channel", name: "General", orgId: org.id })
        .returning();
      await db.insert(conversationMembers).values({
        conversationId: channel.id,
        userId: owner.id,
      });

      // Member joins org (also gets added to channel)
      const caller = createCaller(member.id);
      await caller.membership.join({ orgId: org.id });

      // Verify member is in channel
      let channelMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, channel.id),
          eq(conversationMembers.userId, member.id)
        ),
      });
      expect(channelMember).not.toBeUndefined();

      // Member leaves
      await caller.membership.leave({ orgId: org.id });

      // Verify member is removed from channel
      channelMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, channel.id),
          eq(conversationMembers.userId, member.id)
        ),
      });
      expect(channelMember).toBeUndefined();
    });

    it("prevents owner from leaving", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      await expect(
        caller.membership.leave({ orgId: org.id })
      ).rejects.toThrow();
    });
  });

  describe("kick", () => {
    it("allows admin to kick member", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      const result = await ownerCaller.membership.kick({
        orgId: org.id,
        targetUserId: member.id,
      });
      expect(result.success).toBe(true);
    });

    it("removes kicked member from org channels", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const db = getTestDb();

      // Create an org channel
      const [channel] = await db
        .insert(conversations)
        .values({ type: "org_channel", name: "General", orgId: org.id })
        .returning();
      await db.insert(conversationMembers).values({
        conversationId: channel.id,
        userId: owner.id,
      });

      // Member joins org (also gets added to channel)
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      // Verify member is in channel
      let channelMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, channel.id),
          eq(conversationMembers.userId, member.id)
        ),
      });
      expect(channelMember).not.toBeUndefined();

      // Owner kicks member
      const ownerCaller = createCaller(owner.id);
      await ownerCaller.membership.kick({
        orgId: org.id,
        targetUserId: member.id,
      });

      // Verify member is removed from channel
      channelMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, channel.id),
          eq(conversationMembers.userId, member.id)
        ),
      });
      expect(channelMember).toBeUndefined();
    });
  });

  describe("updateRole", () => {
    it("promotes member to admin", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      const result = await ownerCaller.membership.updateRole({
        orgId: org.id,
        targetUserId: member.id,
        role: "admin",
      });
      expect(result.role).toBe("admin");
    });
  });

  describe("transferOwnership", () => {
    it("transfers ownership to an admin", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      // First promote to admin
      await ownerCaller.membership.updateRole({
        orgId: org.id,
        targetUserId: member.id,
        role: "admin",
      });

      const result = await ownerCaller.membership.transferOwnership({
        orgId: org.id,
        newOwnerId: member.id,
      });
      expect(result.ownerId).toBe(member.id);
    });
  });

  describe("getMyMembership", () => {
    it("returns membership and owner status", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const result = await caller.membership.getMyMembership({ orgId: org.id });
      expect(result.isOwner).toBe(true);
      expect(result.membership).not.toBeNull();
      expect(result.membership!.role).toBe("admin");
    });

    it("returns null membership for non-member", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(member.id);
      const result = await caller.membership.getMyMembership({ orgId: org.id });
      expect(result.membership).toBeNull();
      expect(result.isOwner).toBe(false);
    });
  });
});
