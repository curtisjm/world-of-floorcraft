import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("stats router", () => {
  let ownerId: string;
  let compId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    await ownerCaller.competition.updateStatus({ competitionId: comp.id, status: "accepting_entries" });
    compId = comp.id;
  });

  describe("getCompetitionStats", () => {
    it("returns zero stats for empty competition", async () => {
      const ownerCaller = createCaller(ownerId);
      const stats = await ownerCaller.stats.getCompetitionStats({ competitionId: compId });

      expect(stats.totalRegistrations).toBe(0);
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalEvents).toBe(0);
    });

    it("returns accurate stats with registrations and entries", async () => {
      const ownerCaller = createCaller(ownerId);

      // Create events
      const event1 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Waltz",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Waltz"],
      });
      const event2 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      // Register a couple and enter both events
      const leader = await createUser({ username: "stat_leader" });
      const follower = await createUser({ username: "stat_follower" });
      const leaderCaller = createCaller(leader.id);
      const reg = await leaderCaller.registration.register({
        competitionId: compId,
        partnerUsername: "stat_follower",
      });

      await leaderCaller.entry.create({
        eventId: event1.id,
        leaderRegistrationId: reg.self.id,
        followerRegistrationId: reg.partner!.id,
      });
      await leaderCaller.entry.create({
        eventId: event2.id,
        leaderRegistrationId: reg.self.id,
        followerRegistrationId: reg.partner!.id,
      });

      const stats = await ownerCaller.stats.getCompetitionStats({ competitionId: compId });
      expect(stats.totalRegistrations).toBe(2); // leader + follower
      expect(stats.totalEntries).toBe(2); // 2 event entries
      expect(stats.totalEvents).toBe(2);
      expect(stats.entriesPerEvent).toHaveLength(2);
      expect(stats.entriesPerEvent[0]!.entryCount).toBe(1);
    });
  });
});
