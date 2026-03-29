import { describe, it, expect, beforeEach } from "vitest";
import { createPublicCaller, createDance, truncateAll } from "../../setup/helpers";

describe("dance router", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("list", () => {
    it("returns empty array when no dances", async () => {
      const caller = createPublicCaller();
      const result = await caller.dance.list();
      expect(result).toEqual([]);
    });

    it("returns all dances", async () => {
      await createDance({ name: "waltz", displayName: "Waltz" });
      await createDance({ name: "tango", displayName: "Tango" });

      const caller = createPublicCaller();
      const result = await caller.dance.list();
      expect(result).toHaveLength(2);
      expect(result.map((d) => d.name)).toContain("waltz");
      expect(result.map((d) => d.name)).toContain("tango");
    });
  });
});
