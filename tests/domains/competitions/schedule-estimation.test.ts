import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("schedule-estimation router", () => {
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

    // Apply default template so we have days/sessions
    await ownerCaller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2026-05-01" });

    // Create an event and assign to a session
    const schedule = await ownerCaller.schedule.getSchedule({ competitionId: compId });
    const firstSession = schedule[0]!.blocks.find((b) => b.type === "session");

    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Newcomer Smooth Waltz",
      style: "smooth",
      level: "newcomer",
      eventType: "single_dance",
      dances: ["Waltz"],
      sessionId: firstSession?.id,
    });
    eventId = event.id;
  });

  describe("getEstimatedSchedule", () => {
    it("returns schedule with time estimates", async () => {
      const publicCaller = createPublicCaller();
      const result = await publicCaller.scheduleEstimation.getEstimatedSchedule({
        competitionId: compId,
      });

      expect(result.minutesPerCouplePerDance).toBe(1.5);
      expect(result.transitionMinutes).toBe(2);
      expect(result.schedule).toHaveLength(1); // 1 day
      expect(result.schedule[0]!.blocks.length).toBeGreaterThan(0);
    });

    it("estimates time based on entry count", async () => {
      // Register a couple and enter the event
      const leader = await createUser({ username: "est_leader" });
      const follower = await createUser({ username: "est_follower" });
      const leaderCaller = createCaller(leader.id);
      const reg = await leaderCaller.registration.register({
        competitionId: compId,
        partnerUsername: "est_follower",
      });
      await leaderCaller.entry.create({
        eventId,
        leaderRegistrationId: reg.self.id,
        followerRegistrationId: reg.partner!.id,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.scheduleEstimation.getEstimatedSchedule({
        competitionId: compId,
      });

      // Find the session with our event
      const sessionBlock = result.schedule[0]!.blocks.find(
        (b) => b.events.some((e) => e.eventId === eventId),
      );
      expect(sessionBlock).toBeDefined();

      const eventEstimate = sessionBlock!.events.find((e) => e.eventId === eventId);
      expect(eventEstimate!.entryCount).toBe(1);
      // 1 couple * 1 dance * 1.5 min + 2 min transition = 3.5
      expect(eventEstimate!.estimatedMinutes).toBe(3.5);
    });
  });

  describe("updateCompSettings", () => {
    it("updates estimation settings", async () => {
      const ownerCaller = createCaller(ownerId);
      const updated = await ownerCaller.scheduleEstimation.updateCompSettings({
        competitionId: compId,
        minutesPerCouplePerDance: "2.0",
        transitionMinutes: "3.0",
      });

      expect(updated.minutesPerCouplePerDance).toBe("2.0");
      expect(updated.transitionMinutes).toBe("3.0");
    });
  });

  describe("setEventOverride / removeEventOverride", () => {
    it("sets and removes a manual time override", async () => {
      const ownerCaller = createCaller(ownerId);

      const override = await ownerCaller.scheduleEstimation.setEventOverride({
        eventId,
        estimatedMinutes: "15.0",
      });
      expect(override.estimatedMinutes).toBe("15.0");

      // The schedule should use the override
      const publicCaller = createPublicCaller();
      const schedule = await publicCaller.scheduleEstimation.getEstimatedSchedule({
        competitionId: compId,
      });
      const sessionBlock = schedule.schedule[0]!.blocks.find(
        (b) => b.events.some((e) => e.eventId === eventId),
      );
      const eventEst = sessionBlock!.events.find((e) => e.eventId === eventId);
      expect(eventEst!.estimatedMinutes).toBe(15);

      // Remove override
      await ownerCaller.scheduleEstimation.removeEventOverride({ eventId });

      // Should revert to computed estimate
      const schedule2 = await publicCaller.scheduleEstimation.getEstimatedSchedule({
        competitionId: compId,
      });
      const sessionBlock2 = schedule2.schedule[0]!.blocks.find(
        (b) => b.events.some((e) => e.eventId === eventId),
      );
      const eventEst2 = sessionBlock2!.events.find((e) => e.eventId === eventId);
      expect(eventEst2!.estimatedMinutes).not.toBe(15);
    });

    it("updates existing override", async () => {
      const ownerCaller = createCaller(ownerId);

      await ownerCaller.scheduleEstimation.setEventOverride({
        eventId,
        estimatedMinutes: "10.0",
      });
      const updated = await ownerCaller.scheduleEstimation.setEventOverride({
        eventId,
        estimatedMinutes: "20.0",
      });
      expect(updated.estimatedMinutes).toBe("20.0");
    });
  });
});
