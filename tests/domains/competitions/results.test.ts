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
import { competitionJudges, recordRemovalRequests } from "@competitions/schema";

const db = () => getTestDb();

describe("results router", () => {
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
      name: "Results Test Comp",
      orgId: org.id,
    });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({
      competitionId: compId,
      status: "accepting_entries",
    });

    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Gold Standard Waltz",
      style: "standard",
      level: "gold",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;
  });

  // ── Helpers ───────────────���─────────────────────────────────────

  async function registerCouple(opts?: { leaderUsername?: string; followerUsername?: string }) {
    const leader = await createUser(opts?.leaderUsername ? { username: opts.leaderUsername } : undefined);
    const follower = await createUser(opts?.followerUsername ? { username: opts.followerUsername } : undefined);
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

  /** Set up a scored and published final for the event */
  async function scoreAndPublish() {
    const couples = [];
    for (let i = 0; i < 3; i++) {
      couples.push(await registerCouple());
    }

    const judges = [];
    for (let i = 0; i < 3; i++) {
      judges.push(await addCompJudge());
    }

    // Generate rounds
    await ownerCaller.round.generateForEvent({ eventId });
    const roundsList = await createPublicCaller().round.listByEvent({ eventId });
    const round = roundsList[0]!;

    // Submit final marks from each judge
    for (let ji = 0; ji < judges.length; ji++) {
      const judge = judges[ji]!;
      const placements = couples.map((c, ci) => ({
        entryId: c.entry.id,
        placement: ((ci + ji) % couples.length) + 1, // Rotate placements
      }));

      await ownerCaller.scoring.submitFinalMarks({
        roundId: round.id,
        judgeId: judge.id,
        marks: placements.map((p) => ({
          entryId: p.entryId,
          danceName: "Waltz",
          placement: p.placement,
        })),
      });
    }

    // Compute and publish
    await ownerCaller.scoring.computeFinalResults({ roundId: round.id });
    await ownerCaller.scoring.reviewResults({ roundId: round.id });
    await ownerCaller.scoring.publishResults({ roundId: round.id });

    return { couples, judges, round };
  }

  // ── getByCompetition ──────────────────────────────────────────

  describe("getByCompetition", () => {
    it("returns null for nonexistent competition", async () => {
      const caller = createPublicCaller();
      const result = await caller.results.getByCompetition({ competitionId: 99999 });
      expect(result).toBeNull();
    });

    it("returns empty events when no results published", async () => {
      const caller = createPublicCaller();
      const result = await caller.results.getByCompetition({ competitionId: compId });

      expect(result).toBeDefined();
      expect(result!.competition.name).toBe("Results Test Comp");
      expect(result!.events).toHaveLength(0);
    });

    it("returns published results with placements", async () => {
      const { couples } = await scoreAndPublish();
      const caller = createPublicCaller();
      const result = await caller.results.getByCompetition({ competitionId: compId });

      expect(result!.events).toHaveLength(1);
      const eventResult = result!.events[0]!;
      expect(eventResult.eventName).toBe("Gold Standard Waltz");
      expect(eventResult.placements.length).toBe(couples.length);

      // Should be ordered by placement
      const placements = eventResult.placements.map((p) => p.placement);
      expect(placements).toEqual([...placements].sort((a, b) => a - b));
    });

    it("includes competitor names and couple numbers", async () => {
      const { couples } = await scoreAndPublish();

      // Assign numbers
      await ownerCaller.number.autoAssign({ competitionId: compId });

      const caller = createPublicCaller();
      const result = await caller.results.getByCompetition({ competitionId: compId });
      const placement = result!.events[0]!.placements[0]!;

      expect(placement.leaderName).toBeDefined();
      expect(placement.followerName).toBeDefined();
      expect(placement.coupleNumber).toBeDefined();
    });

    it("hides results for approved record removals", async () => {
      const { couples } = await scoreAndPublish();

      // Finish the competition so removals are possible
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      // Create an approved removal for the first couple
      await db().insert(recordRemovalRequests).values({
        userId: couples[0]!.leader.id,
        competitionId: compId,
        entryId: couples[0]!.entry.id,
        reason: "Privacy request",
        status: "approved",
        reviewedBy: ownerId,
        reviewedAt: new Date(),
      });

      const caller = createPublicCaller();
      const result = await caller.results.getByCompetition({ competitionId: compId });

      // Should have one fewer placement
      expect(result!.events[0]!.placements.length).toBe(couples.length - 1);
    });
  });

  // ── getEventResults ─────────────────────────────���─────────────

  describe("getEventResults", () => {
    it("returns null for nonexistent event", async () => {
      const caller = createPublicCaller();
      const result = await caller.results.getEventResults({ eventId: 99999 });
      expect(result).toBeNull();
    });

    it("returns null when no results published", async () => {
      const caller = createPublicCaller();
      const result = await caller.results.getEventResults({ eventId });
      expect(result).toBeNull();
    });

    it("returns summary with placements and tabulation", async () => {
      const { couples, round } = await scoreAndPublish();
      const caller = createPublicCaller();
      const result = await caller.results.getEventResults({ eventId });

      expect(result).toBeDefined();
      expect(result!.eventName).toBe("Gold Standard Waltz");
      expect(result!.rounds).toHaveLength(1);

      const roundResult = result!.rounds[0]!;
      expect(roundResult.roundType).toBe("final");
      expect(roundResult.summary.length).toBe(couples.length);

      // Check summary has names
      const first = roundResult.summary[0]!;
      expect(first.placement).toBe(1);
      expect(first.leaderName).toBeDefined();
      expect(first.followerName).toBeDefined();
    });

    it("includes judge info", async () => {
      const { judges: testJudges } = await scoreAndPublish();
      const caller = createPublicCaller();
      const result = await caller.results.getEventResults({ eventId });

      expect(result!.rounds[0]!.judges.length).toBe(testJudges.length);
    });
  });

  // ── getCompetitorHistory ──────────────────────────────────────

  describe("getCompetitorHistory", () => {
    it("returns null for nonexistent user", async () => {
      const caller = createPublicCaller();
      const result = await caller.results.getCompetitorHistory({ userId: "nonexistent" });
      expect(result).toBeNull();
    });

    it("returns empty competitions when user has no finished comps", async () => {
      const user = await createUser();
      const caller = createPublicCaller();
      const result = await caller.results.getCompetitorHistory({ userId: user.id });

      expect(result).toBeDefined();
      expect(result!.competitions).toHaveLength(0);
    });

    it("returns competition history with placements", async () => {
      const { couples } = await scoreAndPublish();
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const leader = couples[0]!.leader;
      const caller = createPublicCaller();
      const result = await caller.results.getCompetitorHistory({ userId: leader.id });

      expect(result!.user.displayName).toBe(leader.displayName);
      expect(result!.competitions).toHaveLength(1);
      expect(result!.competitions[0]!.competitionName).toBe("Results Test Comp");
      expect(result!.competitions[0]!.events).toHaveLength(1);

      const eventResult = result!.competitions[0]!.events[0]!;
      expect(eventResult.eventName).toBe("Gold Standard Waltz");
      expect(eventResult.placement).toBeTypeOf("number");
      expect(eventResult.partnerName).toBeDefined();
    });

    it("hides competitions with approved removals", async () => {
      const { couples } = await scoreAndPublish();
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const leader = couples[0]!.leader;

      // Full competition removal (no entryId)
      await db().insert(recordRemovalRequests).values({
        userId: leader.id,
        competitionId: compId,
        reason: "Privacy request",
        status: "approved",
        reviewedBy: ownerId,
        reviewedAt: new Date(),
      });

      const caller = createPublicCaller();
      const result = await caller.results.getCompetitorHistory({ userId: leader.id });
      expect(result!.competitions).toHaveLength(0);
    });
  });

  // ── searchCompetitors ─────────────────────────────────────────

  describe("searchCompetitors", () => {
    it("finds competitors by name", async () => {
      await registerCouple({
        leaderUsername: "john_dancer",
      });

      const caller = createPublicCaller();
      // Search by display name which is auto-generated as "Test User N"
      const results = await caller.results.searchCompetitors({ query: "Test User" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.competitionCount).toBe(1);
    });

    it("returns empty for no matches", async () => {
      const caller = createPublicCaller();
      const results = await caller.results.searchCompetitors({ query: "zzz_nonexistent_zzz" });
      expect(results).toHaveLength(0);
    });

    it("only includes users with registrations", async () => {
      const loner = await createUser({ displayName: "Lonely Dancer" });
      const caller = createPublicCaller();
      const results = await caller.results.searchCompetitors({ query: "Lonely" });
      expect(results).toHaveLength(0);
    });
  });
});
