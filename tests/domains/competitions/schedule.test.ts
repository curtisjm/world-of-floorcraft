import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("schedule router", () => {
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

  describe("applyDefaultTemplate", () => {
    it("creates a day with default sessions", async () => {
      const caller = createCaller(ownerId);
      const result = await caller.schedule.applyDefaultTemplate({
        competitionId: compId,
        date: "2026-06-15",
      });

      expect(result.day.date).toBe("2026-06-15");
      expect(result.day.label).toBe("Day 1");
      expect(result.blocks).toHaveLength(6);
      expect(result.blocks.map((b) => b.label)).toEqual([
        "Smooth",
        "Standard",
        "Latin",
        "Rhythm",
        "Nightclub",
        "Open Events",
      ]);
    });
  });

  describe("getDays", () => {
    it("returns days with their blocks", async () => {
      const caller = createCaller(ownerId);
      await caller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2026-06-15" });

      const publicCaller = createPublicCaller();
      const days = await publicCaller.schedule.getDays({ competitionId: compId });

      expect(days).toHaveLength(1);
      expect(days[0]!.blocks).toHaveLength(6);
    });
  });

  describe("getSchedule", () => {
    it("returns nested days -> blocks -> events", async () => {
      const caller = createCaller(ownerId);
      await caller.schedule.applyDefaultTemplate({ competitionId: compId, date: "2026-06-15" });
      await caller.event.generateDefaults({ competitionId: compId, styles: ["smooth"] });

      const publicCaller = createPublicCaller();
      const schedule = await publicCaller.schedule.getSchedule({ competitionId: compId });

      expect(schedule).toHaveLength(1);
      const smoothBlock = schedule[0]!.blocks.find((b) => b.label === "Smooth");
      expect(smoothBlock).toBeDefined();
      expect(smoothBlock!.events.length).toBeGreaterThan(0);
    });
  });

  describe("addDay / updateDay / removeDay", () => {
    it("manages days", async () => {
      const caller = createCaller(ownerId);

      const day = await caller.schedule.addDay({
        competitionId: compId,
        date: "2026-06-16",
        label: "Sunday",
      });
      expect(day.label).toBe("Sunday");

      const updated = await caller.schedule.updateDay({
        dayId: day.id,
        label: "Finals Day",
      });
      expect(updated.label).toBe("Finals Day");

      const result = await caller.schedule.removeDay({ dayId: day.id });
      expect(result.success).toBe(true);
    });
  });

  describe("reorderDays", () => {
    it("reorders days", async () => {
      const caller = createCaller(ownerId);
      const day1 = await caller.schedule.addDay({ competitionId: compId, date: "2026-06-15" });
      const day2 = await caller.schedule.addDay({ competitionId: compId, date: "2026-06-16" });

      await caller.schedule.reorderDays({
        competitionId: compId,
        dayIds: [day2.id, day1.id],
      });

      const publicCaller = createPublicCaller();
      const days = await publicCaller.schedule.getDays({ competitionId: compId });
      expect(days[0]!.id).toBe(day2.id);
      expect(days[0]!.position).toBe(1);
    });
  });

  describe("addBlock / updateBlock / removeBlock", () => {
    it("manages blocks", async () => {
      const caller = createCaller(ownerId);
      const day = await caller.schedule.addDay({ competitionId: compId, date: "2026-06-15" });

      const block = await caller.schedule.addBlock({
        dayId: day.id,
        type: "session",
        label: "Morning Session",
      });
      expect(block.type).toBe("session");

      const updated = await caller.schedule.updateBlock({
        blockId: block.id,
        label: "Afternoon Session",
      });
      expect(updated.label).toBe("Afternoon Session");

      const result = await caller.schedule.removeBlock({ blockId: block.id });
      expect(result.success).toBe(true);
    });

    it("adds break blocks", async () => {
      const caller = createCaller(ownerId);
      const day = await caller.schedule.addDay({ competitionId: compId, date: "2026-06-15" });

      const block = await caller.schedule.addBlock({
        dayId: day.id,
        type: "break",
        label: "Lunch",
      });
      expect(block.type).toBe("break");
    });
  });

  describe("reorderBlocks", () => {
    it("reorders blocks within a day", async () => {
      const caller = createCaller(ownerId);
      const day = await caller.schedule.addDay({ competitionId: compId, date: "2026-06-15" });

      const b1 = await caller.schedule.addBlock({ dayId: day.id, type: "session", label: "A" });
      const b2 = await caller.schedule.addBlock({ dayId: day.id, type: "session", label: "B" });

      await caller.schedule.reorderBlocks({
        dayId: day.id,
        blockIds: [b2.id, b1.id],
      });

      const publicCaller = createPublicCaller();
      const days = await publicCaller.schedule.getDays({ competitionId: compId });
      const blocks = days[0]!.blocks;
      expect(blocks[0]!.id).toBe(b2.id);
    });
  });
});
