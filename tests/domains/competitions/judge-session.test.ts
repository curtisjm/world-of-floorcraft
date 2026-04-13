import { describe, it, expect, beforeEach } from "vitest";
import { hash } from "bcryptjs";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  createJudge,
  truncateAll,
} from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import {
  competitions,
  competitionJudges,
  activeRounds,
} from "@competitions/schema";
import { eq } from "drizzle-orm";

const db = () => getTestDb();

describe("judge-session router", () => {
  let ownerId: string;
  let compId: number;
  let eventId: number;
  let ownerCaller: ReturnType<typeof createCaller>;
  const publicCaller = createPublicCaller();

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    ownerCaller = createCaller(ownerId);

    const comp = await ownerCaller.competition.create({
      name: "Judge Session Test",
      orgId: org.id,
    });
    compId = comp.id;

    // Set comp code and master password
    await ownerCaller.competition.setCompCode({
      competitionId: compId,
      compCode: "TST",
    });
    const passwordHash = await hash("secret123", 10);
    await db()
      .update(competitions)
      .set({ masterPasswordHash: passwordHash })
      .where(eq(competitions.id, compId));

    // Set up for entries
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

  // ── Authentication ────────────────────────────────────────────────

  describe("authenticate", () => {
    it("authenticates a judge with valid credentials", async () => {
      const judge = await addCompJudge();

      const result = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(10);
      expect(result.competitionId).toBe(compId);
      expect(result.judgeId).toBe(judge.id);
      expect(result.competitionName).toBe("Judge Session Test");
    });

    it("rejects wrong master password", async () => {
      const judge = await addCompJudge();

      await expect(
        publicCaller.judgeSession.authenticate({
          compCode: "TST",
          masterPassword: "wrong",
          judgeId: judge.id,
        }),
      ).rejects.toThrow("Invalid credentials");
    });

    it("rejects unknown comp code", async () => {
      const judge = await addCompJudge();

      await expect(
        publicCaller.judgeSession.authenticate({
          compCode: "XXX",
          masterPassword: "secret123",
          judgeId: judge.id,
        }),
      ).rejects.toThrow("Invalid credentials");
    });

    it("rejects judge not assigned to competition", async () => {
      const judge = await createJudge(); // not assigned

      await expect(
        publicCaller.judgeSession.authenticate({
          compCode: "TST",
          masterPassword: "secret123",
          judgeId: judge.id,
        }),
      ).rejects.toThrow("Invalid credentials");
    });

    it("ends previous active session on re-login", async () => {
      const judge = await addCompJudge();

      const result1 = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      const result2 = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      expect(result2.token).not.toBe(result1.token);

      // Old token should not work
      await expect(
        publicCaller.judgeSession.getActiveRound({ token: result1.token }),
      ).rejects.toThrow("expired or ended");
    });
  });

  // ── Logout ────────────────────────────────────────────────────────

  describe("logout", () => {
    it("ends the session", async () => {
      const judge = await addCompJudge();
      const { token } = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      await publicCaller.judgeSession.logout({ token });

      await expect(
        publicCaller.judgeSession.getActiveRound({ token }),
      ).rejects.toThrow("expired or ended");
    });
  });

  // ── Active round ──────────────────────────────────────────────────

  describe("getActiveRound", () => {
    it("returns null when no round is active", async () => {
      const judge = await addCompJudge();
      const { token } = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      const result = await publicCaller.judgeSession.getActiveRound({ token });
      expect(result).toBeNull();
    });

    it("returns active round details", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      // Generate rounds and start one
      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await publicCaller.round.listByEvent({ eventId });
      const round = roundsList[0]!;

      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: round.id,
      });

      const { token } = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      const result = await publicCaller.judgeSession.getActiveRound({ token });
      expect(result).not.toBeNull();
      expect(result!.roundId).toBe(round.id);
      expect(result!.eventName).toBe("Newcomer Smooth Waltz");
      expect(result!.couples.length).toBe(2);
    });
  });

  // ── Submit marks ──────────────────────────────────────────────────

  describe("submitCallbackMarks", () => {
    it("submits and retrieves callback marks", async () => {
      const judge = await addCompJudge();

      // Need enough entries to force a preliminary round
      await ownerCaller.event.update({ eventId, maxFinalSize: 2 });
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();
      const { entry: e4 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await publicCaller.round.listByEvent({ eventId });
      // First round should be a preliminary
      const prelimRound = roundsList.find((r) => r.roundType !== "final")!;

      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: prelimRound.id,
      });

      const { token } = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      const result = await publicCaller.judgeSession.submitCallbackMarks({
        token,
        roundId: prelimRound.id,
        marks: [
          { entryId: e1.id, marked: true },
          { entryId: e2.id, marked: true },
          { entryId: e3.id, marked: false },
          { entryId: e4.id, marked: false },
        ],
      });

      expect(result.submitted).toBe(4);

      // Retrieve marks
      const submission = await publicCaller.judgeSession.getMySubmission({
        token,
        roundId: prelimRound.id,
      });
      expect(submission.type).toBe("callback");
      expect(submission.status).toBe("submitted");
      expect(submission.marks.length).toBe(4);
    });
  });

  describe("submitFinalMarks", () => {
    it("submits final round marks", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();
      const { entry: e3 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await publicCaller.round.listByEvent({ eventId });
      const finalRound = roundsList.find((r) => r.roundType === "final")!;

      await ownerCaller.scrutineer.startRound({
        competitionId: compId,
        roundId: finalRound.id,
      });

      const { token } = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      const result = await publicCaller.judgeSession.submitFinalMarks({
        token,
        roundId: finalRound.id,
        marks: [
          { entryId: e1.id, danceName: "Waltz", placement: 1 },
          { entryId: e2.id, danceName: "Waltz", placement: 2 },
          { entryId: e3.id, danceName: "Waltz", placement: 3 },
        ],
      });

      expect(result.submitted).toBe(3);

      const submission = await publicCaller.judgeSession.getMySubmission({
        token,
        roundId: finalRound.id,
      });
      expect(submission.type).toBe("final");
      expect(submission.status).toBe("submitted");
    });

    it("rejects marks for non-active round", async () => {
      const judge = await addCompJudge();
      const { entry: e1 } = await registerCouple();
      const { entry: e2 } = await registerCouple();

      await ownerCaller.round.generateForEvent({ eventId });
      const roundsList = await publicCaller.round.listByEvent({ eventId });
      const finalRound = roundsList.find((r) => r.roundType === "final")!;

      // Don't start the round — it's not active
      const { token } = await publicCaller.judgeSession.authenticate({
        compCode: "TST",
        masterPassword: "secret123",
        judgeId: judge.id,
      });

      await expect(
        publicCaller.judgeSession.submitFinalMarks({
          token,
          roundId: finalRound.id,
          marks: [
            { entryId: e1.id, danceName: "Waltz", placement: 1 },
            { entryId: e2.id, danceName: "Waltz", placement: 2 },
          ],
        }),
      ).rejects.toThrow("not currently active");
    });
  });
});
