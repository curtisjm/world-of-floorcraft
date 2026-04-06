import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("registration-table router", () => {
  let ownerId: string;
  let compId: number;
  let staffId: string;
  let leaderId: string;
  let followerId: string;
  let leaderRegId: number;
  let followerRegId: number;
  let eventId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({ competitionId: compId, status: "accepting_entries" });

    // Assign a registration staff member
    const staffUser = await createUser({ username: "reg_staff" });
    staffId = staffUser.id;
    await ownerCaller.staff.assign({ competitionId: compId, userId: staffId, role: "registration" });

    // Create an event
    const event = await ownerCaller.event.create({
      competitionId: compId,
      name: "Newcomer Smooth Waltz",
      style: "smooth",
      level: "newcomer",
      eventType: "single_dance",
      dances: ["Waltz"],
    });
    eventId = event.id;

    // Register a couple
    const leader = await createUser({ username: "leader_rt" });
    const follower = await createUser({ username: "follower_rt" });
    leaderId = leader.id;
    followerId = follower.id;

    const leaderCaller = createCaller(leaderId);
    const regResult = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: "follower_rt",
    });
    leaderRegId = regResult.self.id;
    followerRegId = regResult.partner!.id;

    // Create entry
    await leaderCaller.entry.create({
      eventId,
      leaderRegistrationId: leaderRegId,
      followerRegistrationId: followerRegId,
    });
  });

  describe("getRegistrationTable", () => {
    it("returns registrations grouped by org", async () => {
      const caller = createCaller(staffId);
      const table = await caller.registrationTable.getRegistrationTable({ competitionId: compId });

      expect(table.length).toBeGreaterThan(0);
      // All registrations should be included
      const allRegs = table.flatMap((g) => g.registrations);
      expect(allRegs.length).toBe(2); // leader + follower
    });

    it("includes payment and check-in info", async () => {
      const caller = createCaller(staffId);
      const table = await caller.registrationTable.getRegistrationTable({ competitionId: compId });
      const allRegs = table.flatMap((g) => g.registrations);

      const leaderReg = allRegs.find((r) => r.id === leaderRegId)!;
      expect(leaderReg.checkedIn).toBe(false);
      expect(leaderReg.totalPaid).toBe("0");
    });
  });

  describe("checkinRegistration", () => {
    it("checks in a registration", async () => {
      const caller = createCaller(staffId);
      const result = await caller.registrationTable.checkinRegistration({
        registrationId: leaderRegId,
      });

      expect(result).toBeDefined();
      expect(result.registrationId).toBe(leaderRegId);
      expect(result.checkedInBy).toBe(staffId);
    });

    it("rejects duplicate check-in", async () => {
      const caller = createCaller(staffId);
      await caller.registrationTable.checkinRegistration({ registrationId: leaderRegId });

      await expect(
        caller.registrationTable.checkinRegistration({ registrationId: leaderRegId }),
      ).rejects.toThrow("Already checked in");
    });
  });

  describe("undoCheckin", () => {
    it("reverses a check-in", async () => {
      const caller = createCaller(staffId);
      await caller.registrationTable.checkinRegistration({ registrationId: leaderRegId });
      const result = await caller.registrationTable.undoCheckin({ registrationId: leaderRegId });

      expect(result.undone).toBe(true);

      // Can check in again
      const checkin = await caller.registrationTable.checkinRegistration({
        registrationId: leaderRegId,
      });
      expect(checkin.registrationId).toBe(leaderRegId);
    });
  });

  describe("recordPayment", () => {
    it("records a manual payment", async () => {
      const caller = createCaller(staffId);
      const payment = await caller.registrationTable.recordPayment({
        registrationId: leaderRegId,
        amount: "50.00",
        method: "cash",
        note: "Paid at door",
      });

      expect(payment.amount).toBe("50.00");
      expect(payment.method).toBe("cash");
      expect(payment.processedBy).toBe(staffId);
    });
  });

  describe("add/drop management", () => {
    it("returns pending add/drop requests", async () => {
      // Close entries first, then submit a request
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });

      // Create a second event for an add request
      const event2 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Smooth Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      const leaderCaller = createCaller(leaderId);
      await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "add",
        eventId: event2.id,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const caller = createCaller(staffId);
      const pending = await caller.registrationTable.getPendingAddDrops({ competitionId: compId });
      expect(pending.safe.length + pending.needsReview.length).toBe(1);
    });

    it("approves an add/drop request", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "entries_closed" });

      const event2 = await ownerCaller.event.create({
        competitionId: compId,
        name: "Newcomer Smooth Tango",
        style: "smooth",
        level: "newcomer",
        eventType: "single_dance",
        dances: ["Tango"],
      });

      const leaderCaller = createCaller(leaderId);
      const request = await leaderCaller.addDrop.submit({
        competitionId: compId,
        type: "add",
        eventId: event2.id,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
      });

      const caller = createCaller(staffId);
      const approved = await caller.registrationTable.approveAddDrop({ requestId: request.id });
      expect(approved.status).toBe("approved");
    });
  });

  describe("authorization", () => {
    it("rejects non-staff users", async () => {
      const randomUser = await createUser();
      const caller = createCaller(randomUser.id);

      await expect(
        caller.registrationTable.getRegistrationTable({ competitionId: compId }),
      ).rejects.toThrow();
    });
  });
});
