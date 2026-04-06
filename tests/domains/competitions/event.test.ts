import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("event router", () => {
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
    compId = comp.id;
  });

  describe("generateDefaults", () => {
    it("generates events for selected styles", async () => {
      const caller = createCaller(ownerId);
      // First create sessions so events get assigned
      await caller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2026-06-15" });

      const events = await caller.event.generateDefaults({
        competitionId: compId,
        styles: ["smooth"],
      });

      // Smooth has 7 levels × various events per level
      expect(events.length).toBeGreaterThan(0);

      // Verify events have the right style
      const publicCaller = createPublicCaller();
      const allEvents = await publicCaller.event.listByCompetition({ competitionId: compId });
      expect(allEvents.every((e) => e.style === "smooth")).toBe(true);

      // Check that multi-dance events have multiple dances
      const multiDance = allEvents.find((e) => e.eventType === "multi_dance");
      expect(multiDance).toBeDefined();
      expect(multiDance!.dances.length).toBeGreaterThan(1);
    });

    it("generates events for multiple styles", async () => {
      const caller = createCaller(ownerId);
      await caller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2026-06-15" });

      const events = await caller.event.generateDefaults({
        competitionId: compId,
        styles: ["standard", "latin"],
      });

      const publicCaller = createPublicCaller();
      const allEvents = await publicCaller.event.listByCompetition({ competitionId: compId });
      const styles = new Set(allEvents.map((e) => e.style));
      expect(styles.has("standard")).toBe(true);
      expect(styles.has("latin")).toBe(true);
    });
  });

  describe("create", () => {
    it("creates a custom event with dances", async () => {
      const caller = createCaller(ownerId);
      const event = await caller.event.create({
        competitionId: compId,
        name: "Gold Smooth Waltz/Foxtrot",
        style: "smooth",
        level: "gold",
        eventType: "multi_dance",
        dances: ["Waltz", "Foxtrot"],
      });

      expect(event.name).toBe("Gold Smooth Waltz/Foxtrot");
      expect(event.dances).toHaveLength(2);
      expect(event.dances[0]!.danceName).toBe("Waltz");
      expect(event.dances[1]!.danceName).toBe("Foxtrot");
    });
  });

  describe("update", () => {
    it("updates event fields", async () => {
      const caller = createCaller(ownerId);
      const event = await caller.event.create({
        competitionId: compId,
        name: "Test Event",
        style: "standard",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Waltz"],
      });

      const updated = await caller.event.update({
        eventId: event.id,
        name: "Updated Event",
        maxFinalSize: 6,
      });

      expect(updated.name).toBe("Updated Event");
      expect(updated.maxFinalSize).toBe(6);
    });
  });

  describe("delete", () => {
    it("deletes an event and its dances", async () => {
      const caller = createCaller(ownerId);
      const event = await caller.event.create({
        competitionId: compId,
        name: "To Delete",
        style: "latin",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Cha Cha"],
      });

      await caller.event.delete({ eventId: event.id });

      const publicCaller = createPublicCaller();
      const found = await publicCaller.event.getById({ eventId: event.id });
      expect(found).toBeNull();
    });
  });

  describe("updateDances", () => {
    it("replaces dances for an event", async () => {
      const caller = createCaller(ownerId);
      const event = await caller.event.create({
        competitionId: compId,
        name: "Multi Dance",
        style: "rhythm",
        level: "gold",
        eventType: "multi_dance",
        dances: ["Cha Cha", "Rumba"],
      });

      const updated = await caller.event.updateDances({
        eventId: event.id,
        dances: ["Cha Cha", "Rumba", "Swing"],
      });

      expect(updated.dances).toHaveLength(3);
      expect(updated.dances[2]!.danceName).toBe("Swing");
    });
  });

  describe("getById", () => {
    it("returns event with dances", async () => {
      const caller = createCaller(ownerId);
      const event = await caller.event.create({
        competitionId: compId,
        name: "Silver Latin",
        style: "latin",
        level: "silver",
        eventType: "multi_dance",
        dances: ["Cha Cha", "Rumba"],
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.event.getById({ eventId: event.id });

      expect(result).not.toBeNull();
      expect(result!.dances).toHaveLength(2);
    });
  });
});
