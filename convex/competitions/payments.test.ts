import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Task 11 of the Convex migration: Stripe payment state + idempotent webhook
// fulfillment. Stripe-side calls are owned by the actions in
// `stripeActions.ts` and are not exercised here — actions in `"use node"`
// modules cannot run inside `convex-test`'s edge-runtime sandbox without a
// live Stripe sandbox. The internal mutation `fulfillCheckoutSession` is the
// idempotency boundary and is fully covered.

const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_CHECKOUT_ALLOWED_ORIGINS",
  "STRIPE_WEBHOOK_SECRET",
] as const;

async function withStripeEnv<T>(
  values: Partial<Record<(typeof STRIPE_ENV_KEYS)[number], string>>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    STRIPE_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof STRIPE_ENV_KEYS)[number], string | undefined>;

  for (const key of STRIPE_ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const key of STRIPE_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
  name: "Alice Anderson",
};
const BOB = {
  tokenIdentifier: "https://clerk.example.com|user_bob",
  subject: "user_bob",
  name: "Bob Brown",
};

type T = TestConvex<typeof schema>;

describe("isStripeConfigured", () => {
  it("reports Stripe as disabled when optional env values are absent", async () => {
    const status = await withStripeEnv({}, async () => {
      const t = convexTest(schema, modules);
      return await t.query(api.competitions.payments.isStripeConfigured, {});
    });

    expect(status.configured).toBe(false);
    expect(status.checkoutConfigured).toBe(false);
    expect(status.webhookConfigured).toBe(false);
    expect(status.missing).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_CHECKOUT_ALLOWED_ORIGINS",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  it("reports Stripe as enabled only when checkout and webhook env are present", async () => {
    const status = await withStripeEnv(
      {
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_CHECKOUT_ALLOWED_ORIGINS: "https://example.com",
        STRIPE_WEBHOOK_SECRET: "whsec_123",
      },
      async () => {
        const t = convexTest(schema, modules);
        return await t.query(api.competitions.payments.isStripeConfigured, {});
      },
    );

    expect(status.configured).toBe(true);
    expect(status.checkoutConfigured).toBe(true);
    expect(status.webhookConfigured).toBe(true);
    expect(status.missing).toEqual([]);
  });
});

async function seedUser(
  t: T,
  identity: { tokenIdentifier: string; subject: string },
  overrides: { username?: string; displayName?: string } = {},
): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      isPrivate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    }),
  );
}

async function seedOrgWithOwner(
  t: T,
  ownerId: Id<"users">,
  overrides: { name?: string; slug?: string } = {},
): Promise<Id<"organizations">> {
  const now = Date.now();
  return t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", {
      slug: overrides.slug ?? "studio-one",
      name: overrides.name ?? "Studio One",
      membershipModel: "open",
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: ownerId,
      role: "admin",
      createdAt: now,
    });
    return orgId;
  });
}

async function seedCompetition(
  t: T,
  identity: { tokenIdentifier: string; subject: string },
  orgId: Id<"organizations">,
  overrides: {
    name?: string;
    baseFee?: number;
    stripeAccountId?: string;
    stripeOnboardingComplete?: boolean;
  } = {},
): Promise<Id<"competitions">> {
  const comp = await t
    .withIdentity(identity)
    .mutation(api.competitions.core.create, {
      name: overrides.name ?? "Spring Invitational",
      orgId,
    });
  await t.run(async (ctx) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (overrides.baseFee !== undefined) patch.baseFee = overrides.baseFee;
    if (overrides.stripeAccountId !== undefined) {
      patch.stripeAccountId = overrides.stripeAccountId;
    }
    if (overrides.stripeOnboardingComplete !== undefined) {
      patch.stripeOnboardingComplete = overrides.stripeOnboardingComplete;
    }
    await ctx.db.patch(comp._id, patch);
  });
  return comp._id;
}

async function seedRegistration(
  t: T,
  compId: Id<"competitions">,
  userId: Id<"users">,
  overrides: {
    amountOwed?: number;
    paidConfirmed?: boolean;
    cancelled?: boolean;
  } = {},
): Promise<Id<"competitionRegistrations">> {
  return t.run((ctx) =>
    ctx.db.insert("competitionRegistrations", {
      competitionId: compId,
      userId,
      amountOwed: overrides.amountOwed ?? 5000, // $50.00
      paidConfirmed: overrides.paidConfirmed ?? false,
      checkedIn: false,
      registeredAt: Date.now(),
      registeredBy: userId,
      cancelled: overrides.cancelled ?? false,
    }),
  );
}

async function seedCompetitionStaff(
  t: T,
  compId: Id<"competitions">,
  userId: Id<"users">,
  role: "registration" | "scrutineer" = "registration",
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("competitionStaff", {
      competitionId: compId,
      userId,
      role,
      createdAt: Date.now(),
    }),
  );
}

async function seedPayment(
  t: T,
  compId: Id<"competitions">,
  registrationId: Id<"competitionRegistrations">,
  amount: number,
): Promise<Id<"payments">> {
  return t.run((ctx) =>
    ctx.db.insert("payments", {
      competitionId: compId,
      registrationId,
      amount,
      method: "cash",
      createdAt: Date.now(),
    }),
  );
}

// ── recordManual ─────────────────────────────────────────────────────

describe("recordManual", () => {
  it("inserts a payment row in cents and assigns the processor", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);

    const payment = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: regId,
        amount: "25.50",
        method: "cash",
        note: "Paid at door",
      });

    expect(payment.amount).toBe(2550);
    expect(payment.method).toBe("cash");
    expect(payment.note).toBe("Paid at door");
    expect(payment.processedBy).toBe(aliceId);
    expect(payment.registrationId).toBe(regId);
  });

  it("rejects callers without registration staff role", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);

    await expect(
      t.withIdentity(BOB).mutation(api.competitions.payments.recordManual, {
        registrationId: regId,
        amount: "10.00",
        method: "cash",
      }),
    ).rejects.toThrow();
  });
});

// ── recordRefund ─────────────────────────────────────────────────────

describe("recordRefund", () => {
  it("stores a refund as a negative-amount row", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);

    const refund = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordRefund, {
        registrationId: regId,
        amount: "12.34",
        method: "online",
      });

    expect(refund.amount).toBe(-1234);
    expect(refund.method).toBe("online");
    expect(refund.note).toBe("Refund");
    expect(refund.processedBy).toBe(aliceId);
  });

  it("accepts a leading-minus amount and stores it negative", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);

    const refund = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordRefund, {
        registrationId: regId,
        amount: "-7.00",
        method: "cash",
        note: "Manual reversal",
      });

    expect(refund.amount).toBe(-700);
    expect(refund.note).toBe("Manual reversal");
  });
});

// ── listByRegistration ───────────────────────────────────────────────

describe("listByRegistration", () => {
  it("returns rows newest-first for the registration owner", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);

    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: regId,
        amount: "10.00",
        method: "cash",
      });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: regId,
        amount: "5.00",
        method: "check",
      });

    const rows = await t
      .withIdentity(BOB)
      .query(api.competitions.payments.listByRegistration, {
        registrationId: regId,
      });
    expect(rows.length).toBe(2);
    expect(rows[0]!.createdAt).toBeGreaterThanOrEqual(rows[1]!.createdAt);
  });

  it("rejects non-owner non-staff readers", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const carolId = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|user_carol",
      subject: "user_carol",
    });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);
    void carolId;

    await expect(
      t
        .withIdentity({
          tokenIdentifier: "https://clerk.example.com|user_carol",
          subject: "user_carol",
        })
        .query(api.competitions.payments.listByRegistration, {
          registrationId: regId,
        }),
    ).rejects.toThrow();
  });
});

// ── summaryByCompetition ─────────────────────────────────────────────

describe("summaryByCompetition", () => {
  it("aggregates dollar strings and method counts across registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const reg1 = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const reg2 = await seedRegistration(
      t,
      compId,
      await seedUser(t, {
        tokenIdentifier: "https://clerk.example.com|user_carol",
        subject: "user_carol",
      }),
      { amountOwed: 3000 },
    );

    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: reg1,
        amount: "30.00",
        method: "cash",
      });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: reg2,
        amount: "15.00",
        method: "check",
      });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordRefund, {
        registrationId: reg1,
        amount: "5.00",
        method: "cash",
      });

    const summary = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.summaryByCompetition, {
        competitionId: compId,
      });

    // 30 + 15 collected, 5 refunded → 40 net
    expect(summary.totalCollected).toBe("45.00");
    expect(summary.totalRefunded).toBe("5.00");
    expect(summary.netCollected).toBe("40.00");
    // amountOwed: 5000 + 3000 = 8000 cents = $80
    expect(summary.totalOwed).toBe("80.00");
    expect(summary.registrationCount).toBe(2);
    expect(summary.cashCount).toBe(2); // 1 collection + 1 refund
    expect(summary.checkCount).toBe(1);
    expect(summary.onlineCount).toBe(0);
  });

  it("excludes cancelled registrations from amountOwed", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const live = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const cancelled = await seedRegistration(
      t,
      compId,
      await seedUser(t, {
        tokenIdentifier: "https://clerk.example.com|user_dan",
        subject: "user_dan",
      }),
      { amountOwed: 9999 },
    );
    await t.run((ctx) => ctx.db.patch(cancelled, { cancelled: true }));
    void live;

    const summary = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.summaryByCompetition, {
        competitionId: compId,
      });
    expect(summary.totalOwed).toBe("50.00");
    expect(summary.registrationCount).toBe(1);
  });
});

// ── getAnalyticsSummary ──────────────────────────────────────────────

describe("getAnalyticsSummary", () => {
  it("aggregates totals, balances, and method breakdown as numeric dollars", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const reg1 = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const reg2 = await seedRegistration(
      t,
      compId,
      await seedUser(t, {
        tokenIdentifier: "https://clerk.example.com|user_carol",
        subject: "user_carol",
      }),
      { amountOwed: 3000 },
    );

    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: reg1,
        amount: "50.00",
        method: "cash",
      });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: reg2,
        amount: "10.00",
        method: "check",
      });

    const summary = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getAnalyticsSummary, {
        competitionId: compId,
      });

    expect(summary.totalRevenue).toBe(60);
    // reg2: $30 owed - $10 paid = $20 outstanding; reg1 fully paid (and over)
    expect(summary.outstandingBalance).toBe(20);
    expect(summary.registrationCount).toBe(2);
    expect(summary.paidCount).toBe(1); // reg1 fully paid
    expect(summary.methodBreakdown.cash).toBe(50);
    expect(summary.methodBreakdown.check).toBe(10);
    expect(summary.averageRevenuePerCompetitor).toBe(30);
  });
});

// ── getOutstanding ───────────────────────────────────────────────────

describe("getOutstanding", () => {
  it("returns one row per unpaid registration, sorted by balance desc", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB, { displayName: "Bob B" });
    const carolId = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|user_carol",
      subject: "user_carol",
    });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regBob = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const regCarol = await seedRegistration(t, compId, carolId, {
      amountOwed: 8000,
    });
    void regCarol;

    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: regBob,
        amount: "20.00",
        method: "cash",
      });

    const rows = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getOutstanding, {
        competitionId: compId,
      });

    // Carol owes 80 (no payments), Bob owes 30 (50 - 20).
    expect(rows.length).toBe(2);
    expect(rows[0]!.balance).toBe(80);
    expect(rows[1]!.balance).toBe(30);
    expect(rows[1]!.displayName).toBe("Bob B");
  });

  it("excludes fully-paid and cancelled registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const reg = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: reg,
        amount: "50.00",
        method: "cash",
      });

    const rows = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getOutstanding, {
        competitionId: compId,
      });
    expect(rows.length).toBe(0);
  });
});

// ── getPaymentLog ────────────────────────────────────────────────────

describe("getPaymentLog", () => {
  it("filters by method and date window, newest first", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const reg = await seedRegistration(t, compId, bobId);

    const earlyTs = Date.now() - 10_000;
    const lateTs = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("payments", {
        registrationId: reg,
        amount: 1000,
        method: "cash",
        processedBy: aliceId,
        createdAt: earlyTs,
      });
      await ctx.db.insert("payments", {
        registrationId: reg,
        amount: 2500,
        method: "check",
        processedBy: aliceId,
        createdAt: lateTs,
      });
    });

    const all = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getPaymentLog, {
        competitionId: compId,
      });
    expect(all.length).toBe(2);
    expect(all[0]!.createdAt).toBeGreaterThanOrEqual(all[1]!.createdAt);

    const cashOnly = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getPaymentLog, {
        competitionId: compId,
        method: "cash",
      });
    expect(cashOnly.length).toBe(1);
    expect(cashOnly[0]!.method).toBe("cash");

    const fromLate = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getPaymentLog, {
        competitionId: compId,
        dateFromMs: lateTs - 1,
      });
    expect(fromLate.length).toBe(1);
    expect(fromLate[0]!.amount).toBe(25);
  });
});

// ── getConnectStatusRecord ───────────────────────────────────────────

describe("getConnectStatusRecord", () => {
  it("reflects the persisted onboarding fields", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test_123",
      stripeOnboardingComplete: true,
    });

    const status = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getConnectStatusRecord, {
        competitionId: compId,
      });
    expect(status.connected).toBe(true);
    expect(status.onboardingComplete).toBe(true);
    expect(status.stripeAccountId).toBe("acct_test_123");
  });

  it("returns connected=false when no account id is stored", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const status = await t
      .withIdentity(ALICE)
      .query(api.competitions.payments.getConnectStatusRecord, {
        competitionId: compId,
      });
    expect(status.connected).toBe(false);
    expect(status.onboardingComplete).toBe(false);
    expect(status.stripeAccountId).toBeNull();
  });
});

// ── persistConnectStatus ─────────────────────────────────────────────

describe("persistConnectStatus", () => {
  it("patches stripeAccountId and onboardingComplete", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    await t.mutation(internal.competitions.payments.persistConnectStatus, {
      competitionId: compId,
      stripeAccountId: "acct_new",
      onboardingComplete: false,
    });
    let comp = await t.run((ctx) => ctx.db.get(compId));
    expect(comp?.stripeAccountId).toBe("acct_new");
    expect(comp?.stripeOnboardingComplete).toBe(false);

    await t.mutation(internal.competitions.payments.persistConnectStatus, {
      competitionId: compId,
      onboardingComplete: true,
    });
    comp = await t.run((ctx) => ctx.db.get(compId));
    expect(comp?.stripeAccountId).toBe("acct_new"); // unchanged
    expect(comp?.stripeOnboardingComplete).toBe(true);
  });
});

// ── fulfillCheckoutSession (the idempotency boundary) ────────────────

describe("fulfillCheckoutSession", () => {
  it("creates an online payment row, marks registrations paid, and is idempotent by session id", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });

    const first = await t.mutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: "cs_test_1",
        paymentIntentId: "pi_test_1",
        amountTotal: 5000,
        registrationIds: [regId],
      },
    );
    expect(first.status).toBe("fulfilled");

    // Idempotent replay — same session id, no new row.
    const second = await t.mutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: "cs_test_1",
        paymentIntentId: "pi_test_1",
        amountTotal: 5000,
        registrationIds: [regId],
      },
    );
    expect(second.status).toBe("already_fulfilled");

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_registration", (q) =>
          q.eq("registrationId", regId),
        )
        .collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.amount).toBe(5000);
    expect(rows[0]!.method).toBe("online");
    expect(rows[0]!.stripeCheckoutSessionId).toBe("cs_test_1");
    expect(rows[0]!.stripePaymentIntentId).toBe("pi_test_1");

    const reg = await t.run((ctx) => ctx.db.get(regId));
    expect(reg?.paidConfirmed).toBe(true);
  });

  it("backfills the session id onto a row already keyed by the payment intent", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId);

    // Simulate an earlier payment row that recorded the PI but not the session.
    const preexistingId = await t.run((ctx) =>
      ctx.db.insert("payments", {
        registrationId: regId,
        amount: 5000,
        method: "online",
        stripePaymentIntentId: "pi_overlap",
        createdAt: Date.now() - 1000,
      }),
    );

    const result = await t.mutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: "cs_overlap",
        paymentIntentId: "pi_overlap",
        amountTotal: 5000,
        registrationIds: [regId],
      },
    );
    expect(result.status).toBe("linked_existing_intent");

    const refreshed = await t.run((ctx) => ctx.db.get(preexistingId));
    expect(refreshed?.stripeCheckoutSessionId).toBe("cs_overlap");

    // No duplicate row was inserted.
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_registration", (q) =>
          q.eq("registrationId", regId),
        )
        .collect(),
    );
    expect(rows.length).toBe(1);
  });

  it("marks every registration paid when a session covers multiple registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const carolId = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|user_carol",
      subject: "user_carol",
    });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const reg1 = await seedRegistration(t, compId, bobId);
    const reg2 = await seedRegistration(t, compId, carolId);

    const result = await t.mutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: "cs_pair",
        paymentIntentId: "pi_pair",
        amountTotal: 10000,
        registrationIds: [reg1, reg2],
      },
    );
    expect(result.status).toBe("fulfilled");

    const reg1Doc = await t.run((ctx) => ctx.db.get(reg1));
    const reg2Doc = await t.run((ctx) => ctx.db.get(reg2));
    expect(reg1Doc?.paidConfirmed).toBe(true);
    expect(reg2Doc?.paidConfirmed).toBe(true);

    // Payment row is attached to the first registration (legacy behavior).
    const reg1Rows = await t.run((ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_registration", (q) =>
          q.eq("registrationId", reg1),
        )
        .collect(),
    );
    expect(reg1Rows.length).toBe(1);
    const reg2Rows = await t.run((ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_registration", (q) =>
          q.eq("registrationId", reg2),
        )
        .collect(),
    );
    expect(reg2Rows.length).toBe(0);
  });

  it("returns skipped without writing when registrationIds is empty", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: "cs_empty",
        amountTotal: 0,
        registrationIds: [],
      },
    );
    expect(result.status).toBe("skipped");
  });

  it("uses a persisted pending checkout session when webhook metadata has no registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regId = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });

    await t.mutation(
      internal.competitions.payments.persistPendingCheckoutSession,
      {
        checkoutSessionId: "cs_pending",
        competitionId: compId,
        registrationIds: [regId],
        callerUserId: bobId,
        amountTotal: 5000,
      },
    );

    const result = await t.mutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: "cs_pending",
        paymentIntentId: "pi_pending",
        amountTotal: 5000,
        registrationIds: [],
      },
    );
    expect(result.status).toBe("fulfilled");

    const pending = await t.run((ctx) =>
      ctx.db
        .query("stripeCheckoutSessions")
        .withIndex("by_stripe_checkout_session", (q) =>
          q.eq("stripeCheckoutSessionId", "cs_pending"),
        )
        .unique(),
    );
    expect(pending?.status).toBe("fulfilled");
    expect(pending?.stripePaymentIntentId).toBe("pi_pending");
    expect(pending?.paymentId).toBe(result.paymentId);

    const rows = await t.run((ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", regId))
        .collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.stripeCheckoutSessionId).toBe("cs_pending");

    const reg = await t.run((ctx) => ctx.db.get(regId));
    expect(reg?.paidConfirmed).toBe(true);
  });
});

// ── loadCheckoutData ─────────────────────────────────────────────────

describe("loadCheckoutData", () => {
  it("returns total cents and the comp Stripe account when configured", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const reg1 = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const reg2 = await seedRegistration(t, compId, bobId, { amountOwed: 3000 });

    const data = await t.mutation(
      internal.competitions.payments.loadCheckoutData,
      {
        registrationIds: [reg1, reg2],
        callerUserId: bobId,
      },
    );
    expect(data.totalCents).toBe(8000);
    expect(data.stripeAccountId).toBe("acct_test");
    expect(data.competitionId).toBe(compId);
    expect(data.registrationIds.sort()).toEqual([reg1, reg2].sort());
  });

  it("charges only the outstanding balance after a partial payment", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const regId = await seedRegistration(t, compId, bobId, {
      amountOwed: 5000,
    });
    await seedPayment(t, compId, regId, 1750);

    const data = await t.mutation(
      internal.competitions.payments.loadCheckoutData,
      {
        registrationIds: [regId],
        callerUserId: bobId,
      },
    );
    expect(data.totalCents).toBe(3250);
  });

  it("counts refunds when calculating outstanding balance", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const regId = await seedRegistration(t, compId, bobId, {
      amountOwed: 5000,
    });
    await seedPayment(t, compId, regId, 4000);
    await seedPayment(t, compId, regId, -1500);

    const data = await t.mutation(
      internal.competitions.payments.loadCheckoutData,
      {
        registrationIds: [regId],
        callerUserId: bobId,
      },
    );
    expect(data.totalCents).toBe(2500);
  });

  it("sums outstanding balances across multiple registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const reg1 = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const reg2 = await seedRegistration(t, compId, bobId, { amountOwed: 3000 });
    await seedPayment(t, compId, reg1, 1000);
    await seedPayment(t, compId, reg2, 2500);

    const data = await t.mutation(
      internal.competitions.payments.loadCheckoutData,
      {
        registrationIds: [reg1, reg2],
        callerUserId: bobId,
      },
    );
    expect(data.totalCents).toBe(4500);
    expect(data.registrationIds.sort()).toEqual([reg1, reg2].sort());
  });

  it("rejects cancelled registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const regId = await seedRegistration(t, compId, bobId, {
      amountOwed: 5000,
      cancelled: true,
    });

    await expect(
      t.mutation(internal.competitions.payments.loadCheckoutData, {
        registrationIds: [regId],
        callerUserId: bobId,
      }),
    ).rejects.toThrow(/cancelled/i);
  });

  it("rejects fully paid registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const regId = await seedRegistration(t, compId, bobId, {
      amountOwed: 5000,
    });
    await seedPayment(t, compId, regId, 5000);

    await expect(
      t.mutation(internal.competitions.payments.loadCheckoutData, {
        registrationIds: [regId],
        callerUserId: bobId,
      }),
    ).rejects.toThrow(/paid/i);
  });

  it("rejects registrations already marked paid", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const regId = await seedRegistration(t, compId, bobId, {
      amountOwed: 5000,
      paidConfirmed: true,
    });

    await expect(
      t.mutation(internal.competitions.payments.loadCheckoutData, {
        registrationIds: [regId],
        callerUserId: bobId,
      }),
    ).rejects.toThrow(/paid/i);
  });

  it("rejects a caller who does not own every requested registration", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const carolId = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|user_carol",
      subject: "user_carol",
    });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    const bobReg = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const carolReg = await seedRegistration(t, compId, carolId, {
      amountOwed: 3000,
    });

    await expect(
      t.mutation(internal.competitions.payments.loadCheckoutData, {
        registrationIds: [bobReg, carolReg],
        callerUserId: bobId,
      }),
    ).rejects.toThrow();
  });

  it("allows competition registration staff to load checkout data for other users", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const carolId = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|user_carol",
      subject: "user_carol",
    });
    const staffId = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|user_staff",
      subject: "user_staff",
    });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
    });
    await seedCompetitionStaff(t, compId, staffId, "registration");
    const bobReg = await seedRegistration(t, compId, bobId, { amountOwed: 5000 });
    const carolReg = await seedRegistration(t, compId, carolId, {
      amountOwed: 3000,
    });

    const data = await t.mutation(
      internal.competitions.payments.loadCheckoutData,
      {
        registrationIds: [bobReg, carolReg],
        callerUserId: staffId,
      },
    );
    expect(data.totalCents).toBe(8000);
  });

  it("rejects when the competition has not finished Stripe onboarding", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId, {
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: false,
    });
    const regId = await seedRegistration(t, compId, bobId);

    await expect(
      t.mutation(internal.competitions.payments.loadCheckoutData, {
        registrationIds: [regId],
        callerUserId: bobId,
      }),
    ).rejects.toThrow();
  });

  it("rejects when registrations belong to different competitions", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compA = await seedCompetition(t, ALICE, orgId, {
      name: "Comp A",
      stripeAccountId: "acct",
      stripeOnboardingComplete: true,
    });
    const compB = await seedCompetition(t, ALICE, orgId, {
      name: "Comp B",
      stripeAccountId: "acct",
      stripeOnboardingComplete: true,
    });
    const regA = await seedRegistration(t, compA, bobId);
    const regB = await seedRegistration(t, compB, bobId);

    await expect(
      t.mutation(internal.competitions.payments.loadCheckoutData, {
        registrationIds: [regA, regB],
        callerUserId: bobId,
      }),
    ).rejects.toThrow();
  });
});
