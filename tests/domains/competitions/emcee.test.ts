import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("emcee router", () => {
  let ownerId: string;
  let compId: number;
  let emceeId: string;
  let eventId: number;
  let dayId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    compId = comp.id;

    // Assign emcee
    const emceeUser = await createUser({ username: "emcee_user" });
    emceeId = emceeUser.id;
    await ownerCaller.staff.assign({ competitionId: compId, userId: emceeId, role: "emcee" });

    // Create schedule day
    const schedule = await ownerCaller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2025-06-15" });
    dayId = schedule.day.id;

    // Create event
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "accepting_entries" });
    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Gold Standard Waltz",
      style: "standard",
      level: "gold",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;
  });

  describe("getEmceeView", () => {
    it("returns schedule with events and notes", async () => {
      const caller = createCaller(emceeId);
      const view = await caller.emcee.getEmceeView({ competitionId: compId });

      expect(view.days.length).toBeGreaterThan(0);
      expect(view.events.length).toBe(1);
      expect(view.notes).toEqual([]);
      expect(view.currentEvent).toBeNull();
    });
  });

  describe("createNote", () => {
    it("creates an announcement note", async () => {
      const caller = createCaller(emceeId);
      const note = await caller.emcee.createNote({
        competitionId: compId,
        dayId,
        content: "Welcome to the competition!",
        visibleOnProjector: true,
      });

      expect(note).toBeDefined();
      expect(note!.content).toBe("Welcome to the competition!");
      expect(note!.visibleOnProjector).toBe(true);
    });

    it("creates a note positioned after an event", async () => {
      const caller = createCaller(emceeId);
      const note = await caller.emcee.createNote({
        competitionId: compId,
        dayId,
        positionAfterEventId: eventId,
        content: "Short break before next event",
      });

      expect(note!.positionAfterEventId).toBe(eventId);
    });
  });

  describe("updateNote", () => {
    it("updates note content and visibility", async () => {
      const caller = createCaller(emceeId);
      const note = await caller.emcee.createNote({
        competitionId: compId,
        dayId,
        content: "Original text",
      });

      const updated = await caller.emcee.updateNote({
        noteId: note!.id,
        content: "Updated text",
        visibleOnProjector: false,
      });

      expect(updated!.content).toBe("Updated text");
      expect(updated!.visibleOnProjector).toBe(false);
    });
  });

  describe("deleteNote", () => {
    it("deletes an announcement note", async () => {
      const caller = createCaller(emceeId);
      const note = await caller.emcee.createNote({
        competitionId: compId,
        dayId,
        content: "To be deleted",
      });

      const result = await caller.emcee.deleteNote({ noteId: note!.id });
      expect(result.deleted).toBe(true);

      // Verify it's gone from the view
      const view = await caller.emcee.getEmceeView({ competitionId: compId });
      expect(view.notes.length).toBe(0);
    });
  });

  describe("getEventResults", () => {
    it("returns empty for events without published results", async () => {
      const caller = createCaller(emceeId);
      const results = await caller.emcee.getEventResults({ eventId });

      expect(results.eventName).toBe("Gold Standard Waltz");
      expect(results.results).toEqual([]);
    });
  });

  describe("authorization", () => {
    it("rejects non-emcee users", async () => {
      const randomUser = await createUser();
      const caller = createCaller(randomUser.id);

      await expect(
        caller.emcee.getEmceeView({ competitionId: compId }),
      ).rejects.toThrow();
    });

    it("allows org owner to access emcee view", async () => {
      const caller = createCaller(ownerId);
      const view = await caller.emcee.getEmceeView({ competitionId: compId });
      expect(view).toBeDefined();
    });
  });
});
