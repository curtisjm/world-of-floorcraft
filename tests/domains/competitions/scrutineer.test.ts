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

describe("scrutineer router", () => {
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
      name: "Scrutineer Test Comp",
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

  // ── Start round ───────────────────────────────────────────────────

  describe("startRound", () => {
    it("starts a specific round", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const round = rounds[0]!;

      const result = await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: round.id,
      });

      expect(result.roundId).toBe(round.id);
    });

    it("auto-determines next round when roundId not specified", async () => {
      await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });

      const result = await ownerCaller.scrutineer.startRound({
        competitionId: compId,
      });

      expect(result.roundId).toBeDefined();
    });

    it("creates judge submissions for all competition judges", async () => {
      const j1 = await addCompJudge();
      const j2 = await addCompJudge();
      await registerCouple();
      await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });

      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: rounds[0]!.id,
      });

      const status = await ownerCaller.scrutineer.getSubmissionStatus({
        competitionId: compId,
      });

      expect(status.submissions.length).toBe(2);
      expect(status.submissions.every((s) => s.status === "pending")).toBe(true);
    });

    it("throws when advancing with pending submissions", async () => {
      await addCompJudge();
      // Need enough entries for prelim + final (2 rounds)
      await ownerCaller.event.update({ eventId, maxFinalSize: 2 });
      await registerCouple();
      await registerCouple();
      await registerCouple();
      await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });

      const allRounds = await createPublicCaller().round.listByEvent({ eventId });
      const prelimRound = allRounds.find((r) => r.roundType !== "final")!;
      const finalRound = allRounds.find((r) => r.roundType === "final")!;

      // Start prelim round
      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: prelimRound.id,
      });

      // Try to advance to final — judge hasn't submitted for prelim
      await expect(
        ownerCaller.scrutineer.startRound({
          competitionId: compId,
          roundId: finalRound.id,
        }),
      ).rejects.toThrow("haven't submitted");
    });
  });

  // ── Stop round ────────────────────────────────────────────────────

  describe("stopRound", () => {
    it("stops the active round", async () => {
      await addCompJudge();
      await registerCouple();
      await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });

      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: rounds[0]!.id,
      });

      // Need to submit all judges before stopping
      const status = await ownerCaller.scrutineer.getSubmissionStatus({
        competitionId: compId,
      });

      // Mark all submissions as submitted manually for test
      for (const sub of status.submissions) {
        // Submit marks via scoring router (as staff)
        await ownerCaller.scoring.submitCallbackMarks({
          roundId: rounds[0]!.id,
          judgeId: sub.judgeId,
          marks: [],
        });
      }

      const result = await ownerCaller.scrutineer.stopRound({
        competitionId: compId,
      });

      expect(result.stoppedRoundId).toBe(rounds[0]!.id);
    });

    it("throws when no active round", async () => {
      await expect(
        ownerCaller.scrutineer.stopRound({ competitionId: compId }),
      ).rejects.toThrow("No active round");
    });
  });

  // ── Override marks ────────────────────────────────────────────────

  describe("overrideMarks", () => {
    it("overrides callback marks and creates correction record", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const roundId = rounds[0]!.id;

      // Submit marks first
      await ownerCaller.scoring.submitCallbackMarks({
        roundId,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, marked: true },
          { entryId: e2.id, marked: false },
        ],
      });

      // Override one mark
      const result = await ownerCaller.scrutineer.overrideMarks({
        roundId,
        judgeId: judge.id,
        corrections: [
          { entryId: e2.id, newValue: "true" },
        ],
        reason: "Judge signaled correction",
      });

      expect(result.corrected).toBe(1);

      // Check correction history
      const history = await ownerCaller.scrutineer.getCorrectionHistory({ roundId });
      expect(history.length).toBe(1);
      expect(history[0]!.oldValue).toBe("false");
      expect(history[0]!.newValue).toBe("true");
      expect(history[0]!.source).toBe("scrutineer");
      expect(history[0]!.reason).toBe("Judge signaled correction");
    });
  });

  // ── Unlock judge submission ───────────────────────────────────────

  describe("unlockJudgeSubmission", () => {
    it("resets judge submission to pending", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const roundId = rounds[0]!.id;

      // Submit marks
      await ownerCaller.scoring.submitCallbackMarks({
        roundId,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, marked: true },
          { entryId: e2.id, marked: false },
        ],
      });

      // Unlock
      await ownerCaller.scrutineer.unlockJudgeSubmission({
        roundId,
        judgeId: judge.id,
      });

      // Check it's pending again — use start round to create submissions first
      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId,
      });

      const status = await ownerCaller.scrutineer.getSubmissionStatus({
        competitionId: compId,
      });

      const judgeSub = status.submissions.find((s) => s.judgeId === judge.id);
      expect(judgeSub?.status).toBe("pending");
    });
  });

  // ── Results workflow ──────────────────────────────────────────────

  describe("results workflow", () => {
    it("review → publish lifecycle", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const finalRound = rounds.find((r) => r.roundType === "final")!;

      // Submit marks via scoring router
      await ownerCaller.scoring.submitFinalMarks({
        roundId: finalRound.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
        ],
      });

      // Compute results
      await ownerCaller.scoring.computeFinalResults({ roundId: finalRound.id });

      // Review
      const reviewed = await ownerCaller.scrutineer.reviewResults({ roundId: finalRound.id });
      expect(reviewed?.status).toBe("reviewed");

      // Publish
      const published = await ownerCaller.scrutineer.publishResults({ roundId: finalRound.id });
      expect(published?.status).toBe("published");
    });

    it("review rejects non-computed results", async () => {
      const judge = await addCompJudge();
      await registerCouple();
      await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const finalRound = rounds.find((r) => r.roundType === "final")!;

      await expect(
        ownerCaller.scrutineer.reviewResults({ roundId: finalRound.id }),
      ).rejects.toThrow("must be computed");
    });

    it("publish rejects non-reviewed results", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const finalRound = rounds.find((r) => r.roundType === "final")!;

      await ownerCaller.scoring.submitFinalMarks({
        roundId: finalRound.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
        ],
      });
      await ownerCaller.scoring.computeFinalResults({ roundId: finalRound.id });

      await expect(
        ownerCaller.scrutineer.publishResults({ roundId: finalRound.id }),
      ).rejects.toThrow("must be reviewed");
    });
  });

  // ── Recompute results ─────────────────────────────────────────────

  describe("recomputeResults", () => {
    it("recomputes final results after mark override", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const rounds = await createPublicCaller().round.listByEvent({ eventId });
      const finalRound = rounds.find((r) => r.roundType === "final")!;

      // Submit initial marks
      await ownerCaller.scoring.submitFinalMarks({
        roundId: finalRound.id,
        judgeId: judge.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
        ],
      });

      await ownerCaller.scoring.computeFinalResults({ roundId: finalRound.id });

      // Override: swap placements
      await ownerCaller.scrutineer.overrideMarks({
        roundId: finalRound.id,
        judgeId: judge.id,
        corrections: [
          { entryId: e1.id, danceName: "Waltz", newValue: "2" },
          { entryId: e2.id, danceName: "Waltz", newValue: "1" },
        ],
      });

      // Recompute
      const result = await ownerCaller.scrutineer.recomputeResults({
        roundId: finalRound.id,
      });
      expect(result.couples).toBe(2);

      // Verify results changed
      const results = await ownerCaller.scrutineer.getResults({ roundId: finalRound.id });
      const firstPlace = results.results.find((r) => r.placement === 1 && r.danceName === "Waltz");
      expect(firstPlace?.entryId).toBe(e2.id);
    });
  });

  // ── Get next round ────────────────────────────────────────────────

  describe("getNextRound", () => {
    it("returns next pending round", async () => {
      await registerCouple();
      await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });

      const next = await ownerCaller.scrutineer.getNextRound({ competitionId: compId });
      expect(next).not.toBeNull();
      expect(next!.eventName).toBe("Newcomer Smooth Waltz");
    });

    it("returns null when all rounds are completed", async () => {
      // No rounds generated at all
      const next = await ownerCaller.scrutineer.getNextRound({ competitionId: compId });
      expect(next).toBeNull();
    });
  });

  // ── Submission status ─────────────────────────────────────────────

  describe("getSubmissionStatus", () => {
    it("returns empty when no active round", async () => {
      const status = await ownerCaller.scrutineer.getSubmissionStatus({
        competitionId: compId,
      });

      expect(status.activeRound).toBeNull();
      expect(status.submissions).toEqual([]);
    });
  });
});
