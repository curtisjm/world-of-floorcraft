import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  createJudge,
  truncateAll,
} from "../../setup/helpers";

describe("judge router", () => {
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

  describe("create", () => {
    it("creates a judge in the global directory", async () => {
      const caller = createCaller(ownerId);
      const judge = await caller.judge.create({
        firstName: "Alice",
        lastName: "Chen",
        initials: "AC",
        affiliation: "NDCA",
      });

      expect(judge.firstName).toBe("Alice");
      expect(judge.lastName).toBe("Chen");
      expect(judge.initials).toBe("AC");
    });
  });

  describe("update", () => {
    it("updates judge details", async () => {
      const caller = createCaller(ownerId);
      const judge = await caller.judge.create({ firstName: "Bob", lastName: "Smith" });

      const updated = await caller.judge.update({
        judgeId: judge.id,
        affiliation: "WDC",
      });
      expect(updated.affiliation).toBe("WDC");
    });
  });

  describe("search", () => {
    it("finds judges by name", async () => {
      const caller = createCaller(ownerId);
      await caller.judge.create({ firstName: "Alice", lastName: "Chen" });
      await caller.judge.create({ firstName: "Bob", lastName: "Chenoweth" });
      await caller.judge.create({ firstName: "Charlie", lastName: "Brown" });

      const results = await caller.judge.search({ query: "Chen" });
      expect(results).toHaveLength(2);
    });
  });

  describe("assignToCompetition / listByCompetition / removeFromCompetition", () => {
    it("assigns and lists judges for a competition", async () => {
      const caller = createCaller(ownerId);
      const judge = await caller.judge.create({ firstName: "Alice", lastName: "Chen" });

      await caller.judge.assignToCompetition({ competitionId: compId, judgeId: judge.id });

      const list = await caller.judge.listByCompetition({ competitionId: compId });
      expect(list).toHaveLength(1);
      expect(list[0]!.firstName).toBe("Alice");
    });

    it("rejects duplicate assignment", async () => {
      const caller = createCaller(ownerId);
      const judge = await caller.judge.create({ firstName: "Bob", lastName: "Smith" });

      await caller.judge.assignToCompetition({ competitionId: compId, judgeId: judge.id });

      await expect(
        caller.judge.assignToCompetition({ competitionId: compId, judgeId: judge.id }),
      ).rejects.toThrow("already assigned");
    });

    it("removes a judge from a competition", async () => {
      const caller = createCaller(ownerId);
      const judge = await caller.judge.create({ firstName: "Alice", lastName: "Chen" });

      await caller.judge.assignToCompetition({ competitionId: compId, judgeId: judge.id });
      await caller.judge.removeFromCompetition({ competitionId: compId, judgeId: judge.id });

      const list = await caller.judge.listByCompetition({ competitionId: compId });
      expect(list).toHaveLength(0);
    });
  });
});
