import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createPost,
  truncateAll,
} from "../../setup/helpers";

describe("like router", () => {
  let userId: string;
  let postId: number;

  beforeEach(async () => {
    await truncateAll();
    const author = await createUser({ username: "author" });
    const liker = await createUser({ username: "liker" });
    userId = liker.id;
    const post = await createPost(author.id, { publishedAt: new Date() });
    postId = post.id;
  });

  describe("togglePost", () => {
    it("likes a post", async () => {
      const caller = createCaller(userId);
      const result = await caller.like.togglePost({ postId });
      expect(result.liked).toBe(true);
    });

    it("unlikes a post on second toggle", async () => {
      const caller = createCaller(userId);
      await caller.like.togglePost({ postId });
      const result = await caller.like.togglePost({ postId });
      expect(result.liked).toBe(false);
    });
  });

  describe("postStatus", () => {
    it("returns like count and status", async () => {
      const caller = createCaller(userId);
      await caller.like.togglePost({ postId });

      const publicCaller = createPublicCaller();
      const status = await publicCaller.like.postStatus({ postId, userId });
      expect(status.count).toBe(1);
      expect(status.liked).toBe(true);
    });

    it("returns zero when not liked", async () => {
      const publicCaller = createPublicCaller();
      const status = await publicCaller.like.postStatus({ postId, userId });
      expect(status.count).toBe(0);
      expect(status.liked).toBe(false);
    });
  });
});
