import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createPublicCaller, createUser, truncateAll } from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { memberships } from "@orgs/schema";
import { conversationMembers, conversations } from "@messaging/schema";
import { eq, and } from "drizzle-orm";

describe("org router", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser({ username: "orgowner" });
    userId = user.id;
  });

  describe("create", () => {
    it("creates an org with owner membership and default channel", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({
        name: "My Studio",
        description: "A dance studio",
      });

      expect(org.name).toBe("My Studio");
      expect(org.slug).toBe("my-studio");
      expect(org.ownerId).toBe(userId);

      // Verify owner is admin member
      const db = getTestDb();
      const membership = await db.query.memberships.findFirst({
        where: and(eq(memberships.orgId, org.id), eq(memberships.userId, userId)),
      });
      expect(membership).not.toBeUndefined();
      expect(membership!.role).toBe("admin");

      // Verify default General channel was created
      const channel = await db.query.conversations.findFirst({
        where: and(eq(conversations.orgId, org.id), eq(conversations.type, "org_channel")),
      });
      expect(channel).not.toBeUndefined();
      expect(channel!.name).toBe("General");

      // Verify owner is in the channel
      const channelMember = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, channel!.id),
          eq(conversationMembers.userId, userId)
        ),
      });
      expect(channelMember).not.toBeUndefined();
    });

    it("auto-generates slug from name", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({ name: "My Dance Studio!" });
      expect(org.slug).toBe("my-dance-studio");
    });

    it("rejects duplicate slug", async () => {
      const caller = createCaller(userId);
      await caller.org.create({ name: "Unique" });
      await expect(
        caller.org.create({ name: "Unique" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("getBySlug", () => {
    it("returns org with member count", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({ name: "Test Org" });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.org.getBySlug({ slug: org.slug });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Org");
      expect(result!.memberCount).toBe(1);
    });

    it("returns null for unknown slug", async () => {
      const publicCaller = createPublicCaller();
      const result = await publicCaller.org.getBySlug({ slug: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("allows owner to update", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({ name: "Old Name" });
      const updated = await caller.org.update({
        orgId: org.id,
        name: "New Name",
      });
      expect(updated.name).toBe("New Name");
    });

    it("rejects non-admin update", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({ name: "Test" });

      const other = await createUser({ username: "other" });
      const otherCaller = createCaller(other.id);
      await expect(
        otherCaller.org.update({ orgId: org.id, name: "Hacked" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("delete", () => {
    it("allows owner to delete", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({ name: "ToDelete" });
      const result = await caller.org.delete({ orgId: org.id });
      expect(result.success).toBe(true);
    });

    it("rejects non-owner delete", async () => {
      const caller = createCaller(userId);
      const org = await caller.org.create({ name: "Protected" });

      const other = await createUser({ username: "other" });
      const otherCaller = createCaller(other.id);
      await expect(
        otherCaller.org.delete({ orgId: org.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("listUserOrgs", () => {
    it("returns orgs the user is a member of", async () => {
      const caller = createCaller(userId);
      await caller.org.create({ name: "Org 1" });
      await caller.org.create({ name: "Org 2" });

      const result = await caller.org.listUserOrgs();
      expect(result).toHaveLength(2);
    });
  });

  describe("discover", () => {
    it("returns paginated orgs", async () => {
      const caller = createCaller(userId);
      await caller.org.create({ name: "Org 1" });
      await caller.org.create({ name: "Org 2" });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.org.discover({ limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();

      const page2 = await publicCaller.org.discover({
        cursor: result.nextCursor,
        limit: 1,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeUndefined();
    });
  });
});
