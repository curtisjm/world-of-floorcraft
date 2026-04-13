import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createPost,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("comment router", () => {
  let userId: string;
  let postId: number;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser({ username: "commenter" });
    userId = user.id;
    const post = await createPost(user.id, { publishedAt: new Date() });
    postId = post.id;
  });

  describe("create", () => {
    it("creates a top-level comment", async () => {
      const caller = createCaller(userId);
      const result = await caller.comment.create({
        postId,
        body: "Nice post!",
      });
      expect(result.comment).toBeDefined();
      expect(result.comment.body).toBe("Nice post!");
    });

    it("creates a reply to a comment", async () => {
      const caller = createCaller(userId);
      const parent = await caller.comment.create({
        postId,
        body: "Parent",
      });

      const reply = await caller.comment.create({
        postId,
        parentId: parent.comment.id,
        body: "Reply",
      });
      expect(reply.comment.parentId).toBe(parent.comment.id);
    });

    it("rejects nested replies (reply to reply)", async () => {
      const caller = createCaller(userId);
      const parent = await caller.comment.create({ postId, body: "Parent" });
      const reply = await caller.comment.create({
        postId,
        parentId: parent.comment.id,
        body: "Reply",
      });

      const result = await caller.comment.create({
        postId,
        parentId: reply.comment.id,
        body: "Nested",
      });
      expect(result.error).toBe("cannot_reply_to_reply");
    });
  });

  describe("listByPost", () => {
    it("returns top-level comments with reply counts", async () => {
      const caller = createCaller(userId);
      const parent = await caller.comment.create({ postId, body: "Parent" });
      await caller.comment.create({
        postId,
        parentId: parent.comment.id,
        body: "Reply",
      });

      const publicCaller = createPublicCaller();
      const comments = await publicCaller.comment.listByPost({ postId });
      expect(comments).toHaveLength(1);
      expect(comments[0].body).toBe("Parent");
    });
  });

  describe("delete", () => {
    it("deletes own comment", async () => {
      const caller = createCaller(userId);
      const { comment } = await caller.comment.create({ postId, body: "ToDelete" });
      const result = await caller.comment.delete({ id: comment.id });
      expect(result.success).toBe(true);
    });
  });

  describe("create authorization", () => {
    it("blocks comments on draft posts from non-authors", async () => {
      const draftPost = await createPost(userId, { publishedAt: null });
      const other = await createUser({ username: "intruder" });
      const otherCaller = createCaller(other.id);
      await expect(
        otherCaller.comment.create({ postId: draftPost.id, body: "Sneaky" })
      ).rejects.toThrow("Post not found or not accessible");
    });

    it("allows author to comment on their own draft", async () => {
      const draftPost = await createPost(userId, { publishedAt: null });
      const caller = createCaller(userId);
      const result = await caller.comment.create({
        postId: draftPost.id,
        body: "My draft comment",
      });
      expect(result.comment).toBeDefined();
    });

    it("blocks comments on followers-only posts from non-followers", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });
      const other = await createUser({ username: "stranger" });
      const otherCaller = createCaller(other.id);
      await expect(
        otherCaller.comment.create({ postId: post.id, body: "Uninvited" })
      ).rejects.toThrow("Post not found or not accessible");
    });

    it("allows followers to comment on followers-only posts", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });
      const follower = await createUser({ username: "follower" });
      const followerCaller = createCaller(follower.id);
      await followerCaller.follow.follow({ targetUserId: userId });

      const result = await followerCaller.comment.create({
        postId: post.id,
        body: "Follower comment",
      });
      expect(result.comment).toBeDefined();
    });

    it("blocks comments on org-only posts from non-members", async () => {
      const org = await createOrg(userId);
      const post = await createPost(userId, {
        visibility: "organization",
        visibilityOrgId: org.id,
        publishedAt: new Date(),
      });
      const other = await createUser({ username: "outsider" });
      const otherCaller = createCaller(other.id);
      await expect(
        otherCaller.comment.create({ postId: post.id, body: "Not a member" })
      ).rejects.toThrow("Post not found or not accessible");
    });

    it("blocks comments on nonexistent posts", async () => {
      const caller = createCaller(userId);
      await expect(
        caller.comment.create({ postId: 99999, body: "No such post" })
      ).rejects.toThrow("Post not found or not accessible");
    });
  });

  describe("visibility", () => {
    it("hides comments on draft posts", async () => {
      const draftPost = await createPost(userId, { publishedAt: null });
      const caller = createCaller(userId);
      // Author creates a comment on their draft
      await caller.comment.create({ postId: draftPost.id, body: "Draft comment" });

      const publicCaller = createPublicCaller();
      const comments = await publicCaller.comment.listByPost({ postId: draftPost.id });
      expect(comments).toHaveLength(0);
    });

    it("hides comments on followers-only posts from non-followers", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });
      const caller = createCaller(userId);
      await caller.comment.create({ postId: post.id, body: "Followers only" });

      const other = await createUser({ username: "stranger" });
      const otherCaller = createCaller(other.id);
      const comments = await otherCaller.comment.listByPost({ postId: post.id });
      expect(comments).toHaveLength(0);
    });

    it("shows comments on followers-only posts to followers", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });
      const caller = createCaller(userId);
      await caller.comment.create({ postId: post.id, body: "Visible to followers" });

      const follower = await createUser({ username: "follower" });
      const followerCaller = createCaller(follower.id);
      await followerCaller.follow.follow({ targetUserId: userId });

      const comments = await followerCaller.comment.listByPost({ postId: post.id });
      expect(comments).toHaveLength(1);
      expect(comments[0].body).toBe("Visible to followers");
    });

    it("hides replies on restricted posts from unauthorized users", async () => {
      const post = await createPost(userId, {
        visibility: "followers",
        publishedAt: new Date(),
      });
      const caller = createCaller(userId);
      const { comment } = await caller.comment.create({
        postId: post.id,
        body: "Parent",
      });
      await caller.comment.create({
        postId: post.id,
        parentId: comment.id,
        body: "Reply",
      });

      const publicCaller = createPublicCaller();
      const replies = await publicCaller.comment.replies({ commentId: comment.id });
      expect(replies).toHaveLength(0);
    });
  });
});
