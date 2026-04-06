import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("tba router", () => {
  let ownerId: string;
  let compId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const caller = createCaller(ownerId);
    const comp = await caller.competition.create({ name: "Test Comp", orgId: org.id });
    compId = comp.id;
  });

  describe("create / list / markFulfilled / delete", () => {
    it("manages TBA listings", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      const listing = await caller.tba.create({
        competitionId: compId,
        style: "smooth",
        level: "gold",
        role: "follower",
        notes: "Looking for a follower for Gold Smooth",
      });
      expect(listing.style).toBe("smooth");
      expect(listing.role).toBe("follower");

      const publicCaller = createPublicCaller();
      let listings = await publicCaller.tba.listByCompetition({ competitionId: compId });
      expect(listings).toHaveLength(1);
      expect(listings[0]!.displayName).toBeDefined();

      // Filter by style
      const filtered = await publicCaller.tba.listByCompetition({
        competitionId: compId,
        style: "latin",
      });
      expect(filtered).toHaveLength(0);

      // Mark fulfilled
      await caller.tba.markFulfilled({ listingId: listing.id });
      listings = await publicCaller.tba.listByCompetition({ competitionId: compId });
      expect(listings).toHaveLength(0); // Fulfilled listings are hidden

      // Delete
      const listing2 = await caller.tba.create({
        competitionId: compId,
        style: "latin",
        level: "bronze",
        role: "leader",
      });
      await caller.tba.delete({ listingId: listing2.id });
      listings = await publicCaller.tba.listByCompetition({ competitionId: compId });
      expect(listings).toHaveLength(0);
    });

    it("prevents deleting another user's listing", async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      const c1 = createCaller(user1.id);
      const listing = await c1.tba.create({
        competitionId: compId,
        style: "standard",
        level: "newcomer",
        role: "leader",
      });

      const c2 = createCaller(user2.id);
      await expect(c2.tba.delete({ listingId: listing.id })).rejects.toThrow("your own");
    });
  });
});
