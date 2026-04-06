import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("record-removal router", () => {
  let ownerId: string;
  let compId: number;
  let ownerCaller: ReturnType<typeof createCaller>;
  let competitorId: string;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    ownerCaller = createCaller(ownerId);

    const comp = await ownerCaller.competition.create({
      name: "Removal Test Comp",
      orgId: org.id,
    });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({
      competitionId: compId,
      status: "accepting_entries",
    });

    // Register a competitor
    const competitor = await createUser({ username: "competitor_rm" });
    competitorId = competitor.id;
    const follower = await createUser({ username: "follower_rm" });

    const competitorCaller = createCaller(competitorId);
    const regResult = await competitorCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_rm",
    });

    // Create an event and entry
    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Test Event",
      style: "standard",
      level: "gold",
      eventType: "single_dance",
      dances: ["Waltz"],
    });

    await competitorCaller.entry.create({
      eventId: event.id,
      leaderRegistrationId: regResult.self.id,
      followerRegistrationId: regResult.partner!.id,
    });

    // Finish the competition
    await ownerCaller.competition.updateStatus({
      competitionId: compId,
      status: "finished",
    });
  });

  // ── submit ────────────────────────────────────────────────────

  describe("submit", () => {
    it("submits a removal request", async () => {
      const competitorCaller = createCaller(competitorId);
      const request = await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Personal privacy",
      });

      expect(request).toBeDefined();
      expect(request!.status).toBe("pending");
      expect(request!.reason).toBe("Personal privacy");
    });

    it("rejects when competition is not finished", async () => {
      // Create another active competition
      const org = await createOrg(ownerId);
      const comp2 = await ownerCaller.competition.create({
        name: "Active Comp",
        orgId: org.id,
      });

      const competitorCaller = createCaller(competitorId);
      await expect(
        competitorCaller.recordRemoval.submit({
          competitionId: comp2.id,
          reason: "Test",
        }),
      ).rejects.toThrow("must be finished");
    });

    it("prevents duplicate pending requests", async () => {
      const competitorCaller = createCaller(competitorId);
      await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "First request",
      });

      await expect(
        competitorCaller.recordRemoval.submit({
          competitionId: compId,
          reason: "Second request",
        }),
      ).rejects.toThrow("already have a pending");
    });
  });

  // ── getMyRequests ─────────────────────────────────────────────

  describe("getMyRequests", () => {
    it("returns user's requests", async () => {
      const competitorCaller = createCaller(competitorId);
      await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Privacy",
      });

      const requests = await competitorCaller.recordRemoval.getMyRequests();
      expect(requests.length).toBe(1);
      expect(requests[0]!.competitionName).toBe("Removal Test Comp");
    });
  });

  // ── listPending ───────────────────────────────────────────────

  describe("listPending", () => {
    it("lists pending requests", async () => {
      const competitorCaller = createCaller(competitorId);
      await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Privacy",
      });

      const pending = await ownerCaller.recordRemoval.listPending();
      expect(pending.length).toBe(1);
      expect(pending[0]!.userName).toBeDefined();
    });
  });

  // ── approve / reject ──────────────────────────────────────────

  describe("approve", () => {
    it("approves a pending request", async () => {
      const competitorCaller = createCaller(competitorId);
      const request = await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Privacy",
      });

      const approved = await ownerCaller.recordRemoval.approve({
        requestId: request!.id,
        reviewNotes: "Approved per policy",
      });

      expect(approved!.status).toBe("approved");
      expect(approved!.reviewedBy).toBe(ownerId);
      expect(approved!.reviewNotes).toBe("Approved per policy");
    });

    it("rejects approving non-pending request", async () => {
      const competitorCaller = createCaller(competitorId);
      const request = await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Privacy",
      });

      await ownerCaller.recordRemoval.approve({ requestId: request!.id });

      await expect(
        ownerCaller.recordRemoval.approve({ requestId: request!.id }),
      ).rejects.toThrow("not pending");
    });
  });

  describe("reject", () => {
    it("rejects a pending request", async () => {
      const competitorCaller = createCaller(competitorId);
      const request = await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Privacy",
      });

      const rejected = await ownerCaller.recordRemoval.reject({
        requestId: request!.id,
        reviewNotes: "Insufficient reason",
      });

      expect(rejected!.status).toBe("rejected");
    });
  });

  // ── getRequest ────────────────────────────────────────────────

  describe("getRequest", () => {
    it("returns request detail with entries", async () => {
      const competitorCaller = createCaller(competitorId);
      const request = await competitorCaller.recordRemoval.submit({
        competitionId: compId,
        reason: "Privacy",
      });

      const detail = await ownerCaller.recordRemoval.getRequest({
        requestId: request!.id,
      });

      expect(detail).toBeDefined();
      expect(detail!.reason).toBe("Privacy");
      expect(detail!.entries.length).toBeGreaterThan(0);
    });

    it("returns null for nonexistent request", async () => {
      const detail = await ownerCaller.recordRemoval.getRequest({
        requestId: 99999,
      });
      expect(detail).toBeNull();
    });
  });
});
