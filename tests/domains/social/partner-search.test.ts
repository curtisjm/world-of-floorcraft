import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, truncateAll } from "../../setup/helpers";

describe("partnerSearch router", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser({ username: "dancer1" });
    userId = user.id;
  });

  describe("upsert", () => {
    it("creates a partner search profile", async () => {
      const caller = createCaller(userId);
      const result = await caller.partnerSearch.upsert({
        danceStyles: ["latin", "standard"],
        rolePreference: "lead",
        height: "5'10\"",
        location: "New York, NY",
        bio: "Looking for a practice partner",
      });

      expect(result.userId).toBe(userId);
      expect(result.danceStyles).toEqual(["latin", "standard"]);
      expect(result.rolePreference).toBe("lead");
      expect(result.height).toBe("5'10\"");
      expect(result.location).toBe("New York, NY");
      expect(result.bio).toBe("Looking for a practice partner");
    });

    it("updates an existing partner search profile", async () => {
      const caller = createCaller(userId);

      await caller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "lead",
      });

      const updated = await caller.partnerSearch.upsert({
        danceStyles: ["latin", "rhythm"],
        rolePreference: "both",
        location: "LA",
      });

      expect(updated.danceStyles).toEqual(["latin", "rhythm"]);
      expect(updated.rolePreference).toBe("both");
      expect(updated.location).toBe("LA");
    });

    it("rejects empty dance styles", async () => {
      const caller = createCaller(userId);
      await expect(
        caller.partnerSearch.upsert({
          danceStyles: [],
          rolePreference: "lead",
        })
      ).rejects.toThrow();
    });
  });

  describe("me", () => {
    it("returns null when no profile exists", async () => {
      const caller = createCaller(userId);
      const result = await caller.partnerSearch.me();
      expect(result).toBeNull();
    });

    it("returns the profile when it exists", async () => {
      const caller = createCaller(userId);
      await caller.partnerSearch.upsert({
        danceStyles: ["smooth"],
        rolePreference: "follow",
      });

      const result = await caller.partnerSearch.me();
      expect(result).not.toBeNull();
      expect(result!.danceStyles).toEqual(["smooth"]);
      expect(result!.rolePreference).toBe("follow");
    });
  });

  describe("getByUserId", () => {
    it("returns null for a user without a partner search profile", async () => {
      const viewer = await createUser({ username: "viewer" });
      const caller = createCaller(viewer.id);
      const result = await caller.partnerSearch.getByUserId({ userId });
      expect(result).toBeNull();
    });

    it("returns the partner search profile for a user", async () => {
      const caller = createCaller(userId);
      await caller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "lead",
        location: "Chicago",
      });

      const viewer = await createUser({ username: "viewer" });
      const viewerCaller = createCaller(viewer.id);
      const result = await viewerCaller.partnerSearch.getByUserId({ userId });
      expect(result).not.toBeNull();
      expect(result!.location).toBe("Chicago");
    });
  });

  describe("remove", () => {
    it("removes an existing partner search profile", async () => {
      const caller = createCaller(userId);
      await caller.partnerSearch.upsert({
        danceStyles: ["standard"],
        rolePreference: "lead",
      });

      const result = await caller.partnerSearch.remove();
      expect(result.success).toBe(true);

      const profile = await caller.partnerSearch.me();
      expect(profile).toBeNull();
    });

    it("throws when no profile exists to remove", async () => {
      const caller = createCaller(userId);
      await expect(caller.partnerSearch.remove()).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("discover", () => {
    it("returns partner seekers excluding the current user", async () => {
      const caller = createCaller(userId);
      await caller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "lead",
      });

      const other = await createUser({ username: "other_dancer" });
      const otherCaller = createCaller(other.id);
      await otherCaller.partnerSearch.upsert({
        danceStyles: ["latin", "standard"],
        rolePreference: "follow",
        location: "Miami",
      });

      // userId should see other but not themselves
      const results = await caller.partnerSearch.discover({ limit: 20 });
      expect(results.items).toHaveLength(1);
      expect(results.items[0].userId).toBe(other.id);
      expect(results.items[0].username).toBe("other_dancer");
      expect(results.items[0].danceStyles).toEqual(["latin", "standard"]);
    });

    it("filters by dance style", async () => {
      const caller = createCaller(userId);

      const latin = await createUser({ username: "latin_dancer" });
      const latinCaller = createCaller(latin.id);
      await latinCaller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "follow",
      });

      const standard = await createUser({ username: "standard_dancer" });
      const standardCaller = createCaller(standard.id);
      await standardCaller.partnerSearch.upsert({
        danceStyles: ["standard"],
        rolePreference: "lead",
      });

      const results = await caller.partnerSearch.discover({
        limit: 20,
        style: "latin",
      });
      expect(results.items).toHaveLength(1);
      expect(results.items[0].userId).toBe(latin.id);
    });

    it("filters by role preference", async () => {
      const caller = createCaller(userId);

      const lead = await createUser({ username: "lead_dancer" });
      const leadCaller = createCaller(lead.id);
      await leadCaller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "lead",
      });

      const follow = await createUser({ username: "follow_dancer" });
      const followCaller = createCaller(follow.id);
      await followCaller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "follow",
      });

      const results = await caller.partnerSearch.discover({
        limit: 20,
        rolePreference: "follow",
      });
      expect(results.items).toHaveLength(1);
      expect(results.items[0].userId).toBe(follow.id);
    });

    it("filters by location", async () => {
      const caller = createCaller(userId);

      const ny = await createUser({ username: "ny_dancer" });
      const nyCaller = createCaller(ny.id);
      await nyCaller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "lead",
        location: "New York, NY",
      });

      const la = await createUser({ username: "la_dancer" });
      const laCaller = createCaller(la.id);
      await laCaller.partnerSearch.upsert({
        danceStyles: ["latin"],
        rolePreference: "lead",
        location: "Los Angeles, CA",
      });

      const results = await caller.partnerSearch.discover({
        limit: 20,
        location: "New York",
      });
      expect(results.items).toHaveLength(1);
      expect(results.items[0].userId).toBe(ny.id);
    });

    it("paginates results", async () => {
      const caller = createCaller(userId);

      // Create 3 partner seekers
      for (let i = 0; i < 3; i++) {
        const u = await createUser({ username: `dancer_${i}` });
        const c = createCaller(u.id);
        await c.partnerSearch.upsert({
          danceStyles: ["latin"],
          rolePreference: "lead",
        });
      }

      const page1 = await caller.partnerSearch.discover({ limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await caller.partnerSearch.discover({
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeUndefined();
    });
  });
});
