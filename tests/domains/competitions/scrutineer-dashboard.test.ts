import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("scrutineer-dashboard router", () => {
  let ownerId: string;
  let compId: number;
  let eventId: number;

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
      name: "Newcomer Standard Waltz",
      style: "standard",
      level: "newcomer",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;

    // Register a couple
    const leader = await createUser({ username: "leader_sd" });
    const follower = await createUser({ username: "follower_sd" });
    const leaderCaller = createCaller(leader.id);
    const regResult = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_sd",
    });

    await leaderCaller.entry.create({
      eventId,
      leaderRegistrationId: regResult.self.id,
      followerRegistrationId: regResult.partner!.id,
    });
  });

  describe("getDashboard", () => {
    it("returns full competition state", async () => {
      const caller = createCaller(ownerId);
      const dashboard = await caller.scrutineerDashboard.getDashboard({ competitionId: compId });

      expect(dashboard.competition.id).toBe(compId);
      expect(dashboard.activeRound).toBeNull();
      expect(dashboard.registrations.total).toBe(2); // leader + follower
      expect(dashboard.registrations.checkedIn).toBe(0);
      expect(dashboard.events.length).toBe(1);
      expect(dashboard.events[0]!.entryCount).toBe(1);
    });

    it("shows active round when running", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "running" });

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const round = rounds[0]!;
      await ownerCaller.scrutineer.startRound({ competitionId: compId, roundId: round.id });

      const dashboard = await ownerCaller.scrutineerDashboard.getDashboard({ competitionId: compId });
      expect(dashboard.activeRound).toBeDefined();
      expect(dashboard.activeRound!.roundId).toBe(round.id);
      expect(dashboard.submissions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getEventProgress", () => {
    it("returns round details for an event", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "running" });

      await ownerCaller.round.generateForEvent({ eventId });

      const progress = await ownerCaller.scrutineerDashboard.getEventProgress({ eventId });
      expect(progress.event.name).toBe("Newcomer Standard Waltz");
      expect(progress.rounds.length).toBe(1);
      expect(progress.rounds[0]!.roundType).toBe("final");
      expect(progress.rounds[0]!.status).toBe("pending");
    });
  });

  describe("markEventComplete", () => {
    it("rejects if results not all published", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "running" });

      await ownerCaller.round.generateForEvent({ eventId });

      await expect(
        ownerCaller.scrutineerDashboard.markEventComplete({ eventId }),
      ).rejects.toThrow("not published");
    });
  });

  describe("updateScheduleLive", () => {
    it("updates schedule block times", async () => {
      const ownerCaller = createCaller(ownerId);

      // Create schedule first
      const schedule = await ownerCaller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2025-06-15" });
      const blockId = schedule.blocks[0].id;

      const result = await ownerCaller.scrutineerDashboard.updateScheduleLive({
        competitionId: compId,
        updates: [
          {
            blockId,
            estimatedStartTime: "2025-06-15T09:00:00.000Z",
            estimatedEndTime: "2025-06-15T12:00:00.000Z",
          },
        ],
      });

      expect(result.updated).toBe(1);
    });
  });

  describe("authorization", () => {
    it("rejects non-organizer users", async () => {
      const randomUser = await createUser();
      const caller = createCaller(randomUser.id);

      await expect(
        caller.scrutineerDashboard.getDashboard({ competitionId: compId }),
      ).rejects.toThrow();
    });
  });
});
