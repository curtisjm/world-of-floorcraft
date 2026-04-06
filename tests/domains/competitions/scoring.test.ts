import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  createJudge,
  truncateAll,
} from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { competitionJudges } from "@competitions/schema";

const db = () => getTestDb();

describe("scoring router", () => {
  let ownerId: string;
  let compId: number;
  let eventId: number;
  let ownerCaller: ReturnType<typeof createCaller>;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    ownerCaller = createCaller(ownerId);

    const comp = await ownerCaller.competition.create({
      name: "Scoring Test Comp",
      orgId: org.id,
    });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({
      competitionId: compId,
      status: "accepting_entries",
    });

    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Newcomer Smooth Waltz",
      style: "smooth",
      level: "newcomer",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;
  });

  // ── Helpers ───────────────────────────────────────────────────────

  async function registerCouple() {
    const leader = await createUser();
    const follower = await createUser();
    const leaderCaller = createCaller(leader.id);

    const reg = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: follower.username!,
    });

    const entry = await leaderCaller.entry.create({
      eventId,
      leaderRegistrationId: reg.self.id,
      followerRegistrationId: reg.partner!.id,
    });

    return { leader, follower, reg, entry };
  }

  async function addCompJudge() {
    const judge = await createJudge();
    await db().insert(competitionJudges).values({
      competitionId: compId,
      judgeId: judge.id,
    });
    return judge;
  }

  async function createFinalRound() {
    const roundResult = await ownerCaller.round.generateForEvent({ eventId });
    // Should create a single final round for few entries
    const roundsList = await createPublicCaller().round.listByEvent({ eventId });
    return roundsList[0]!;
  }

  // ── Callback marks ────────────────────────────────────────────────

  describe("submitCallbackMarks", () => {
    it("submits callback marks for a round", async () => {
      // Set maxFinalSize=4 so 7 entries forces a prelim round
      await ownerCaller.event.update({ eventId, maxFinalSize: 4 });

      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();
      const { entry: e4 } = await registerCouple();
      const { entry: e5 } = await registerCouple();
      const { entry: e6 } = await registerCouple();
      const { entry: e7 } = await registerCouple();
      const judge = await addCompJudge();

      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await createPublicCaller().round.listByEvent({ eventId });
      const prelimRound = roundsList.find((r) => r.roundType !== "final")!;

      const result = await ownerCaller.scoring.submitCallbackMarks({
        roundId: prelimRound.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, marked: true },
          { entryId: e2.id, marked: true },
          { entryId: e3.id, marked: false },
          { entryId: e4.id, marked: true },
          { entryId: e5.id, marked: false },
          { entryId: e6.id, marked: true },
          { entryId: e7.id, marked: false },
        ],
      });

      expect(result.submitted).toBe(7);
    });

    it("updates existing marks on resubmission", async () => {
      await ownerCaller.event.update({ eventId, maxFinalSize: 4 });

      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();
      const { entry: e4 } = await registerCouple();
      const { entry: e5 } = await registerCouple();
      const { entry: e6 } = await registerCouple();
      const { entry: e7 } = await registerCouple();
      const judge = await addCompJudge();

      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await createPublicCaller().round.listByEvent({ eventId });
      const prelimRound = roundsList.find((r) => r.roundType !== "final")!;

      // First submission
      await ownerCaller.scoring.submitCallbackMarks({
        roundId: prelimRound.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, marked: true },
          { entryId: e2.id, marked: false },
        ],
      });

      // Update marks
      const result = await ownerCaller.scoring.submitCallbackMarks({
        roundId: prelimRound.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, marked: false },
          { entryId: e2.id, marked: true },
        ],
      });

      expect(result.submitted).toBe(2);
    });
  });

  // ── Final marks ───────────────────────────────────────────────────

  describe("submitFinalMarks", () => {
    it("submits final placements for a round", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();
      const judge = await addCompJudge();

      const round = await createFinalRound();

      const result = await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
          { entryId: e3.id, danceName: "Waltz", placement: 3 },
        ],
      });

      expect(result.submitted).toBe(3);
    });

    it("updates existing final marks on resubmission", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const judge = await addCompJudge();

      const round = await createFinalRound();

      await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
        ],
      });

      // Swap placements
      const result = await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 2 },
          { entryId: e2.id, danceName: "Waltz", placement: 1 },
        ],
      });

      expect(result.submitted).toBe(2);
    });
  });

  // ── Submission status ─────────────────────────────────────────────

  describe("getSubmissionStatus", () => {
    it("returns submission status for all judges in a round", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const judge1 = await addCompJudge();
      const judge2 = await addCompJudge();

      const round = await createFinalRound();

      // Only judge1 submits
      await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge1.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
        ],
      });

      const status = await ownerCaller.scoring.getSubmissionStatus({
        roundId: round.id,
      });

      expect(status).toHaveLength(1);
      expect(status[0]!.judgeId).toBe(judge1.id);
      expect(status[0]!.status).toBe("submitted");
    });
  });

  // ── Compute callback results ──────────────────────────────────────

  describe("computeCallbackResults", () => {
    it("computes callback tallies and determines advancement", async () => {
      await ownerCaller.event.update({ eventId, maxFinalSize: 4 });

      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();
      const { entry: e4 } = await registerCouple();
      const { entry: e5 } = await registerCouple();
      const { entry: e6 } = await registerCouple();
      const { entry: e7 } = await registerCouple();
      const judge1 = await addCompJudge();
      const judge2 = await addCompJudge();
      const judge3 = await addCompJudge();

      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await createPublicCaller().round.listByEvent({ eventId });
      const prelimRound = roundsList.find((r) => r.roundType !== "final")!;

      const allEntries = [e1, e2, e3, e4, e5, e6, e7];

      // Judge 1: marks e1, e2, e3, e4
      await ownerCaller.scoring.submitCallbackMarks({
        roundId: prelimRound.id,
        judgeId: judge1.id,
        marks: allEntries.map((e) => ({
          entryId: e.id,
          marked: [e1.id, e2.id, e3.id, e4.id].includes(e.id),
        })),
      });

      // Judge 2: marks e1, e2, e5, e6
      await ownerCaller.scoring.submitCallbackMarks({
        roundId: prelimRound.id,
        judgeId: judge2.id,
        marks: allEntries.map((e) => ({
          entryId: e.id,
          marked: [e1.id, e2.id, e5.id, e6.id].includes(e.id),
        })),
      });

      // Judge 3: marks e1, e3, e5, e7
      await ownerCaller.scoring.submitCallbackMarks({
        roundId: prelimRound.id,
        judgeId: judge3.id,
        marks: allEntries.map((e) => ({
          entryId: e.id,
          marked: [e1.id, e3.id, e5.id, e7.id].includes(e.id),
        })),
      });

      const result = await ownerCaller.scoring.computeCallbackResults({
        roundId: prelimRound.id,
      });

      expect(result.couples).toBe(7);
      expect(result.advanced).toBeGreaterThan(0);

      // e1 got 3 marks (all judges), should definitely advance
      const callbacks = await createPublicCaller().scoring.getCallbackResults({
        roundId: prelimRound.id,
      });
      const e1Result = callbacks.find((c) => c.entryId === e1.id);
      expect(e1Result!.totalMarks).toBe(3);
      expect(e1Result!.advanced).toBe(true);
    });
  });

  // ── Compute final results ─────────────────────────────────────────

  describe("computeFinalResults", () => {
    it("computes single-dance final results with skating system", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();
      const judge1 = await addCompJudge();
      const judge2 = await addCompJudge();
      const judge3 = await addCompJudge();

      const round = await createFinalRound();

      // All judges agree: e1=1st, e2=2nd, e3=3rd
      for (const judge of [judge1, judge2, judge3]) {
        await ownerCaller.scoring.submitFinalMarks({
          roundId: round.id,
          judgeId: judge.id,
          marks: [
            { entryId: e1.id, danceName: "Waltz", placement: 1 },
            { entryId: e2.id, danceName: "Waltz", placement: 2 },
            { entryId: e3.id, danceName: "Waltz", placement: 3 },
          ],
        });
      }

      const result = await ownerCaller.scoring.computeFinalResults({
        roundId: round.id,
      });

      expect(result.dances).toBe(1);
      expect(result.couples).toBe(3);
      expect(result.isMultiDance).toBe(false);

      // Check stored results
      const { results } = await createPublicCaller().scoring.getResults({
        roundId: round.id,
      });

      const e1Result = results.find((r) => r.entryId === e1.id);
      const e2Result = results.find((r) => r.entryId === e2.id);
      const e3Result = results.find((r) => r.entryId === e3.id);

      expect(e1Result!.placement).toBe(1);
      expect(e2Result!.placement).toBe(2);
      expect(e3Result!.placement).toBe(3);
    });

    it("computes multi-dance final results", async () => {
      // Create a multi-dance event
      const multiEvent = await ownerCaller.event.create({
        competitionId: compId,
        name: "Gold Standard W/T/Q",
        style: "standard",
        level: "gold",
        eventType: "multi_dance",
        dances: ["Waltz", "Tango", "Quickstep"],
      });

      const { entry: e1 } = await registerCoupleForEvent(multiEvent.id);
      const { entry: e2 } = await registerCoupleForEvent(multiEvent.id);
      const { entry: e3 } = await registerCoupleForEvent(multiEvent.id);
      const judge1 = await addCompJudge();
      const judge2 = await addCompJudge();
      const judge3 = await addCompJudge();

      // Generate round for the multi-dance event
      await ownerCaller.round.generateForEvent({ eventId: multiEvent.id });
      const roundsList = await createPublicCaller().round.listByEvent({
        eventId: multiEvent.id,
      });
      const round = roundsList[0]!;

      // Submit marks for all 3 dances — e1 wins all dances
      for (const judge of [judge1, judge2, judge3]) {
        await ownerCaller.scoring.submitFinalMarks({
          roundId: round.id,
          judgeId: judge.id,
          marks: [
            { entryId: e1.id, danceName: "Waltz", placement: 1 },
            { entryId: e2.id, danceName: "Waltz", placement: 2 },
            { entryId: e3.id, danceName: "Waltz", placement: 3 },
            { entryId: e1.id, danceName: "Tango", placement: 1 },
            { entryId: e2.id, danceName: "Tango", placement: 2 },
            { entryId: e3.id, danceName: "Tango", placement: 3 },
            { entryId: e1.id, danceName: "Quickstep", placement: 1 },
            { entryId: e2.id, danceName: "Quickstep", placement: 2 },
            { entryId: e3.id, danceName: "Quickstep", placement: 3 },
          ],
        });
      }

      const result = await ownerCaller.scoring.computeFinalResults({
        roundId: round.id,
      });

      expect(result.dances).toBe(3);
      expect(result.couples).toBe(3);
      expect(result.isMultiDance).toBe(true);

      // Check overall results (danceName = null)
      const { results } = await createPublicCaller().scoring.getResults({
        roundId: round.id,
      });

      const overallResults = results.filter((r) => r.danceName === null);
      expect(overallResults).toHaveLength(3);

      const e1Overall = overallResults.find((r) => r.entryId === e1.id);
      expect(e1Overall!.placement).toBe(1);
    });

    it("rejects computation when no marks have been submitted", async () => {
      await registerCouple();
      const round = await createFinalRound();

      await expect(
        ownerCaller.scoring.computeFinalResults({ roundId: round.id }),
      ).rejects.toThrow("No marks submitted");
    });

    it("stores tabulation tables alongside results", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const judge1 = await addCompJudge();
      const judge2 = await addCompJudge();
      const judge3 = await addCompJudge();

      const round = await createFinalRound();

      for (const judge of [judge1, judge2, judge3]) {
        await ownerCaller.scoring.submitFinalMarks({
          roundId: round.id,
          judgeId: judge.id,
          marks: [
            { entryId: e1.id, danceName: "Waltz", placement: 1 },
            { entryId: e2.id, danceName: "Waltz", placement: 2 },
          ],
        });
      }

      await ownerCaller.scoring.computeFinalResults({ roundId: round.id });

      const { tabulation } = await createPublicCaller().scoring.getResults({
        roundId: round.id,
      });

      expect(tabulation.length).toBeGreaterThan(0);
      // Each entry should have tabulation data for the dance
      const e1Tab = tabulation.find(
        (t) => t.entryId === e1.id && t.danceName === "Waltz",
      );
      expect(e1Tab).toBeDefined();
      expect(e1Tab!.tableData).toBeDefined();
    });
  });

  // ── Results queries ───────────────────────────────────────────────

  describe("getResults", () => {
    it("returns empty when no results computed", async () => {
      await registerCouple();
      const round = await createFinalRound();

      const { results, tabulation, callbacks, meta } =
        await createPublicCaller().scoring.getResults({
          roundId: round.id,
        });

      expect(results).toHaveLength(0);
      expect(tabulation).toHaveLength(0);
      expect(callbacks).toHaveLength(0);
      expect(meta).toBeUndefined();
    });
  });

  // ── Results workflow ──────────────────────────────────────────────

  describe("reviewResults / publishResults", () => {
    it("follows computed -> reviewed -> published workflow", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const judge1 = await addCompJudge();
      const judge2 = await addCompJudge();
      const judge3 = await addCompJudge();

      const round = await createFinalRound();

      for (const judge of [judge1, judge2, judge3]) {
        await ownerCaller.scoring.submitFinalMarks({
          roundId: round.id,
          judgeId: judge.id,
          marks: [
            { entryId: e1.id, danceName: "Waltz", placement: 1 },
            { entryId: e2.id, danceName: "Waltz", placement: 2 },
          ],
        });
      }

      // Compute
      await ownerCaller.scoring.computeFinalResults({ roundId: round.id });

      let { meta } = await createPublicCaller().scoring.getResults({
        roundId: round.id,
      });
      expect(meta!.status).toBe("computed");

      // Review
      const reviewed = await ownerCaller.scoring.reviewResults({
        roundId: round.id,
      });
      expect(reviewed!.status).toBe("reviewed");
      expect(reviewed!.reviewedBy).toBe(ownerId);

      // Publish
      const published = await ownerCaller.scoring.publishResults({
        roundId: round.id,
      });
      expect(published!.status).toBe("published");
      expect(published!.publishedAt).toBeDefined();
    });

    it("requires org admin role for review", async () => {
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const judge = await addCompJudge();

      const round = await createFinalRound();

      await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
        ],
      });

      await ownerCaller.scoring.computeFinalResults({ roundId: round.id });

      // Random user can't review
      const rando = await createUser();
      const randoCaller = createCaller(rando.id);

      await expect(
        randoCaller.scoring.reviewResults({ roundId: round.id }),
      ).rejects.toThrow();
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────

  describe("authorization", () => {
    it("requires org role to compute results", async () => {
      const { entry: e1 } = await registerCouple();
      const judge = await addCompJudge();

      const round = await createFinalRound();

      await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge.id,
        marks: [{ entryId: e1.id, danceName: "Waltz", placement: 1 }],
      });

      const rando = await createUser();
      const randoCaller = createCaller(rando.id);

      await expect(
        randoCaller.scoring.computeFinalResults({ roundId: round.id }),
      ).rejects.toThrow();
    });
  });

  // ── Helper for multi-dance event registration ─────────────────────

  async function registerCoupleForEvent(evId: number) {
    const leader = await createUser();
    const follower = await createUser();
    const leaderCaller = createCaller(leader.id);

    const reg = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: follower.username!,
    });

    const entry = await leaderCaller.entry.create({
      eventId: evId,
      leaderRegistrationId: reg.self.id,
      followerRegistrationId: reg.partner!.id,
    });

    return { leader, follower, reg, entry };
  }
});
