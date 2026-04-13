import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("entry router", () => {
  let ownerId: string;
  let orgId: number;
  let compId: number;
  let leaderId: string;
  let followerId: string;
  let leaderRegId: number;
  let followerRegId: number;
  let eventId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    orgId = org.id;

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId });
    await ownerCaller.competition.updateStatus({ competitionId: comp.id, status: "accepting_entries" });
    compId = comp.id;

    // Create an event
    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Newcomer Smooth Waltz",
      style: "smooth",
      level: "newcomer",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;

    // Register two competitors
    const leader = await createUser({ username: "leader_user" });
    const follower = await createUser({ username: "follower_user" });
    leaderId = leader.id;
    followerId = follower.id;

    const leaderCaller = createCaller(leaderId);
    const regResult = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_user",
    });
    leaderRegId = regResult.self.id;
    followerRegId = regResult.partner!.id;
  });

  describe("create", () => {
    it("creates an entry for a couple", async () => {
      const caller = createCaller(leaderId);
      const entry = await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      expect(entry.eventId).toBe(eventId);
      expect(entry.leaderRegistrationId).toBe(leaderRegId);
      expect(entry.followerRegistrationId).toBe(followerRegId);
      expect(entry.scratched).toBe(false);
    });

    it("rejects self as both leader and follower", async () => {
      const caller = createCaller(leaderId);
      await expect(
        caller.entry.create({
          eventId,
          leaderRegistrationId: leaderRegId,
          followerRegistrationId: leaderRegId,
        }),
      ).rejects.toThrow("Leader and follower cannot be the same person");
    });

    it("rejects duplicate entries", async () => {
      const caller = createCaller(leaderId);
      await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      await expect(
        caller.entry.create({
          eventId,
          leaderRegistrationId: leaderRegId,
          followerRegistrationId: followerRegId,
        }),
      ).rejects.toThrow("already exists");
    });
  });

  describe("listByEvent", () => {
    it("returns entries with couple info", async () => {
      const caller = createCaller(leaderId);
      await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const publicCaller = createPublicCaller();
      const entries = await publicCaller.entry.listByEvent({ eventId });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.leaderName).toBeDefined();
      expect(entries[0]!.followerName).toBeDefined();
    });
  });

  describe("listByCompetition", () => {
    it("returns events with their entries", async () => {
      const caller = createCaller(leaderId);
      await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.entry.listByCompetition({ competitionId: compId });

      expect(result.length).toBeGreaterThan(0);
      const eventWithEntries = result.find((e) => e.id === eventId);
      expect(eventWithEntries!.entries).toHaveLength(1);
    });
  });

  describe("remove", () => {
    it("removes an entry", async () => {
      const caller = createCaller(leaderId);
      const entry = await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      await caller.entry.remove({ entryId: entry.id });

      const publicCaller = createPublicCaller();
      const entries = await publicCaller.entry.listByEvent({ eventId });
      expect(entries).toHaveLength(0);
    });
  });

  describe("scratch", () => {
    it("toggles scratch status (staff only)", async () => {
      const caller = createCaller(leaderId);
      const entry = await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      // Assign deck captain
      const deckCaptain = await createUser();
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.staff.assign({
        competitionId: compId,
        userId: deckCaptain.id,
        role: "deck_captain",
      });

      const dcCaller = createCaller(deckCaptain.id);
      const scratched = await dcCaller.entry.scratch({ entryId: entry.id });
      expect(scratched.scratched).toBe(true);

      const unscratched = await dcCaller.entry.scratch({ entryId: entry.id });
      expect(unscratched.scratched).toBe(false);
    });
  });

  describe("bulkCreate", () => {
    it("creates multiple entries at once", async () => {
      const ownerCaller = createCaller(ownerId);
      const event2 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Smooth Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      const caller = createCaller(leaderId);
      const created = await caller.entry.bulkCreate({
        entries: [
          { eventId, leaderRegistrationId: leaderRegId, followerRegistrationId: followerRegId },
          { eventId: event2.id, leaderRegistrationId: leaderRegId, followerRegistrationId: followerRegId },
        ],
      });

      expect(created).toHaveLength(2);
    });

    it("skips duplicates silently in bulk", async () => {
      const caller = createCaller(leaderId);
      await caller.entry.create({
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const created = await caller.entry.bulkCreate({
        entries: [
          { eventId, leaderRegistrationId: leaderRegId, followerRegistrationId: followerRegId },
        ],
      });

      expect(created).toHaveLength(1); // Returns existing, doesn't error
    });

    it("rejects self as both leader and follower in bulk", async () => {
      const caller = createCaller(leaderId);
      await expect(
        caller.entry.bulkCreate({
          entries: [
            { eventId, leaderRegistrationId: leaderRegId, followerRegistrationId: leaderRegId },
          ],
        }),
      ).rejects.toThrow("Leader and follower cannot be the same person");
    });
  });
});
