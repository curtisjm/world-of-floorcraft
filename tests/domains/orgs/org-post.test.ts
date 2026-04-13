import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createPublicCaller, createUser, createOrg, truncateAll } from "../../setup/helpers";

describe("org-post router", () => {
  let owner: { id: string };

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: "orgowner" });
  });

  describe("create", () => {
    it("creates an org post as admin", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Org Announcement",
        body: "Hello members!",
        publish: true,
      });
      expect(post.orgId).toBe(org.id);
      expect(post.title).toBe("Org Announcement");
    });

    it("rejects non-admin creating org post", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const member = await createUser({ username: "member" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      await expect(
        memberCaller.orgPost.create({
          orgId: org.id,
          type: "article",
          title: "Unauthorized",
          body: "Test",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("listByOrg", () => {
    it("returns published org posts", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Published",
        body: "Content",
        publish: true,
      });
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Draft",
        body: "Content",
        publish: false,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.orgPost.listByOrg({ orgId: org.id });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Published");
    });

    it("paginates with cursor returning next page items", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);

      // Create 3 published posts
      const post1 = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Post 1",
        body: "First",
        publish: true,
      });
      const post2 = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Post 2",
        body: "Second",
        publish: true,
      });
      const post3 = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Post 3",
        body: "Third",
        publish: true,
      });

      const publicCaller = createPublicCaller();

      // Page 1: limit 2 — should return 2 items + nextCursor
      const page1 = await publicCaller.orgPost.listByOrg({ orgId: org.id, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      // Page 2: use cursor — should return remaining item(s), not re-include cursor row
      const page2 = await publicCaller.orgPost.listByOrg({
        orgId: org.id,
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items.length).toBeGreaterThanOrEqual(1);

      // No overlap between pages
      const page1Ids = page1.items.map((p: { id: number }) => p.id);
      const page2Ids = page2.items.map((p: { id: number }) => p.id);
      const overlap = page1Ids.filter((id: number) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);

      // All 3 posts accounted for across pages
      const allIds = [...page1Ids, ...page2Ids];
      expect(allIds).toContain(post1.id);
      expect(allIds).toContain(post2.id);
      expect(allIds).toContain(post3.id);
    });

    it("returns org name and slug with posts", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "With Org Info",
        body: "Content",
        publish: true,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.orgPost.listByOrg({ orgId: org.id });
      expect(result.items[0].orgName).toBe(org.name);
      expect(result.items[0].orgSlug).toBe(org.slug);
    });
  });

  describe("update", () => {
    it("updates an org post as owner", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Original",
        body: "Original body",
      });

      const updated = await caller.orgPost.update({
        id: post.id,
        orgId: org.id,
        title: "Updated Title",
        body: "Updated body",
      });
      expect(updated.title).toBe("Updated Title");
      expect(updated.body).toBe("Updated body");
    });

    it("rejects non-admin updating org post", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Original",
      });

      const member = await createUser({ username: "member" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      await expect(
        memberCaller.orgPost.update({
          id: post.id,
          orgId: org.id,
          title: "Hacked",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("publish", () => {
    it("publishes a draft org post", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const draft = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Draft Post",
        body: "Content",
        publish: false,
      });
      expect(draft.publishedAt).toBeNull();

      const published = await caller.orgPost.publish({
        id: draft.id,
        orgId: org.id,
      });
      expect(published.publishedAt).not.toBeNull();
    });

    it("rejects publishing already-published post", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Published",
        publish: true,
      });

      await expect(
        caller.orgPost.publish({ id: post.id, orgId: org.id })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("delete", () => {
    it("deletes an org post as owner", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "To Delete",
        publish: true,
      });

      await caller.orgPost.delete({ id: post.id, orgId: org.id });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.orgPost.listByOrg({ orgId: org.id });
      expect(result.items).toHaveLength(0);
    });

    it("rejects non-admin deleting org post", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Protected",
        publish: true,
      });

      const member = await createUser({ username: "member" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      await expect(
        memberCaller.orgPost.delete({ id: post.id, orgId: org.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("listDrafts", () => {
    it("returns unpublished org posts for admin", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Draft 1",
        publish: false,
      });
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Published",
        publish: true,
      });

      const drafts = await caller.orgPost.listDrafts({ orgId: org.id });
      expect(drafts).toHaveLength(1);
      expect(drafts[0].title).toBe("Draft 1");
    });

    it("rejects non-admin listing drafts", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const member = await createUser({ username: "member" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      await expect(
        memberCaller.orgPost.listDrafts({ orgId: org.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
