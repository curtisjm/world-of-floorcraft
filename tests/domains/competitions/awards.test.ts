import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("awards router", () => {
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
  });

  describe("calculate", () => {
    it("returns zero awards for empty events", async () => {
      const ownerCaller = createCaller(ownerId);
      const result = await ownerCaller.awards.calculate({ competitionId: compId });

      expect(result.perEvent).toHaveLength(1);
      expect(result.perEvent[0]!.medals).toBe(0);
      expect(result.perEvent[0]!.ribbons).toBe(0);
      expect(result.totals.medals).toBe(0);
      expect(result.totals.ribbons).toBe(0);
    });

    it("calculates medals and ribbons based on entries", async () => {
      const ownerCaller = createCaller(ownerId);
      // Set max final size to 6
      await ownerCaller.competition.update({ competitionId: compId, maxFinalSize: 6 });

      // Register 6 couples
      for (let i = 0; i < 6; i++) {
        const leader = await createUser();
        const follower = await createUser();
        const leaderCaller = createCaller(leader.id);
        const reg = await leaderCaller.registration.register({
          competitionId: compId,
          partnerUsername: follower.username!,
        });
        await leaderCaller.entry.create({
          eventId,
          leaderRegistrationId: reg.self.id,
          followerRegistrationId: reg.partner!.id,
        });
      }

      const result = await ownerCaller.awards.calculate({ competitionId: compId });
      const eventAwards = result.perEvent.find((e) => e.eventId === eventId)!;

      // 6 entries, finalSize = 6
      // Medals: min(6, 3) * 2 = 6 (places 1-3, 2 per couple)
      expect(eventAwards.medals).toBe(6);
      // Ribbons: (6 - 3) * 2 = 6 (places 4-6, 2 per couple)
      expect(eventAwards.ribbons).toBe(6);
    });

    it("applies buffer percentage", async () => {
      const ownerCaller = createCaller(ownerId);

      // Register 4 couples
      for (let i = 0; i < 4; i++) {
        const leader = await createUser();
        const follower = await createUser();
        const leaderCaller = createCaller(leader.id);
        const reg = await leaderCaller.registration.register({
          competitionId: compId,
          partnerUsername: follower.username!,
        });
        await leaderCaller.entry.create({
          eventId,
          leaderRegistrationId: reg.self.id,
          followerRegistrationId: reg.partner!.id,
        });
      }

      const result = await ownerCaller.awards.calculate({
        competitionId: compId,
        bufferPercentage: 50,
      });

      // 4 entries: 3 medal places (6 medals) + 1 ribbon place (2 ribbons)
      expect(result.totals.medals).toBe(6);
      expect(result.totals.ribbons).toBe(2);
      // With 50% buffer
      expect(result.totals.medalsWithBuffer).toBe(9); // ceil(6 * 1.5)
      expect(result.totals.ribbonsWithBuffer).toBe(3); // ceil(2 * 1.5)
      expect(result.bufferPercentage).toBe(50);
    });

    it("caps final size at entry count when fewer entries than max", async () => {
      const ownerCaller = createCaller(ownerId);
      // Default maxFinalSize is 8, but we only have 2 entries

      const leader = await createUser();
      const follower = await createUser();
      const leaderCaller = createCaller(leader.id);
      const reg = await leaderCaller.registration.register({
        competitionId: compId,
        partnerUsername: follower.username!,
      });
      await leaderCaller.entry.create({
        eventId,
        leaderRegistrationId: reg.self.id,
        followerRegistrationId: reg.partner!.id,
      });

      const result = await ownerCaller.awards.calculate({ competitionId: compId });
      const eventAwards = result.perEvent.find((e) => e.eventId === eventId)!;

      // Only 1 entry, so finalSize = 1
      expect(eventAwards.finalSize).toBe(1);
      expect(eventAwards.medals).toBe(2); // 1 place * 2 per couple
      expect(eventAwards.ribbons).toBe(0);
    });
  });
});
