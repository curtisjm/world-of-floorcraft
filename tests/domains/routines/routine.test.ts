import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createDance,
  createFigure,
  truncateAll,
} from "../../setup/helpers";

describe("routine router", () => {
  let userId: string;
  let danceId: number;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser();
    userId = user.id;
    const dance = await createDance({ name: "waltz", displayName: "Waltz" });
    danceId = dance.id;
  });

  describe("create", () => {
    it("creates a routine", async () => {
      const caller = createCaller(userId);
      const routine = await caller.routine.create({
        danceId,
        name: "My Routine",
      });
      expect(routine.name).toBe("My Routine");
      expect(routine.userId).toBe(userId);
      expect(routine.danceId).toBe(danceId);
      expect(routine.isPublished).toBe(false);
    });
  });

  describe("list", () => {
    it("returns only the user's routines", async () => {
      const otherUser = await createUser();
      const caller = createCaller(userId);
      const otherCaller = createCaller(otherUser.id);

      await caller.routine.create({ danceId, name: "Mine" });
      await otherCaller.routine.create({ danceId, name: "Theirs" });

      const result = await caller.routine.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Mine");
    });
  });

  describe("get", () => {
    it("returns routine with entries", async () => {
      const caller = createCaller(userId);
      const routine = await caller.routine.create({ danceId, name: "Test" });
      const result = await caller.routine.get({ id: routine.id });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test");
    });

    it("returns null for other user's routine", async () => {
      const otherUser = await createUser();
      const otherCaller = createCaller(otherUser.id);
      const routine = await otherCaller.routine.create({ danceId, name: "Theirs" });

      const caller = createCaller(userId);
      const result = await caller.routine.get({ id: routine.id });
      expect(result).toBeNull();
    });
  });

  describe("addEntry and removeEntry", () => {
    it("adds and removes entries with position management", async () => {
      const fig1 = await createFigure(danceId, { name: "Natural Turn" });
      const fig2 = await createFigure(danceId, { name: "Reverse Turn" });

      const caller = createCaller(userId);
      const routine = await caller.routine.create({ danceId, name: "Test" });

      await caller.routine.addEntry({
        routineId: routine.id,
        figureId: fig1.id,
        position: 0,
      });
      await caller.routine.addEntry({
        routineId: routine.id,
        figureId: fig2.id,
        position: 1,
      });

      const loaded = await caller.routine.get({ id: routine.id });
      expect(loaded!.entries).toHaveLength(2);

      // Remove first entry
      const entryToRemove = loaded!.entries.find((e) => e.position === 0);
      await caller.routine.removeEntry({
        routineId: routine.id,
        entryId: entryToRemove!.id,
      });

      const afterRemove = await caller.routine.get({ id: routine.id });
      expect(afterRemove!.entries).toHaveLength(1);
    });
  });

  describe("togglePublished", () => {
    it("toggles published state", async () => {
      const caller = createCaller(userId);
      const routine = await caller.routine.create({ danceId, name: "Test" });
      expect(routine.isPublished).toBe(false);

      const toggled = await caller.routine.togglePublished({ id: routine.id });
      expect(toggled!.isPublished).toBe(true);

      const toggledBack = await caller.routine.togglePublished({ id: routine.id });
      expect(toggledBack!.isPublished).toBe(false);
    });
  });

  describe("delete", () => {
    it("deletes a routine", async () => {
      const caller = createCaller(userId);
      const routine = await caller.routine.create({ danceId, name: "Test" });
      const result = await caller.routine.delete({ id: routine.id });
      expect(result.success).toBe(true);

      const loaded = await caller.routine.get({ id: routine.id });
      expect(loaded).toBeNull();
    });
  });
});
