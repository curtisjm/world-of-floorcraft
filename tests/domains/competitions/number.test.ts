import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("number router", () => {
  let ownerId: string;
  let orgId: number;
  let compId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    orgId = org.id;

    const caller = createCaller(ownerId);
    const comp = await caller.competition.create({ name: "Test Comp", orgId });
    await caller.competition.updateStatus({ competitionId: comp.id, status: "accepting_entries" });
    compId = comp.id;
  });

  describe("autoAssign", () => {
    it("assigns numbers to leaders starting from numberStart", async () => {
      const ownerCaller = createCaller(ownerId);

      // Create event
      const event = await ownerCaller.event.create({
        competitionId: compId,
        name: "Test Event",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Waltz"],
      });

      // Register two couples
      const leader1 = await createUser({ username: "leader1" });
      const follower1 = await createUser({ username: "follower1" });
      const leader2 = await createUser({ username: "leader2" });
      const follower2 = await createUser({ username: "follower2" });

      const l1Caller = createCaller(leader1.id);
      const reg1 = await l1Caller.registration.register({
        competitionId: compId,
        partnerUsername: "follower1",
      });

      const l2Caller = createCaller(leader2.id);
      const reg2 = await l2Caller.registration.register({
        competitionId: compId,
        partnerUsername: "follower2",
      });

      // Create entries (leaders need entries to get numbers)
      await l1Caller.entry.create({
        eventId: event.id,
        leaderRegistrationId: reg1.self.id,
        followerRegistrationId: reg1.partner!.id,
      });
      await l2Caller.entry.create({
        eventId: event.id,
        leaderRegistrationId: reg2.self.id,
        followerRegistrationId: reg2.partner!.id,
      });

      // Auto-assign
      const result = await ownerCaller.number.autoAssign({ competitionId: compId });
      expect(result.assigned).toBe(2);

      // Verify
      const assignments = await ownerCaller.number.listAssignments({ competitionId: compId });
      const withNumbers = assignments.filter((a) => a.competitorNumber !== null);
      expect(withNumbers).toHaveLength(2);
      expect(withNumbers[0]!.competitorNumber).toBe(1);
      expect(withNumbers[1]!.competitorNumber).toBe(2);
    });

    it("respects number exclusions", async () => {
      const ownerCaller = createCaller(ownerId);

      // Set exclusions
      await ownerCaller.competition.update({
        competitionId: compId,
        numberStart: 1,
        numberExclusions: [1, 3],
      });

      // Create event and register
      const event = await ownerCaller.event.create({
        competitionId: compId,
        name: "Test",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Waltz"],
      });

      const leader = await createUser({ username: "lead" });
      const follower = await createUser({ username: "follow" });
      const lCaller = createCaller(leader.id);
      const reg = await lCaller.registration.register({
        competitionId: compId,
        partnerUsername: "follow",
      });

      await lCaller.entry.create({
        eventId: event.id,
        leaderRegistrationId: reg.self.id,
        followerRegistrationId: reg.partner!.id,
      });

      await ownerCaller.number.autoAssign({ competitionId: compId });

      const assignments = await ownerCaller.number.listAssignments({ competitionId: compId });
      const leader1 = assignments.find((a) => a.userId === leader.id);
      expect(leader1!.competitorNumber).toBe(2); // Skipped 1 and 3
    });
  });

  describe("manualAssign", () => {
    it("assigns a specific number", async () => {
      const user = await createUser();
      const userCaller = createCaller(user.id);
      await userCaller.registration.register({ competitionId: compId });
      const reg = await userCaller.registration.getMyRegistration({ competitionId: compId });

      const ownerCaller = createCaller(ownerId);
      const updated = await ownerCaller.number.manualAssign({
        registrationId: reg!.id,
        number: 42,
      });
      expect(updated.competitorNumber).toBe(42);
    });

    it("rejects duplicate numbers", async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      const c1 = createCaller(user1.id);
      const c2 = createCaller(user2.id);
      await c1.registration.register({ competitionId: compId });
      await c2.registration.register({ competitionId: compId });

      const reg1 = await c1.registration.getMyRegistration({ competitionId: compId });
      const reg2 = await c2.registration.getMyRegistration({ competitionId: compId });

      const ownerCaller = createCaller(ownerId);
      await ownerCaller.number.manualAssign({ registrationId: reg1!.id, number: 10 });

      await expect(
        ownerCaller.number.manualAssign({ registrationId: reg2!.id, number: 10 }),
      ).rejects.toThrow("already assigned");
    });
  });

  describe("unassign", () => {
    it("removes a number assignment", async () => {
      const user = await createUser();
      const userCaller = createCaller(user.id);
      await userCaller.registration.register({ competitionId: compId });
      const reg = await userCaller.registration.getMyRegistration({ competitionId: compId });

      const ownerCaller = createCaller(ownerId);
      await ownerCaller.number.manualAssign({ registrationId: reg!.id, number: 5 });
      const unassigned = await ownerCaller.number.unassign({ registrationId: reg!.id });
      expect(unassigned.competitorNumber).toBeNull();
    });
  });
});
