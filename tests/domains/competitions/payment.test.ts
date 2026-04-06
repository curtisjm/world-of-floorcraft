import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("payment router", () => {
  let ownerId: string;
  let compId: number;
  let userId: string;
  let regId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);

    const ownerCaller = createCaller(ownerId);
    const comp = await ownerCaller.competition.create({ name: "Test Comp", orgId: org.id });
    await ownerCaller.competition.updateStatus({ competitionId: comp.id, status: "accepting_entries" });
    await ownerCaller.competition.update({ competitionId: comp.id, baseFee: "50.00" });
    compId = comp.id;

    const user = await createUser();
    userId = user.id;
    const userCaller = createCaller(userId);
    const regResult = await userCaller.registration.register({ competitionId: compId });
    regId = regResult.self.id;
  });

  describe("recordManual", () => {
    it("records a cash payment", async () => {
      const ownerCaller = createCaller(ownerId);
      const payment = await ownerCaller.payment.recordManual({
        registrationId: regId,
        amount: "50.00",
        method: "cash",
        note: "Paid at registration table",
      });

      expect(payment.amount).toBe("50.00");
      expect(payment.method).toBe("cash");
      expect(payment.processedBy).toBe(ownerId);
    });

    it("records multiple payments", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.payment.recordManual({
        registrationId: regId,
        amount: "25.00",
        method: "cash",
      });
      await ownerCaller.payment.recordManual({
        registrationId: regId,
        amount: "25.00",
        method: "check",
      });

      const payments = await ownerCaller.payment.listByRegistration({ registrationId: regId });
      expect(payments).toHaveLength(2);
    });
  });

  describe("recordRefund", () => {
    it("records a refund as negative amount", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.payment.recordManual({
        registrationId: regId,
        amount: "50.00",
        method: "cash",
      });

      const refund = await ownerCaller.payment.recordRefund({
        registrationId: regId,
        amount: "20.00",
        method: "cash",
        note: "Partial refund",
      });

      expect(parseFloat(refund.amount)).toBe(-20);
    });
  });

  describe("listByRegistration", () => {
    it("user can view their own payments", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.payment.recordManual({
        registrationId: regId,
        amount: "50.00",
        method: "cash",
      });

      const userCaller = createCaller(userId);
      const payments = await userCaller.payment.listByRegistration({ registrationId: regId });
      expect(payments).toHaveLength(1);
    });
  });

  describe("summaryByCompetition", () => {
    it("returns aggregate payment stats", async () => {
      const ownerCaller = createCaller(ownerId);
      await ownerCaller.payment.recordManual({
        registrationId: regId,
        amount: "50.00",
        method: "cash",
      });

      const summary = await ownerCaller.payment.summaryByCompetition({ competitionId: compId });
      expect(parseFloat(summary.totalCollected)).toBe(50);
      expect(summary.cashCount).toBe(1);
    });
  });
});
