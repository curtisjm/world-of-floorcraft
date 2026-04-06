import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("live-view router", () => {
  let ownerId: string;
  let compId: number;
  let eventId: number;
  let leaderId: string;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "accepting_entries" });

    // Create event
    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Gold Latin Cha Cha",
      style: "latin",
      level: "gold",
      eventType: "single_dance",
      dances: ["Cha Cha"],
    });
    eventId = event.id;

    // Register a couple
    const leader = await createUser({ username: "leader_lv" });
    const follower = await createUser({ username: "follower_lv" });
    leaderId = leader.id;

    const leaderCaller = createCaller(leader.id);
    const regResult = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_lv",
    });

    await leaderCaller.entry.create({
      eventId,
      leaderRegistrationId: regResult.self.id,
      followerRegistrationId: regResult.partner!.id,
    });
  });

  describe("getSchedule", () => {
    it("works without authentication", async () => {
      const caller = createPublicCaller();
      const schedule = await caller.liveView.getSchedule({ competitionId: compId });

      expect(schedule).toBeDefined();
      expect(schedule!.competition.id).toBe(compId);
      expect(schedule!.events.length).toBe(1);
      expect(schedule!.events[0]!.name).toBe("Gold Latin Cha Cha");
    });

    it("returns event status and entry counts", async () => {
      const caller = createPublicCaller();
      const schedule = await caller.liveView.getSchedule({ competitionId: compId });

      expect(schedule!.events[0]!.status).toBe("upcoming");
      expect(schedule!.events[0]!.entryCount).toBe(1);
    });

    it("returns null for nonexistent competition", async () => {
      const caller = createPublicCaller();
      const schedule = await caller.liveView.getSchedule({ competitionId: 99999 });
      expect(schedule).toBeNull();
    });
  });

  describe("getMyEvents", () => {
    it("returns empty when unauthenticated", async () => {
      const caller = createPublicCaller();
      const result = await caller.liveView.getMyEvents({ competitionId: compId });
      expect(result.myEventIds).toEqual([]);
    });

    it("returns event IDs for authenticated competitor", async () => {
      const caller = createCaller(leaderId);
      const result = await caller.liveView.getMyEvents({ competitionId: compId });

      expect(result.myEventIds).toContain(eventId);
    });

    it("returns empty for user not in competition", async () => {
      const randomUser = await createUser();
      const caller = createCaller(randomUser.id);
      const result = await caller.liveView.getMyEvents({ competitionId: compId });

      expect(result.myEventIds).toEqual([]);
    });
  });

  describe("getAblyToken", () => {
    it("returns a token (mocked)", async () => {
      const caller = createPublicCaller();
      const token = await caller.liveView.getAblyToken({ competitionId: compId });

      expect(token).toBeDefined();
    });
  });

  describe("getPublishedResults", () => {
    it("returns null for nonexistent event", async () => {
      const caller = createPublicCaller();
      const results = await caller.liveView.getPublishedResults({ eventId: 99999 });
      expect(results).toBeNull();
    });

    it("returns empty rounds when no published results", async () => {
      const caller = createPublicCaller();
      const results = await caller.liveView.getPublishedResults({ eventId });

      expect(results).toBeDefined();
      expect(results!.eventName).toBe("Gold Latin Cha Cha");
      expect(results!.rounds).toEqual([]);
    });
  });
});
