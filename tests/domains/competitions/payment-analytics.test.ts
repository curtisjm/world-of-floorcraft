import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { competitionRegistrations, payments } from "@competitions/schema";
import { eq } from "drizzle-orm";

const db = () => getTestDb();

describe("payment-analytics router", () => {
  let ownerId: string;
  let compId: number;
  let ownerCaller: ReturnType<typeof createCaller>;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    ownerCaller = createCaller(ownerId);

    const comp = await ownerCaller.competition.create({
      name: "Payment Test Comp",
      orgId: org.id,
    });
    compId = comp.id;
    await ownerCaller.competition.updateStatus({
      competitionId: compId,
      status: "accepting_entries",
    });
  });

  async function registerWithPayment(amount: string) {
    const leader = await createUser();
    const follower = await createUser();
    const leaderCaller = createCaller(leader.id);

    const reg = await leaderCaller.registration.register({
      competitionId: compId,
      partnerUsername: follower.username!,
    });

    // Set amount owed via direct DB update
    await db()
      .update(competitionRegistrations)
      .set({ amountOwed: amount })
      .where(eq(competitionRegistrations.id, reg.self.id));

    // Record payment via direct DB insert
    await db().insert(payments).values({
      registrationId: reg.self.id,
      amount,
      method: "cash",
      note: "Paid at door",
      processedBy: ownerId,
    });

    return { leader, follower, reg };
  }

  // ── getSummary ────────────────────────────────────────────────

  describe("getSummary", () => {
    it("returns financial summary", async () => {
      await registerWithPayment("50");
      await registerWithPayment("75");

      const result = await ownerCaller.paymentAnalytics.getSummary({
        competitionId: compId,
      });

      expect(result.totalRevenue).toBe(125);
      expect(result.registrationCount).toBe(4); // 2 leaders + 2 followers
      expect(result.methodBreakdown.cash).toBe(125);
    });

    it("returns zeros when no registrations", async () => {
      const result = await ownerCaller.paymentAnalytics.getSummary({
        competitionId: compId,
      });

      expect(result.totalRevenue).toBe(0);
      expect(result.registrationCount).toBe(0);
      expect(result.outstandingBalance).toBe(0);
    });

    it("rejects non-admin", async () => {
      const random = await createUser();
      const randomCaller = createCaller(random.id);

      await expect(
        randomCaller.paymentAnalytics.getSummary({ competitionId: compId }),
      ).rejects.toThrow();
    });
  });

  // ── getPaymentLog ─────────────────────────────────────────────

  describe("getPaymentLog", () => {
    it("returns all payments with competitor info", async () => {
      await registerWithPayment("50");

      const result = await ownerCaller.paymentAnalytics.getPaymentLog({
        competitionId: compId,
      });

      expect(result.length).toBe(1);
      expect(result[0]!.amount).toBe(50);
      expect(result[0]!.method).toBe("cash");
      expect(result[0]!.competitorName).toBeDefined();
    });

    it("filters by method", async () => {
      await registerWithPayment("50");

      const result = await ownerCaller.paymentAnalytics.getPaymentLog({
        competitionId: compId,
        method: "online",
      });

      expect(result).toHaveLength(0);
    });
  });

  // ── getOutstanding ────────────────────────────────────────────

  describe("getOutstanding", () => {
    it("returns registrations with outstanding balances", async () => {
      const leader = await createUser();
      const follower = await createUser();
      const leaderCaller = createCaller(leader.id);

      const reg = await leaderCaller.registration.register({
        competitionId: compId,
        partnerUsername: follower.username!,
      });

      // Set amount owed without recording payment
      await db()
        .update(competitionRegistrations)
        .set({ amountOwed: "100" })
        .where(eq(competitionRegistrations.id, reg.self.id));

      const result = await ownerCaller.paymentAnalytics.getOutstanding({
        competitionId: compId,
      });

      expect(result.length).toBe(1);
      expect(result[0]!.balance).toBe(100);
      expect(result[0]!.displayName).toBeDefined();
    });

    it("excludes fully paid registrations", async () => {
      await registerWithPayment("50");

      const result = await ownerCaller.paymentAnalytics.getOutstanding({
        competitionId: compId,
      });

      expect(result).toHaveLength(0);
    });
  });
});
