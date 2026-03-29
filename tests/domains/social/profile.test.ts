import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createPublicCaller, createUser, truncateAll } from "../../setup/helpers";

describe("profile router", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("me", () => {
    it("returns the current user", async () => {
      const user = await createUser({ username: "alice", displayName: "Alice" });
      const caller = createCaller(user.id);
      const result = await caller.profile.me();
      expect(result.id).toBe(user.id);
      expect(result.username).toBe("alice");
    });
  });

  describe("getByUsername", () => {
    it("returns user profile by username", async () => {
      const user = await createUser({ username: "bob", displayName: "Bob" });
      const caller = createPublicCaller();
      const result = await caller.profile.getByUsername({ username: "bob" });
      expect(result.displayName).toBe("Bob");
    });

    it("throws for unknown username", async () => {
      const caller = createPublicCaller();
      await expect(
        caller.profile.getByUsername({ username: "nonexistent" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("update", () => {
    it("updates profile fields", async () => {
      const user = await createUser({ username: "charlie" });
      const caller = createCaller(user.id);
      const updated = await caller.profile.update({
        displayName: "Charlie Updated",
        bio: "Hello!",
      });
      expect(updated.displayName).toBe("Charlie Updated");
      expect(updated.bio).toBe("Hello!");
    });

    it("rejects duplicate username", async () => {
      const user1 = await createUser({ username: "alice" });
      const user2 = await createUser({ username: "bob" });
      const caller = createCaller(user2.id);
      await expect(
        caller.profile.update({ username: "alice" })
      ).rejects.toThrow();
    });
  });
});
