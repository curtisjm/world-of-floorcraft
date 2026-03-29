import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, truncateAll } from "../../setup/helpers";

describe("follow router", () => {
  let alice: { id: string };
  let bob: { id: string };

  beforeEach(async () => {
    await truncateAll();
    alice = await createUser({ username: "alice" });
    bob = await createUser({ username: "bob" });
  });

  describe("follow", () => {
    it("follows a public user immediately", async () => {
      const caller = createCaller(alice.id);
      const result = await caller.follow.follow({ targetUserId: bob.id });
      expect(result.status).toBe("active");
    });

    it("creates pending request for private user", async () => {
      const privateBob = await createUser({ username: "privatebob", isPrivate: true });
      const caller = createCaller(alice.id);
      const result = await caller.follow.follow({ targetUserId: privateBob.id });
      expect(result.status).toBe("pending");
    });
  });

  describe("unfollow", () => {
    it("unfollows a user", async () => {
      const caller = createCaller(alice.id);
      await caller.follow.follow({ targetUserId: bob.id });
      const result = await caller.follow.unfollow({ targetUserId: bob.id });
      expect(result.success).toBe(true);

      const status = await caller.follow.status({ targetUserId: bob.id });
      expect(status.status).toBeNull();
    });
  });

  describe("acceptRequest and declineRequest", () => {
    it("accepts a pending follow request", async () => {
      const privateBob = await createUser({ username: "privatebob2", isPrivate: true });
      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: privateBob.id });

      const bobCaller = createCaller(privateBob.id);
      const result = await bobCaller.follow.acceptRequest({ requesterId: alice.id });
      expect(result.success).toBe(true);

      const status = await aliceCaller.follow.status({ targetUserId: privateBob.id });
      expect(status.status).toBe("active");
    });

    it("declines a pending follow request", async () => {
      const privateBob = await createUser({ username: "privatebob3", isPrivate: true });
      const aliceCaller = createCaller(alice.id);
      await aliceCaller.follow.follow({ targetUserId: privateBob.id });

      const bobCaller = createCaller(privateBob.id);
      const result = await bobCaller.follow.declineRequest({ requesterId: alice.id });
      expect(result.success).toBe(true);
    });
  });

  describe("status", () => {
    it("returns null when not following", async () => {
      const caller = createCaller(alice.id);
      const result = await caller.follow.status({ targetUserId: bob.id });
      expect(result.status).toBeNull();
    });
  });
});
