import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { memberships } from "@orgs/schema";

const db = () => getTestDb();

describe("org-competition router", () => {
  let ownerId: string;
  let compId: number;
  let orgId: number;
  let ownerCaller: ReturnType<typeof createCaller>;
  let memberId: string;
  let memberCaller: ReturnType<typeof createCaller>;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    orgId = org.id;
    ownerCaller = createCaller(ownerId);

    // Create org member
    const member = await createUser({ username: "org_member" });
    memberId = member.id;
    await db().insert(memberships).values({
      orgId,
      userId: memberId,
      role: "member",
    });
    memberCaller = createCaller(memberId);

    // Create competition
    const comp = await ownerCaller.competition.create({
      name: "Org Test Comp",
      orgId,
    });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({
      competitionId: compId,
      status: "accepting_entries",
    });

    // Create event
    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Gold Standard Waltz",
      style: "standard",
      level: "gold",
      eventType: "single_dance",
      dances: ["Waltz"],
    });

    // Register an org member couple
    const follower = await createUser({ username: "org_follower" });
    await db().insert(memberships).values({
      orgId,
      userId: follower.id,
      role: "member",
    });

    const memberRegCaller = createCaller(memberId);
    const regResult = await memberRegCaller.registration.register({
      competitionId: compId,
      partnerUsername: "org_follower",
      orgId,
    });

    await memberRegCaller.entry.create({
      eventId: event.id,
      leaderRegistrationId: regResult.self.id,
      followerRegistrationId: regResult.partner!.id,
    });
  });

  // ── getOrgSchedule ────────────────────────────────────────────

  describe("getOrgSchedule", () => {
    it("returns events with org entries", async () => {
      const result = await memberCaller.orgCompetition.getOrgSchedule({
        competitionId: compId,
        orgId,
      });

      expect(result.competitionName).toBe("Org Test Comp");
      expect(result.events.length).toBe(1);
      expect(result.events[0]!.eventName).toBe("Gold Standard Waltz");
      expect(result.events[0]!.couples.length).toBe(1);
    });

    it("rejects non-members", async () => {
      const random = await createUser();
      const randomCaller = createCaller(random.id);

      await expect(
        randomCaller.orgCompetition.getOrgSchedule({
          competitionId: compId,
          orgId,
        }),
      ).rejects.toThrow("Must be an org member");
    });
  });

  // ── getOrgEntries ─────────────────────────────────────────────

  describe("getOrgEntries", () => {
    it("returns org member registrations with entry info", async () => {
      const result = await memberCaller.orgCompetition.getOrgEntries({
        competitionId: compId,
        orgId,
      });

      expect(result.length).toBeGreaterThan(0);
      const reg = result[0]!;
      expect(reg.displayName).toBeDefined();
      expect(reg.eventCount).toBeGreaterThan(0);
    });
  });

  // ── getOrgResults ─────────────────────────────────────────────

  describe("getOrgResults", () => {
    it("returns empty when no results published", async () => {
      const result = await memberCaller.orgCompetition.getOrgResults({
        competitionId: compId,
        orgId,
      });

      expect(result).toHaveLength(0);
    });
  });

  // ── submitAddDrop ─────────────────────────────────────────────

  describe("submitAddDrop", () => {
    it("rejects non-admin org member", async () => {
      // member is a regular member, not admin
      await expect(
        memberCaller.orgCompetition.submitAddDrop({
          competitionId: compId,
          orgId,
          type: "drop",
          eventId: 1,
          leaderRegistrationId: 1,
          followerRegistrationId: 1,
          reason: "Test",
        }),
      ).rejects.toThrow("Org admin required");
    });
  });
});
