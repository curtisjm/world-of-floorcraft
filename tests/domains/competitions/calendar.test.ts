import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("calendar router", () => {
  let ownerId: string;
  let ownerCaller: ReturnType<typeof createCaller>;
  let orgId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    orgId = org.id;
    ownerCaller = createCaller(ownerId);
  });

  async function createCompWithStatus(
    name: string,
    status: string,
    opts?: { city?: string; state?: string },
  ) {
    const comp = await ownerCaller.competition.create({
      name,
      orgId,
    });
    if (opts?.city || opts?.state) {
      await ownerCaller.competition.update({
        competitionId: comp.id,
        city: opts.city,
        state: opts.state,
      });
    }
    if (status !== "draft") {
      await ownerCaller.competition.updateStatus({
        competitionId: comp.id,
        status: status as any,
      });
    }
    return comp;
  }

  // ── getUpcoming ──────────────────────────────────────────────��

  describe("getUpcoming", () => {
    it("returns competitions with active statuses", async () => {
      await createCompWithStatus("Draft Comp", "draft");
      await createCompWithStatus("Advertised Comp", "advertised");
      await createCompWithStatus("Accepting Entries", "accepting_entries");

      const caller = createPublicCaller();
      const result = await caller.calendar.getUpcoming({});

      expect(result.length).toBe(2);
      const names = result.map((c) => c.name);
      expect(names).toContain("Advertised Comp");
      expect(names).toContain("Accepting Entries");
      expect(names).not.toContain("Draft Comp");
    });

    it("filters by state", async () => {
      await createCompWithStatus("CA Comp", "advertised", { state: "CA" });
      await createCompWithStatus("NY Comp", "advertised", { state: "NY" });

      const caller = createPublicCaller();
      const result = await caller.calendar.getUpcoming({ state: "CA" });

      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe("CA Comp");
    });

    it("filters by city", async () => {
      await createCompWithStatus("Berkeley Comp", "advertised", { city: "Berkeley" });
      await createCompWithStatus("SF Comp", "advertised", { city: "San Francisco" });

      const caller = createPublicCaller();
      const result = await caller.calendar.getUpcoming({ city: "Berkeley" });

      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe("Berkeley Comp");
    });

    it("returns empty for no matching competitions", async () => {
      const caller = createPublicCaller();
      const result = await caller.calendar.getUpcoming({});
      expect(result).toHaveLength(0);
    });
  });

  // ── getPast ───────────────────────────────────────────────────

  describe("getPast", () => {
    it("returns only finished competitions", async () => {
      await createCompWithStatus("Active Comp", "advertised");
      await createCompWithStatus("Finished Comp", "finished");

      const caller = createPublicCaller();
      const result = await caller.calendar.getPast({});

      expect(result.competitions.length).toBe(1);
      expect(result.competitions[0]!.name).toBe("Finished Comp");
      expect(result.total).toBe(1);
    });

    it("supports pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await createCompWithStatus(`Past Comp ${i}`, "finished");
      }

      const caller = createPublicCaller();
      const page1 = await caller.calendar.getPast({ limit: 2, offset: 0 });
      const page2 = await caller.calendar.getPast({ limit: 2, offset: 2 });

      expect(page1.competitions.length).toBe(2);
      expect(page2.competitions.length).toBe(2);
      expect(page1.total).toBe(5);
    });
  });

  // ── getCompetitionPreview ─────────────────────────────────────

  describe("getCompetitionPreview", () => {
    it("returns preview data", async () => {
      const comp = await createCompWithStatus("Preview Comp", "advertised", {
        city: "Berkeley",
        state: "CA",
      });

      const caller = createPublicCaller();
      const preview = await caller.calendar.getCompetitionPreview({
        competitionId: comp.id,
      });

      expect(preview).toBeDefined();
      expect(preview!.name).toBe("Preview Comp");
      expect(preview!.city).toBe("Berkeley");
      expect(preview!.state).toBe("CA");
    });

    it("returns null for nonexistent competition", async () => {
      const caller = createPublicCaller();
      const preview = await caller.calendar.getCompetitionPreview({
        competitionId: 99999,
      });
      expect(preview).toBeNull();
    });
  });
});
