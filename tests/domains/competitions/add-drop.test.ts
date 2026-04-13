import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("add-drop router", () => {
  let ownerId: string;
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

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    await ownerCaller.competition.updateStatus({ competitionId: comp.id, status: "accepting_entries" });
    compId = comp.id;

    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Newcomer Smooth Waltz",
      style: "smooth",
      level: "newcomer",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;

    // Register a couple
    const leader = await createUser({ username: "leader_ad" });
    const follower = await createUser({ username: "follower_ad" });
    leaderId = leader.id;
    followerId = follower.id;

    const leaderCaller = createCaller(leaderId);
    const regResult = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_ad",
    });
    leaderRegId = regResult.self.id;
    followerRegId = regResult.partner!.id;

    // Create an entry, then close entries
    await leaderCaller.entry.create({
      eventId,
      leaderRegistrationId: leaderRegId,
      followerRegistrationId: followerRegId,
    });
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });
  });

  describe("submit", () => {
    it("submits a drop request", async () => {
      const caller = createCaller(leaderId);
      const request = await caller.addDrop.submit({
        competitionId: compId,
        type: "drop",
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
        reason: "Schedule conflict",
      });

      expect(request.type).toBe("drop");
      expect(request.status).toBe("pending");
      expect(request.reason).toBe("Schedule conflict");
    });

    it("submits an add request for a new event", async () => {
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
      const request = await caller.addDrop.submit({
        competitionId: compId,
        type: "add",
        eventId: event2.id,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      expect(request.type).toBe("add");
      expect(request.affectsRounds).toBe(false);
    });

    it("rejects add request if entry already exists", async () => {
      const caller = createCaller(leaderId);
      await expect(
        caller.addDrop.submit({
          competitionId: compId,
          type: "add",
          eventId,
          leaderRegistrationId: leaderRegId,
          followerRegistrationId: followerRegId,
        }),
      ).rejects.toThrow("already exists");
    });

    it("rejects if competition is not in entries_closed", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "accepting_entries" });

      const caller = createCaller(leaderId);
      await expect(
        caller.addDrop.submit({
          competitionId: compId,
          type: "drop",
          eventId,
          leaderRegistrationId: leaderRegId,
          followerRegistrationId: followerRegId,
        }),
      ).rejects.toThrow("entries are closed");
    });

    it("rejects submission from non-partner", async () => {
      const stranger = await createUser();
      const strangerCaller = createCaller(stranger.id);

      await expect(
        strangerCaller.addDrop.submit({
          competitionId: compId,
          type: "drop",
          eventId,
          leaderRegistrationId: leaderRegId,
          followerRegistrationId: followerRegId,
        }),
      ).rejects.toThrow("partner or org admin");
    });
  });

  describe("approve / reject", () => {
    it("approves a drop request and removes the entry", async () => {
      const leaderCaller = createCaller(leaderId);
      const request = await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "drop",
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const ownerCaller = createCaller(ownerId);
      const approved = await ownerCaller.addDrop.approve({ requestId: request.id });
      expect(approved.status).toBe("approved");

      // Entry should be gone
      const { listByCompetition } = ownerCaller.entry;
      const allEntries = await ownerCaller.entry.listByCompetition({ competitionId: compId });
      const eventEntries = allEntries.find((e) => e.id === eventId);
      expect(eventEntries!.entries).toHaveLength(0);
    });

    it("approves an add request and creates the entry", async () => {
      const ownerCaller = createCaller(ownerId);
      const event2 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Smooth Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      const leaderCaller = createCaller(leaderId);
      const request = await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "add",
        eventId: event2.id,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      await ownerCaller.addDrop.approve({ requestId: request.id });

      const allEntries = await ownerCaller.entry.listByCompetition({ competitionId: compId });
      const event2Entries = allEntries.find((e) => e.id === event2.id);
      expect(event2Entries!.entries).toHaveLength(1);
    });

    it("rejects a request", async () => {
      const leaderCaller = createCaller(leaderId);
      const request = await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "drop",
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const ownerCaller = createCaller(ownerId);
      const rejected = await ownerCaller.addDrop.reject({ requestId: request.id });
      expect(rejected.status).toBe("rejected");
    });
  });

  describe("listByCompetition", () => {
    it("groups requests by safe vs needs review", async () => {
      const leaderCaller = createCaller(leaderId);
      await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "drop",
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const ownerCaller = createCaller(ownerId);
      const result = await ownerCaller.addDrop.listByCompetition({ competitionId: compId });
      expect(result.safe.length + result.needsReview.length).toBe(1);
      expect(result.resolved).toHaveLength(0);
    });
  });

  describe("approveAllSafe", () => {
    it("bulk approves safe requests", async () => {
      const ownerCaller = createCaller(ownerId);
      const event2 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Smooth Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      const leaderCaller = createCaller(leaderId);
      // Submit two safe requests
      await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "drop",
        eventId,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });
      await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "add",
        eventId: event2.id,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const result = await ownerCaller.addDrop.approveAllSafe({ competitionId: compId });
      expect(result.approved).toBeGreaterThanOrEqual(1);
    });
  });
});
