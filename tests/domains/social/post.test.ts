import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createPublicCaller, createUser, truncateAll } from "../../setup/helpers";

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
    it("returns a post by id", async () => {
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
});
