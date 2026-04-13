import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createPost,
  createOrg,
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

    it("excludes draft posts from followed users", async () => {
      const alice = await createUser({ username: "alice" });
      const bob = await createUser({ username: "bob" });

      await createPost(bob.id, {
        title: "Draft Post",
        visibility: "public",
        publishedAt: null,
      });

      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: bob.id });

      const feed = await aliceCaller.feed.following({});
      expect(feed.posts).toHaveLength(0);
    });

    it("shows followers-only posts from followed users", async () => {
      const alice = await createUser({ username: "alice" });
      const bob = await createUser({ username: "bob" });

      await createPost(bob.id, {
        title: "Followers Only",
        visibility: "followers",
        publishedAt: new Date(),
      });

      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: bob.id });

      const feed = await aliceCaller.feed.following({});
      expect(feed.posts).toHaveLength(1);
      expect(feed.posts[0].title).toBe("Followers Only");
    });

    it("excludes followers-only posts from unfollowed users", async () => {
      const alice = await createUser({ username: "alice" });
      const bob = await createUser({ username: "bob" });
      const carol = await createUser({ username: "carol" });

      await createPost(carol.id, {
        title: "Carol Followers Only",
        visibility: "followers",
        publishedAt: new Date(),
      });

      // Alice follows Bob but not Carol
      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: bob.id });

      const feed = await aliceCaller.feed.following({});
      expect(feed.posts).toHaveLength(0);
    });

    it("shows org-only posts to org members", async () => {
      const alice = await createUser({ username: "alice" });
      const bob = await createUser({ username: "bob" });
      const org = await createOrg(bob.id);

      await createPost(bob.id, {
        title: "Org Post",
        visibility: "organization",
        visibilityOrgId: org.id,
        publishedAt: new Date(),
      });

      // Alice joins the org and follows Bob
      const aliceCaller = createCaller(alice.id);
      await aliceCaller.membership.join({ orgId: org.id });
      await aliceCaller.follow.follow({ targetUserId: bob.id });

      const feed = await aliceCaller.feed.following({});
      // Org-only posts appear via the org visibility path, not the followed-users path
      expect(feed.posts.some((p: { title: string | null }) => p.title === "Org Post")).toBe(true);
    });

    it("excludes org-only posts from non-members", async () => {
      const alice = await createUser({ username: "alice" });
      const bob = await createUser({ username: "bob" });
      const org = await createOrg(bob.id);

      await createPost(bob.id, {
        title: "Org Secret",
        visibility: "organization",
        visibilityOrgId: org.id,
        publishedAt: new Date(),
      });

      // Alice follows Bob but is NOT an org member
      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: bob.id });

      const feed = await aliceCaller.feed.following({});
      expect(feed.posts).toHaveLength(0);
    });
  });
});
