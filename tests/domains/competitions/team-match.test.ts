import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("team-match router", () => {
  let ownerId: string;
  let compId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const caller = createCaller(ownerId);
    const comp = await caller.competition.create({ name: "Test Comp", orgId: org.id });
    compId = comp.id;
  });

  describe("submit / list / delete", () => {
    it("manages team match submissions", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      const submission = await caller.teamMatch.submit({
        competitionId: compId,
        content: "Our team wants to dance Cha Cha for the team match!",
      });
      expect(submission.content).toContain("Cha Cha");

      // List (staff only)
      const ownerCaller = createCaller(ownerId);
      const list = await ownerCaller.teamMatch.listByCompetition({ competitionId: compId });
      expect(list).toHaveLength(1);
      expect(list[0]!.displayName).toBeDefined();

      // Delete own
      await caller.teamMatch.delete({ submissionId: submission.id });
      const listAfter = await ownerCaller.teamMatch.listByCompetition({ competitionId: compId });
      expect(listAfter).toHaveLength(0);
    });

    it("prevents deleting another user's submission", async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      const c1 = createCaller(user1.id);
      const submission = await c1.teamMatch.submit({
        competitionId: compId,
        content: "Test submission",
      });

      const c2 = createCaller(user2.id);
      await expect(
        c2.teamMatch.delete({ submissionId: submission.id }),
      ).rejects.toThrow("your own");
    });
  });
});
