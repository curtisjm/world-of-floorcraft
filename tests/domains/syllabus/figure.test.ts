import { describe, it, expect, beforeEach } from "vitest";
import {
  createPublicCaller,
  createDance,
  createFigure,
  truncateAll,
} from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { figureEdges } from "@syllabus/schema";

describe("figure router", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("list", () => {
    it("returns all figures", async () => {
      const dance = await createDance({ name: "waltz", displayName: "Waltz" });
      await createFigure(dance.id, { name: "Natural Turn" });
      await createFigure(dance.id, { name: "Reverse Turn" });

      const caller = createPublicCaller();
      const result = await caller.figure.list({ danceId: dance.id });
      expect(result).toHaveLength(2);
    });

    it("returns empty when no figures for dance", async () => {
      const dance = await createDance({ name: "waltz", displayName: "Waltz" });
      const caller = createPublicCaller();
      const result = await caller.figure.list({ danceId: dance.id });
      expect(result).toEqual([]);
    });
  });

  describe("get", () => {
    it("returns a figure by id", async () => {
      const dance = await createDance({ name: "waltz", displayName: "Waltz" });
      const figure = await createFigure(dance.id, { name: "Natural Turn" });

      const caller = createPublicCaller();
      const result = await caller.figure.get({ id: figure.id });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Natural Turn");
    });

    it("returns null for non-existent figure", async () => {
      const caller = createPublicCaller();
      const result = await caller.figure.get({ id: 99999 });
      expect(result).toBeNull();
    });
  });

  describe("neighbors", () => {
    it("returns preceding and following figures", async () => {
      const dance = await createDance({ name: "waltz", displayName: "Waltz" });
      const fig1 = await createFigure(dance.id, { name: "Natural Turn" });
      const fig2 = await createFigure(dance.id, { name: "Reverse Turn" });
      const fig3 = await createFigure(dance.id, { name: "Whisk" });

      const db = getTestDb();
      await db.insert(figureEdges).values([
        { sourceFigureId: fig1.id, targetFigureId: fig2.id, level: "associate" },
        { sourceFigureId: fig3.id, targetFigureId: fig1.id, level: "associate" },
      ]);

      const caller = createPublicCaller();
      const result = await caller.figure.neighbors({ figureId: fig1.id });
      expect(result.precedes).toHaveLength(1);
      expect(result.follows).toHaveLength(1);
    });
  });
});
