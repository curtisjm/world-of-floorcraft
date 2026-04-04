import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("staff router", () => {
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

  describe("assign / list / remove", () => {
    it("assigns a staff member and lists them", async () => {
      const staffUser = await createUser();
      const caller = createCaller(ownerId);

      const assignment = await caller.staff.assign({
        competitionId: compId,
        userId: staffUser.id,
        role: "emcee",
      });
      expect(assignment.role).toBe("emcee");

      const list = await caller.staff.listByCompetition({ competitionId: compId });
      expect(list).toHaveLength(1);
      expect(list[0]!.displayName).toBeDefined();
    });

    it("allows multiple roles for same user", async () => {
      const staffUser = await createUser();
      const caller = createCaller(ownerId);

      await caller.staff.assign({ competitionId: compId, userId: staffUser.id, role: "emcee" });
      await caller.staff.assign({ competitionId: compId, userId: staffUser.id, role: "deck_captain" });

      const list = await caller.staff.listByCompetition({ competitionId: compId });
      expect(list).toHaveLength(2);
    });

    it("rejects duplicate role assignment", async () => {
      const staffUser = await createUser();
      const caller = createCaller(ownerId);

      await caller.staff.assign({ competitionId: compId, userId: staffUser.id, role: "emcee" });

      await expect(
        caller.staff.assign({ competitionId: compId, userId: staffUser.id, role: "emcee" }),
      ).rejects.toThrow("already has this role");
    });

    it("removes a staff assignment", async () => {
      const staffUser = await createUser();
      const caller = createCaller(ownerId);

      await caller.staff.assign({ competitionId: compId, userId: staffUser.id, role: "registration" });
      await caller.staff.remove({ competitionId: compId, userId: staffUser.id, role: "registration" });

      const list = await caller.staff.listByCompetition({ competitionId: compId });
      expect(list).toHaveLength(0);
    });
  });
});
