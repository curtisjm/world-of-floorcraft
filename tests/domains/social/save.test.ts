import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, createPost, truncateAll } from "../../setup/helpers";

describe("save router", () => {
  let userId: string;
  let postId: number;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser({ username: "saver" });
    userId = user.id;
    const author = await createUser({ username: "author" });
    const post = await createPost(author.id, { publishedAt: new Date() });
    postId = post.id;
  });

  describe("savePost and unsavePost", () => {
    it("saves and unsaves a post", async () => {
      const caller = createCaller(userId);
      await caller.save.savePost({ postId, folderId: null });

      const folders = await caller.save.folders();
      expect(folders.allSavedCount).toBe(1);

      await caller.save.unsavePost({ postId, folderId: null });
      const after = await caller.save.folders();
      expect(after.allSavedCount).toBe(0);
    });
  });

  describe("folders", () => {
    it("creates and lists folders", async () => {
      const caller = createCaller(userId);
      const folder = await caller.save.createFolder({ name: "Favorites" });
      expect(folder.name).toBe("Favorites");

      const result = await caller.save.folders();
      expect(result.folders).toHaveLength(1);
    });

    it("deletes a folder and clears saved posts folderId", async () => {
      const caller = createCaller(userId);
      const folder = await caller.save.createFolder({ name: "ToDelete" });
      await caller.save.savePost({ postId, folderId: folder.id });

      await caller.save.deleteFolder({ folderId: folder.id });
      const result = await caller.save.folders();
      expect(result.folders).toHaveLength(0);
      // The saved post still exists, just without a folder
      expect(result.allSavedCount).toBe(1);
    });
  });

  describe("postsInFolder", () => {
    it("returns saved posts without folder", async () => {
      const caller = createCaller(userId);
      await caller.save.savePost({ postId, folderId: null });

      const posts = await caller.save.postsInFolder({ folderId: null });
      expect(posts).toHaveLength(1);
    });
  });
});
