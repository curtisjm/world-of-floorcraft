import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("round router", () => {
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

  async function registerCouple(ownerCaller: ReturnType<typeof createCaller>) {
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

    return { leader, follower, reg };
  }

  describe("generateForEvent", () => {
    it("creates a straight final for small entry counts", async () => {
      const ownerCaller = createCaller(ownerId);

      // Register 3 couples (under default maxFinalSize of 8)
      await registerCouple(ownerCaller);
      await registerCouple(ownerCaller);
      await registerCouple(ownerCaller);

      const result = await ownerCaller.round.generateForEvent({ eventId });
      expect(result.rounds).toBe(1);

      const roundList = await ownerCaller.round.listByEvent({ eventId });
      expect(roundList).toHaveLength(1);
      expect(roundList[0]!.roundType).toBe("final");
      expect(roundList[0]!.heats).toHaveLength(1);
      expect(roundList[0]!.heats[0]!.entries).toHaveLength(3);
    });

    it("creates preliminary rounds for large entry counts", async () => {
      const ownerCaller = createCaller(ownerId);

      // Set max final size to 4 to force prelim rounds with fewer couples
      await ownerCaller.competition.update({ competitionId: compId, maxFinalSize: 4 });

      // Register 10 couples (well above maxFinalSize of 4)
      for (let i = 0; i < 10; i++) {
        await registerCouple(ownerCaller);
      }

      const result = await ownerCaller.round.generateForEvent({ eventId });
      expect(result.rounds).toBeGreaterThan(1);

      const roundList = await ownerCaller.round.listByEvent({ eventId });
      // Should have at least a semi_final + final
      expect(roundList.length).toBeGreaterThanOrEqual(2);
      expect(roundList[roundList.length - 1]!.roundType).toBe("final");
    });
  });

  describe("generateForCompetition", () => {
    it("generates rounds for all events", async () => {
      const ownerCaller = createCaller(ownerId);

      // Create a second event
      await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Smooth Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      await registerCouple(ownerCaller);

      const result = await ownerCaller.round.generateForCompetition({ competitionId: compId });
      expect(result.events).toBe(2);
      // Only the first event has entries, so only 1 round generated
      expect(result.totalRounds).toBe(1);
    });
  });

  describe("addRound / removeRound", () => {
    it("manually adds and removes a round", async () => {
      const ownerCaller = createCaller(ownerId);

      const round = await ownerCaller.round.addRound({
        eventId,
        roundType: "final",
        position: 1,
        callbacksRequested: 6,
      });
      expect(round.roundType).toBe("final");
      expect(round.callbacksRequested).toBe(6);

      await ownerCaller.round.removeRound({ roundId: round.id });
      const roundList = await ownerCaller.round.listByEvent({ eventId });
      expect(roundList).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates callbacks requested", async () => {
      const ownerCaller = createCaller(ownerId);
      const round = await ownerCaller.round.addRound({
        eventId,
        roundType: "semi_final",
        position: 1,
      });

      const updated = await ownerCaller.round.update({
        roundId: round.id,
        callbacksRequested: 8,
      });
      expect(updated.callbacksRequested).toBe(8);
    });
  });

  describe("heat management", () => {
    it("reassigns heats for a round", async () => {
      const ownerCaller = createCaller(ownerId);

      // Set small heat size to force multiple heats
      await ownerCaller.competition.update({ competitionId: compId, maxHeatSize: 2 });

      // Register 4 couples
      for (let i = 0; i < 4; i++) {
        await registerCouple(ownerCaller);
      }

      // Generate rounds first (creates heats)
      await ownerCaller.round.generateForEvent({ eventId });
      const roundList = await ownerCaller.round.listByEvent({ eventId });
      const firstRound = roundList[0]!;

      // Reassign heats
      const result = await ownerCaller.round.reassignHeats({ roundId: firstRound.id });
      expect(result.heats).toBeGreaterThanOrEqual(2);
      expect(result.entries).toBe(4);
    });

    it("approves heats for a round", async () => {
      const ownerCaller = createCaller(ownerId);

      // Register 3 couples and generate rounds
      for (let i = 0; i < 3; i++) {
        await registerCouple(ownerCaller);
      }
      await ownerCaller.round.generateForEvent({ eventId });
      const roundList = await ownerCaller.round.listByEvent({ eventId });
      const firstRound = roundList[0]!;

      expect(firstRound.heatsApproved).toBe(false);

      const approved = await ownerCaller.round.approveHeats({ roundId: firstRound.id });
      expect(approved.heatsApproved).toBe(true);
    });

    it("resets heats approval on reassignHeats", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.update({ competitionId: compId, maxHeatSize: 2 });

      for (let i = 0; i < 4; i++) {
        await registerCouple(ownerCaller);
      }
      await ownerCaller.round.generateForEvent({ eventId });
      const roundList = await ownerCaller.round.listByEvent({ eventId });
      const firstRound = roundList[0]!;

      // Approve heats first
      await ownerCaller.round.approveHeats({ roundId: firstRound.id });

      // Reassign heats should reset approval
      await ownerCaller.round.reassignHeats({ roundId: firstRound.id });

      const updatedRounds = await ownerCaller.round.listByEvent({ eventId });
      expect(updatedRounds[0]!.heatsApproved).toBe(false);
    });

    it("moves an entry between heats", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.update({ competitionId: compId, maxHeatSize: 2 });

      for (let i = 0; i < 4; i++) {
        await registerCouple(ownerCaller);
      }

      await ownerCaller.round.generateForEvent({ eventId });
      const roundList = await ownerCaller.round.listByEvent({ eventId });
      const firstRound = roundList[0]!;

      if (firstRound.heats.length >= 2) {
        const fromHeat = firstRound.heats[0]!;
        const toHeat = firstRound.heats[1]!;
        const entryId = fromHeat.entries[0]!;

        const assignment = await ownerCaller.round.moveEntry({
          entryId,
          fromHeatId: fromHeat.id,
          toHeatId: toHeat.id,
        });
        expect(assignment.heatId).toBe(toHeat.id);
      }
    });
  });
});
