import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("registration router", () => {
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
    await caller.competition.updateStatus({ competitionId: comp.id, status: "accepting_entries" });
    compId = comp.id;
  });

  describe("register", () => {
    it("registers self for a competition", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      const result = await caller.registration.register({
        competitionId: compId,
      });

      expect(result.self).toBeDefined();
      expect(result.self.userId).toBe(user.id);
      expect(result.partner).toBeNull();
    });

    it("registers self and partner", async () => {
      const leader = await createUser();
      const follower = await createUser({ username: "partner_user" });
      const caller = createCaller(leader.id);

      const result = await caller.registration.register({
        competitionId: compId,
        partnerUsername: "partner_user",
      });

      expect(result.self.userId).toBe(leader.id);
      expect(result.partner).not.toBeNull();
      expect(result.partner!.userId).toBe(follower.id);
    });

    it("rejects duplicate registration", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      await caller.registration.register({ competitionId: compId });

      await expect(
        caller.registration.register({ competitionId: compId }),
      ).rejects.toThrow("Already registered");
    });

    it("rejects when not accepting entries", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "draft" });

      const user = await createUser();
      const caller = createCaller(user.id);

      await expect(
        caller.registration.register({ competitionId: compId }),
      ).rejects.toThrow("not accepting entries");
    });

    it("sets org affiliation", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      const result = await caller.registration.register({
        competitionId: compId,
        orgId,
      });

      expect(result.self.orgId).toBe(orgId);
    });
  });

  describe("getMyRegistration", () => {
    it("returns null when not registered", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      const result = await caller.registration.getMyRegistration({ competitionId: compId });
      expect(result).toBeNull();
    });

    it("returns registration with entries and payments", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      await caller.registration.register({ competitionId: compId });

      const result = await caller.registration.getMyRegistration({ competitionId: compId });
      expect(result).not.toBeNull();
      expect(result!.entries).toBeDefined();
      expect(result!.payments).toBeDefined();
      expect(result!.totalPaid).toBe("0.00");
    });
  });

  describe("toggleCheckedIn", () => {
    it("toggles checked-in status", async () => {
      const user = await createUser();
      const userCaller = createCaller(user.id);
      await userCaller.registration.register({ competitionId: compId });

      const reg = await userCaller.registration.getMyRegistration({ competitionId: compId });

      const ownerCaller = createCaller(ownerId);
      const toggled = await ownerCaller.registration.toggleCheckedIn({
        registrationId: reg!.id,
      });
      expect(toggled.checkedIn).toBe(true);

      const toggledBack = await ownerCaller.registration.toggleCheckedIn({
        registrationId: reg!.id,
      });
      expect(toggledBack.checkedIn).toBe(false);
    });
  });

  describe("cancel", () => {
    it("marks registration as cancelled", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      await caller.registration.register({ competitionId: compId });
      const reg = await caller.registration.getMyRegistration({ competitionId: compId });

      const cancelled = await caller.registration.cancel({ registrationId: reg!.id });
      expect(cancelled.cancelled).toBe(true);
    });
  });

  describe("updateOrgAffiliation", () => {
    it("allows user to change their own org", async () => {
      const user = await createUser();
      const caller = createCaller(user.id);

      await caller.registration.register({ competitionId: compId, orgId });
      const reg = await caller.registration.getMyRegistration({ competitionId: compId });

      const updated = await caller.registration.updateOrgAffiliation({
        registrationId: reg!.id,
        orgId: null,
      });
      expect(updated.orgId).toBeNull();
    });
  });
});
