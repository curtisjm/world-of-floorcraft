import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createPost,
  truncateAll,
} from "../../setup/helpers";

describe("feed router", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("explore", () => {
    it("returns public published posts", async () => {
      const user = await createUser({ username: "author" });
      await createPost(user.id, {
        title: "Public Post",
        visibility: "public",
        publishedAt: new Date(),
      });
      await createPost(user.id, {
        title: "Followers Only",
        visibility: "followers",
        publishedAt: new Date(),
      });

      const caller = createPublicCaller();
      const result = await caller.feed.explore({});
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].title).toBe("Public Post");
    });

    it("returns empty for no posts", async () => {
      const caller = createPublicCaller();
      const result = await caller.feed.explore({});
      expect(result.posts).toHaveLength(0);
    });
  });

  describe("following", () => {
    it("returns posts from followed users", async () => {
      const alice = await createUser({ username: "alice" });
      const bob = await createUser({ username: "bob" });

      await createPost(bob.id, {
        title: "Bob's Post",
        visibility: "public",
        publishedAt: new Date(),
      });

      // Alice follows Bob
      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: bob.id });

      const feed = await aliceCaller.feed.following({});
      expect(feed.posts).toHaveLength(1);
      expect(feed.posts[0].title).toBe("Bob's Post");
    });
  });
});
