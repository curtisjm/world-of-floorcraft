import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createPublicCaller, createUser, createOrg, createPost, truncateAll } from "../../setup/helpers";

describe("post router", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser({ username: "poster" });
    userId = user.id;
  });

  describe("createArticle", () => {
    it("creates a draft article", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "My Post",
        body: "Content here",
      });
      expect(post.title).toBe("My Post");
      expect(post.type).toBe("article");
      expect(post.publishedAt).toBeNull();
    });

    it("creates a published article", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Published",
        body: "Content",
        publish: true,
      });
      expect(post.publishedAt).not.toBeNull();
    });
  });

  describe("get", () => {
    it("returns a published public post by id", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Test",
        body: "Body",
        publish: true,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.post.get({ id: post.id });
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Test");
    });

    it("hides draft posts from unauthenticated users", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Draft",
        body: "Secret draft",
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.post.get({ id: post.id });
      expect(result).toBeNull();
    });

    it("hides draft posts from other authenticated users", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Draft",
        body: "Secret draft",
      });

      const other = await createUser({ username: "other" });
      const otherCaller = createCaller(other.id);
      const result = await otherCaller.post.get({ id: post.id });
      expect(result).toBeNull();
    });

    it("allows author to see their own draft", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "My Draft",
        body: "Secret draft",
      });

      const result = await caller.post.get({ id: post.id });
      expect(result).not.toBeNull();
      expect(result!.title).toBe("My Draft");
    });

    it("hides followers-only posts from unauthenticated users", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.post.get({ id: post.id });
      expect(result).toBeNull();
    });

    it("hides followers-only posts from non-followers", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });

      const other = await createUser({ username: "stranger" });
      const otherCaller = createCaller(other.id);
      const result = await otherCaller.post.get({ id: post.id });
      expect(result).toBeNull();
    });

    it("shows followers-only posts to followers", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });

      const follower = await createUser({ username: "follower" });
      const followerCaller = createCaller(follower.id);
      await followerCaller.follow.follow({ targetUserId: userId });

      const result = await followerCaller.post.get({ id: post.id });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(post.id);
    });

    it("hides org-only posts from non-members", async () => {
      const org = await createOrg(userId);
      const post = await createPost(userId, {
        visibility: "organization",
        visibilityOrgId: org.id,
        publishedAt: new Date(),
      });

      const other = await createUser({ username: "outsider" });
      const otherCaller = createCaller(other.id);
      const result = await otherCaller.post.get({ id: post.id });
      expect(result).toBeNull();
    });

    it("shows org-only posts to org members", async () => {
      const org = await createOrg(userId);
      const post = await createPost(userId, {
        visibility: "organization",
        visibilityOrgId: org.id,
        publishedAt: new Date(),
      });

      // Owner is automatically a member via createOrg
      const caller = createCaller(userId);
      const result = await caller.post.get({ id: post.id });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(post.id);
    });
  });

  describe("update", () => {
    it("updates post fields", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Original",
        body: "Body",
      });
      const updated = await caller.post.update({
        id: post.id,
        title: "Updated",
      });
      expect(updated!.title).toBe("Updated");
    });
  });

  describe("publish", () => {
    it("publishes a draft post", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Draft",
        body: "Content",
      });
      const published = await caller.post.publish({ id: post.id });
      expect(published!.publishedAt).not.toBeNull();
    });
  });

  describe("update with publish", () => {
    it("atomically saves content and publishes in a single call", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Draft",
        body: "Old content",
      });
      expect(post.publishedAt).toBeNull();

      const updated = await caller.post.update({
        id: post.id,
        title: "Final Title",
        body: "Final content",
        publish: true,
      });
      expect(updated!.title).toBe("Final Title");
      expect(updated!.body).toBe("Final content");
      expect(updated!.publishedAt).not.toBeNull();
    });

    it("does not set publishedAt when publish is not specified", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "Draft",
        body: "Content",
      });
      const updated = await caller.post.update({
        id: post.id,
        title: "Updated Draft",
      });
      expect(updated!.title).toBe("Updated Draft");
      expect(updated!.publishedAt).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes a post", async () => {
      const caller = createCaller(userId);
      const post = await caller.post.createArticle({
        title: "ToDelete",
        body: "Body",
      });
      const result = await caller.post.delete({ id: post.id });
      expect(result.success).toBe(true);
    });
  });

  describe("myDrafts", () => {
    it("returns only unpublished articles", async () => {
      const caller = createCaller(userId);
      await caller.post.createArticle({ title: "Draft", body: "Body" });
      await caller.post.createArticle({ title: "Published", body: "Body", publish: true });

      const drafts = await caller.post.myDrafts();
      expect(drafts).toHaveLength(1);
      expect(drafts[0].title).toBe("Draft");
    });
  });

  describe("organization visibility", () => {
    it("sets visibilityOrgId when creating an article with org visibility", async () => {
      const caller = createCaller(userId);
      const org = await createOrg(userId);
      const post = await caller.post.createArticle({
        title: "Org Post",
        body: "Content",
        visibility: "organization",
        visibilityOrgId: org.id,
      });
      expect(post.visibility).toBe("organization");
      expect(post.visibilityOrgId).toBe(org.id);
    });

    it("rejects org visibility without visibilityOrgId", async () => {
      const caller = createCaller(userId);
      await expect(
        caller.post.createArticle({
          title: "Bad Post",
          body: "Content",
          visibility: "organization",
        })
      ).rejects.toThrow("visibilityOrgId is required");
    });

    it("rejects org visibility for non-member", async () => {
      const owner = await createUser({ username: "orgowner" });
      const org = await createOrg(owner.id);
      const caller = createCaller(userId);
      await expect(
        caller.post.createArticle({
          title: "Not My Org",
          body: "Content",
          visibility: "organization",
          visibilityOrgId: org.id,
        })
      ).rejects.toThrow("You must be a member");
    });

    it("clears visibilityOrgId when updating away from org visibility", async () => {
      const caller = createCaller(userId);
      const org = await createOrg(userId);
      const post = await caller.post.createArticle({
        title: "Org Post",
        body: "Content",
        visibility: "organization",
        visibilityOrgId: org.id,
      });
      const updated = await caller.post.update({
        id: post.id,
        visibility: "public",
      });
      expect(updated!.visibility).toBe("public");
      expect(updated!.visibilityOrgId).toBeNull();
    });

    it("sets visibilityOrgId on routine share with org visibility", async () => {
      const caller = createCaller(userId);
      const org = await createOrg(userId);
      // Create a routine first — use routine router if available, else insert directly
      const post = await caller.post.createRoutineShare({
        routineId: 1,
        body: "Shared routine",
        visibility: "organization",
        visibilityOrgId: org.id,
      });
      expect(post.visibility).toBe("organization");
      expect(post.visibilityOrgId).toBe(org.id);
    });

    it("returns visibilityOrgId from get", async () => {
      const caller = createCaller(userId);
      const org = await createOrg(userId);
      const post = await caller.post.createArticle({
        title: "Org Article",
        body: "Content",
        visibility: "organization",
        visibilityOrgId: org.id,
        publish: true,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.post.get({ id: post.id });
      expect(result!.visibilityOrgId).toBe(org.id);
    });
  });
});
