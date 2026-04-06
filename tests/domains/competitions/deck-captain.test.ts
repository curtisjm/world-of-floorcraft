import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("deck-captain router", () => {
  let ownerId: string;
  let compId: number;
  let deckCaptainId: string;
  let eventId: number;
  let entryId: number;
  let roundId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "accepting_entries" });

    // Assign deck captain
    const dcUser = await createUser({ username: "deck_captain" });
    deckCaptainId = dcUser.id;
    await ownerCaller.staff.assign({ competitionId: compId, userId: deckCaptainId, role: "deck_captain" });

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

    // Register a couple and create entry
    const leader = await createUser({ username: "leader_dc" });
    const follower = await createUser({ username: "follower_dc" });

    const leaderCaller = createCaller(leader.id);
    const regResult = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_dc",
    });

    const entry = await leaderCaller.entry.create({
      eventId,
      leaderRegistrationId: regResult.self.id,
      followerRegistrationId: regResult.partner!.id,
    });
    entryId = entry.id;

    // Close entries and set up rounds
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "running" });

    // Generate rounds for the event, then get the round ID
    await ownerCaller.round.generateForEvent({ eventId });
    const rounds = await createPublicCaller().round.listByEvent({ eventId });
    roundId = rounds[0]!.id;

    // Start the round (creates active round)
    await ownerCaller.scrutineer.startRound({
      competitionId: compId,
      roundId,
    });
  });

  describe("getCheckinView", () => {
    it("returns entries for active round", async () => {
      const caller = createCaller(deckCaptainId);
      const view = await caller.deckCaptain.getCheckinView({ competitionId: compId });

      expect(view.roundId).toBe(roundId);
      expect(view.entries.length).toBe(1);
      expect(view.entries[0]!.entryId).toBe(entryId);
      expect(view.entries[0]!.status).toBe("not_checked_in");
    });

    it("returns empty when no active round", async () => {
      // Stop the round first
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.scrutineer.stopRound({ competitionId: compId });

      const caller = createCaller(deckCaptainId);
      const view = await caller.deckCaptain.getCheckinView({ competitionId: compId });

      expect(view.roundId).toBeNull();
      expect(view.entries).toEqual([]);
    });

    it("can specify a round explicitly", async () => {
      const caller = createCaller(deckCaptainId);
      const view = await caller.deckCaptain.getCheckinView({
        competitionId: compId,
        roundId,
      });

      expect(view.roundId).toBe(roundId);
      expect(view.entries.length).toBe(1);
    });
  });

  describe("checkin", () => {
    it("marks entry as ready", async () => {
      const caller = createCaller(deckCaptainId);
      const result = await caller.deckCaptain.checkin({ roundId, entryId });

      expect(result.status).toBe("ready");

      // Verify in view
      const view = await caller.deckCaptain.getCheckinView({ competitionId: compId });
      expect(view.entries[0]!.status).toBe("ready");
    });

    it("is idempotent", async () => {
      const caller = createCaller(deckCaptainId);
      await caller.deckCaptain.checkin({ roundId, entryId });
      const result = await caller.deckCaptain.checkin({ roundId, entryId });

      expect(result.status).toBe("ready");
    });
  });

  describe("scratch", () => {
    it("marks entry as scratched", async () => {
      const caller = createCaller(deckCaptainId);
      const result = await caller.deckCaptain.scratch({ roundId, entryId });

      expect(result.status).toBe("scratched");

      const view = await caller.deckCaptain.getCheckinView({ competitionId: compId });
      expect(view.entries[0]!.status).toBe("scratched");
    });
  });

  describe("unscratch", () => {
    it("reverses a scratch", async () => {
      const caller = createCaller(deckCaptainId);
      await caller.deckCaptain.scratch({ roundId, entryId });
      const result = await caller.deckCaptain.unscratch({ roundId, entryId });

      expect(result.status).toBe("ready");

      const view = await caller.deckCaptain.getCheckinView({ competitionId: compId });
      expect(view.entries[0]!.status).toBe("ready");
    });

    it("fails if not checked in", async () => {
      const caller = createCaller(deckCaptainId);
      await expect(
        caller.deckCaptain.unscratch({ roundId, entryId }),
      ).rejects.toThrow("No check-in record");
    });
  });

  describe("getScheduleView", () => {
    it("returns schedule with round statuses", async () => {
      const caller = createCaller(deckCaptainId);
      const view = await caller.deckCaptain.getScheduleView({ competitionId: compId });

      expect(view.events.length).toBe(1);
      expect(view.events[0]!.rounds.length).toBe(1);
      expect(view.events[0]!.entryCount).toBe(1);
    });
  });

  describe("authorization", () => {
    it("rejects non-deck-captain users", async () => {
      const randomUser = await createUser();
      const caller = createCaller(randomUser.id);

      await expect(
        caller.deckCaptain.getCheckinView({ competitionId: compId }),
      ).rejects.toThrow();
    });
  });
});
