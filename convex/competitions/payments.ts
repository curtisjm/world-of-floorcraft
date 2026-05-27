import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import {
  requireCompOrgRole,
  requireCompStaffRole,
} from "../lib/permissions";
import { paymentMethod } from "../schema";
import { dollarsToCents } from "../lib/money";

/**
 * Payment state functions for Task 11 of the Convex migration.
 *
 * Ported from `src/domains/competitions/routers/payment.ts`. Money is stored
 * in cents on `payments.amount`; the legacy router stored dollar strings and
 * converted at the edges. Refunds remain negative-amount rows on the same
 * `payments` table so summary aggregates are simple sums.
 *
 * Stripe-side calls (Checkout Session creation, Connect account creation,
 * status refresh) live in `stripeActions.ts` because they need Node.js. The
 * idempotent fulfillment mutation here is what those actions and the Next.js
 * webhook route eventually persist to.
 */

async function callerCanManageCheckout(
  ctx: MutationCtx,
  competition: Doc<"competitions">,
  callerUserId: Id<"users">,
): Promise<boolean> {
  const org = await ctx.db.get(competition.orgId);
  if (org?.ownerId === callerUserId) return true;

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", competition.orgId).eq("userId", callerUserId),
    )
    .unique();
  if (membership?.role === "admin") return true;

  const staffRows = await ctx.db
    .query("competitionStaff")
    .withIndex("by_competition_user_role", (q) =>
      q.eq("competitionId", competition._id).eq("userId", callerUserId),
    )
    .collect();
  return staffRows.some(
    (staff) => staff.role === "registration" || staff.role === "scrutineer",
  );
}

async function findPendingCheckoutSession(
  ctx: MutationCtx,
  checkoutSessionId: string,
  paymentIntentId?: string,
): Promise<Doc<"stripeCheckoutSessions"> | null> {
  const bySession = await ctx.db
    .query("stripeCheckoutSessions")
    .withIndex("by_stripe_checkout_session", (q) =>
      q.eq("stripeCheckoutSessionId", checkoutSessionId),
    )
    .unique();
  if (bySession) return bySession;

  if (!paymentIntentId) return null;
  return await ctx.db
    .query("stripeCheckoutSessions")
    .withIndex("by_stripe_payment_intent", (q) =>
      q.eq("stripePaymentIntentId", paymentIntentId),
    )
    .unique();
}

async function markCheckoutSessionFulfilled(
  ctx: MutationCtx,
  pending: Doc<"stripeCheckoutSessions"> | null,
  paymentId: Id<"payments">,
  paymentIntentId?: string,
) {
  if (!pending || pending.status === "fulfilled") return;
  const now = Date.now();
  const patch: {
    status: "fulfilled";
    paymentId: Id<"payments">;
    updatedAt: number;
    fulfilledAt: number;
    stripePaymentIntentId?: string;
  } = {
    status: "fulfilled",
    paymentId,
    updatedAt: now,
    fulfilledAt: now,
  };
  if (paymentIntentId && !pending.stripePaymentIntentId) {
    patch.stripePaymentIntentId = paymentIntentId;
  }
  await ctx.db.patch(pending._id, patch);
}

async function markRegistrationsPaid(
  ctx: MutationCtx,
  registrationIds: Id<"competitionRegistrations">[],
) {
  for (const regId of registrationIds) {
    const reg = await ctx.db.get(regId);
    if (reg && !reg.paidConfirmed) {
      await ctx.db.patch(regId, { paidConfirmed: true });
    }
  }
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * All payment rows for a registration, newest first. Visible to the
 * registration's owner or registration-desk staff.
 */
export const listByRegistration = query({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");

    const user = await getCurrentUser(ctx);
    if (reg.userId !== user._id) {
      await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    }

    const rows = await ctx.db
      .query("payments")
      .withIndex("by_registration", (q) =>
        q.eq("registrationId", args.registrationId),
      )
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});

/**
 * Aggregate payment totals for a competition's registration desk. All amounts
 * are returned as fixed two-decimal dollar strings to match the existing UI;
 * the underlying storage is integer cents.
 */
export const summaryByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const activeRegs = regs.filter((r) => !r.cancelled);

    let totalCollectedCents = 0;
    let totalRefundedCents = 0;
    let netCollectedCents = 0;
    let onlineCount = 0;
    let cashCount = 0;
    let checkCount = 0;
    let otherCount = 0;

    for (const reg of activeRegs) {
      const rows = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      for (const row of rows) {
        if (row.amount > 0) totalCollectedCents += row.amount;
        else if (row.amount < 0) totalRefundedCents += Math.abs(row.amount);
        netCollectedCents += row.amount;
        if (row.method === "online") onlineCount++;
        else if (row.method === "cash") cashCount++;
        else if (row.method === "check") checkCount++;
        else otherCount++;
      }
    }

    const totalOwedCents = activeRegs.reduce(
      (sum, reg) => sum + reg.amountOwed,
      0,
    );

    return {
      totalCollected: (totalCollectedCents / 100).toFixed(2),
      totalRefunded: (totalRefundedCents / 100).toFixed(2),
      netCollected: (netCollectedCents / 100).toFixed(2),
      totalOwed: (totalOwedCents / 100).toFixed(2),
      registrationCount: activeRegs.length,
      onlineCount,
      cashCount,
      checkCount,
      otherCount,
    };
  },
});

/**
 * Organizer financial-overview metrics. Mirrors the dollar/decimal-number
 * shape of the legacy `paymentAnalytics.getSummary` so the analytics
 * dashboard renders without translation.
 */
export const getAnalyticsSummary = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const activeRegs = regs.filter((r) => !r.cancelled);

    let totalRevenueCents = 0;
    let outstandingBalanceCents = 0;
    let paidCount = 0;
    const methodBreakdown: Record<string, number> = {};

    for (const reg of activeRegs) {
      const rows = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      const paid = rows.reduce((sum, p) => sum + p.amount, 0);
      totalRevenueCents += paid;
      if (reg.amountOwed > 0 && paid >= reg.amountOwed) paidCount++;
      const balance = reg.amountOwed - paid;
      if (balance > 0) outstandingBalanceCents += balance;
      for (const row of rows) {
        methodBreakdown[row.method] =
          (methodBreakdown[row.method] ?? 0) + row.amount;
      }
    }

    const methodBreakdownDollars: Record<string, number> = {};
    for (const [method, cents] of Object.entries(methodBreakdown)) {
      methodBreakdownDollars[method] = cents / 100;
    }

    return {
      totalRevenue: totalRevenueCents / 100,
      outstandingBalance: outstandingBalanceCents / 100,
      methodBreakdown: methodBreakdownDollars,
      registrationCount: activeRegs.length,
      paidCount,
      averageRevenuePerCompetitor:
        activeRegs.length > 0
          ? Math.round((totalRevenueCents / activeRegs.length)) / 100
          : 0,
    };
  },
});

/**
 * Per-registration outstanding balances for the analytics dashboard. Sorted
 * by balance descending. Zero-or-negative balances are excluded.
 */
export const getOutstanding = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    const items: Array<{
      registrationId: Id<"competitionRegistrations">;
      userId: Id<"users">;
      displayName: string | null;
      username: string | null;
      competitorNumber: number | null;
      amountOwed: number;
      amountPaid: number;
      balance: number;
    }> = [];

    for (const reg of regs) {
      if (reg.cancelled || reg.amountOwed <= 0) continue;
      const rows = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      const paidCents = rows.reduce((sum, p) => sum + p.amount, 0);
      const balanceCents = reg.amountOwed - paidCents;
      if (balanceCents <= 0) continue;

      const user = await ctx.db.get(reg.userId);
      items.push({
        registrationId: reg._id,
        userId: reg.userId,
        displayName: user?.displayName ?? null,
        username: user?.username ?? null,
        competitorNumber: reg.competitorNumber ?? null,
        amountOwed: reg.amountOwed / 100,
        amountPaid: paidCents / 100,
        balance: balanceCents / 100,
      });
    }

    items.sort((a, b) => b.balance - a.balance);
    return items;
  },
});

/**
 * Filtered payment log for the analytics dashboard. Filters by method and a
 * `[dateFrom, dateTo]` window (epoch-ms inclusive). Results are newest-first
 * and enriched with competitor + processor display names.
 */
export const getPaymentLog = query({
  args: {
    competitionId: v.id("competitions"),
    method: v.optional(paymentMethod),
    dateFromMs: v.optional(v.number()),
    dateToMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const activeRegs = regs.filter((r) => !r.cancelled);

    const entries: Array<{
      id: Id<"payments">;
      amount: number;
      method: Doc<"payments">["method"];
      note: string | null;
      stripePaymentIntentId: string | null;
      createdAt: number;
      competitorName: string | null;
      competitorNumber: number | null;
      processedByName: string | null;
    }> = [];

    for (const reg of activeRegs) {
      const rows = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      for (const row of rows) {
        if (args.method && row.method !== args.method) continue;
        if (args.dateFromMs !== undefined && row.createdAt < args.dateFromMs)
          continue;
        if (args.dateToMs !== undefined && row.createdAt > args.dateToMs)
          continue;
        const user = await ctx.db.get(reg.userId);
        const processedByUser = row.processedBy
          ? await ctx.db.get(row.processedBy)
          : null;
        entries.push({
          id: row._id,
          amount: row.amount / 100,
          method: row.method,
          note: row.note ?? null,
          stripePaymentIntentId: row.stripePaymentIntentId ?? null,
          createdAt: row.createdAt,
          competitorName: user?.displayName ?? null,
          competitorNumber: reg.competitorNumber ?? null,
          processedByName: processedByUser?.displayName ?? null,
        });
      }
    }

    entries.sort((a, b) => b.createdAt - a.createdAt);
    return entries;
  },
});

/**
 * Connect onboarding snapshot stored on the competition. The action
 * `stripeActions.refreshConnectStatus` is what queries Stripe and patches the
 * persisted fields; this query is a synchronous read of that state.
 *
 * The "Record" suffix distinguishes this from the legacy tRPC `getConnectStatus`
 * which actually called Stripe synchronously inside a `query`.
 */
export const getConnectStatusRecord = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const { competition } = await requireCompOrgRole(ctx, args.competitionId);
    return {
      connected: !!competition.stripeAccountId,
      onboardingComplete: competition.stripeOnboardingComplete,
      stripeAccountId: competition.stripeAccountId ?? null,
    };
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Record an off-platform payment (cash, check, other). Staff-only. The amount
 * is provided as a dollar string for symmetry with the existing UI and is
 * converted to integer cents before storage.
 */
export const recordManual = mutation({
  args: {
    registrationId: v.id("competitionRegistrations"),
    amount: v.string(),
    method: v.union(
      v.literal("cash"),
      v.literal("check"),
      v.literal("other"),
    ),
    note: v.optional(v.string()),
    entryId: v.optional(v.id("entries")),
  },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");

    const { user } = await requireCompStaffRole(
      ctx,
      reg.competitionId,
      ["registration"],
    );

    const cents = dollarsToCents(args.amount);
    if (!Number.isFinite(cents)) badRequest("Invalid amount");

    const id = await ctx.db.insert("payments", {
      registrationId: args.registrationId,
      amount: cents,
      method: args.method,
      note: args.note,
      entryId: args.entryId,
      processedBy: user._id,
      createdAt: Date.now(),
    });
    const payment = await ctx.db.get(id);
    if (!payment) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Payment insert failed",
      });
    }
    return payment;
  },
});

/**
 * Record a refund as a negative-amount payment row. The legacy router
 * accepted a positive dollar string and negated; we keep that interface so
 * the UI is unchanged.
 */
export const recordRefund = mutation({
  args: {
    registrationId: v.id("competitionRegistrations"),
    amount: v.string(),
    method: paymentMethod,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");

    const { user } = await requireCompStaffRole(
      ctx,
      reg.competitionId,
      ["registration"],
    );

    const raw = args.amount.replace(/^-/, "");
    const cents = dollarsToCents(raw);
    if (!Number.isFinite(cents)) badRequest("Invalid amount");

    const id = await ctx.db.insert("payments", {
      registrationId: args.registrationId,
      amount: -cents,
      method: args.method,
      note: args.note ?? "Refund",
      processedBy: user._id,
      createdAt: Date.now(),
    });
    const payment = await ctx.db.get(id);
    if (!payment) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Refund insert failed",
      });
    }
    return payment;
  },
});

/**
 * Idempotent webhook fulfillment for a Stripe Checkout Session. Called from
 * the Next.js `/api/stripe/webhook` route after Stripe-signature
 * verification.
 *
 * Idempotency:
 * - If a payment row already exists for `checkoutSessionId`, return it
 *   unchanged (Stripe retries the same event).
 * - Otherwise, if a row exists for `paymentIntentId` (e.g., a prior partial
 *   record from a different code path), backfill the checkout session id
 *   onto it and return.
 * - Only when neither exists do we insert a new row.
 *
 * The Checkout Session's metadata carries the registration ids the session
 * was paying for, mirroring what the legacy `createCheckoutSession` wrote.
 * For each registration we mark `paidConfirmed` true; we never edit
 * `amountOwed` here.
 */
export const fulfillCheckoutSession = internalMutation({
  args: {
    checkoutSessionId: v.string(),
    paymentIntentId: v.optional(v.string()),
    amountTotal: v.number(), // cents from Stripe `amount_total`
    registrationIds: v.array(v.id("competitionRegistrations")),
  },
  handler: async (ctx, args) => {
    const pending = await findPendingCheckoutSession(
      ctx,
      args.checkoutSessionId,
      args.paymentIntentId,
    );
    const registrationIds =
      pending && pending.registrationIds.length > 0
        ? pending.registrationIds
        : args.registrationIds;

    if (registrationIds.length === 0) {
      return { status: "skipped", reason: "no_registration_ids" } as const;
    }

    const bySession = await ctx.db
      .query("payments")
      .withIndex("by_stripe_checkout_session", (q) =>
        q.eq("stripeCheckoutSessionId", args.checkoutSessionId),
      )
      .unique();
    if (bySession) {
      await markCheckoutSessionFulfilled(
        ctx,
        pending,
        bySession._id,
        args.paymentIntentId,
      );
      return { status: "already_fulfilled", paymentId: bySession._id } as const;
    }

    if (args.paymentIntentId) {
      const byIntent = await ctx.db
        .query("payments")
        .withIndex("by_stripe_payment_intent", (q) =>
          q.eq("stripePaymentIntentId", args.paymentIntentId),
        )
        .unique();
      if (byIntent) {
        await ctx.db.patch(byIntent._id, {
          stripeCheckoutSessionId: args.checkoutSessionId,
        });
        await markRegistrationsPaid(ctx, registrationIds);
        await markCheckoutSessionFulfilled(
          ctx,
          pending,
          byIntent._id,
          args.paymentIntentId,
        );
        return {
          status: "linked_existing_intent",
          paymentId: byIntent._id,
        } as const;
      }
    }

    // Brand new fulfillment — insert one online payment row. When the session
    // covers multiple registrations, attach the row to the first one (the
    // legacy implementation made the same choice) and mark all of them paid.
    const primaryId = registrationIds[0]!;
    const primaryReg = await ctx.db.get(primaryId);
    if (!primaryReg) notFound("Registration not found");

    const paymentId = await ctx.db.insert("payments", {
      registrationId: primaryId,
      amount: args.amountTotal,
      method: "online",
      stripeCheckoutSessionId: args.checkoutSessionId,
      stripePaymentIntentId: args.paymentIntentId,
      createdAt: Date.now(),
    });

    await markRegistrationsPaid(ctx, registrationIds);
    await markCheckoutSessionFulfilled(
      ctx,
      pending,
      paymentId,
      args.paymentIntentId,
    );

    return { status: "fulfilled", paymentId } as const;
  },
});

/**
 * Persist the Checkout Session correlation immediately after Stripe creates
 * the hosted session, before returning its URL to the browser. Webhook
 * fulfillment can then recover the authorized registration ids even if Stripe
 * metadata is missing or malformed.
 */
export const persistPendingCheckoutSession = internalMutation({
  args: {
    checkoutSessionId: v.string(),
    paymentIntentId: v.optional(v.string()),
    competitionId: v.id("competitions"),
    registrationIds: v.array(v.id("competitionRegistrations")),
    callerUserId: v.id("users"),
    amountTotal: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.registrationIds.length === 0) {
      badRequest("registrationIds is required");
    }

    const now = Date.now();
    const existing = await findPendingCheckoutSession(
      ctx,
      args.checkoutSessionId,
      args.paymentIntentId,
    );

    const patch = {
      stripeCheckoutSessionId: args.checkoutSessionId,
      stripePaymentIntentId: args.paymentIntentId,
      competitionId: args.competitionId,
      registrationIds: args.registrationIds,
      callerUserId: args.callerUserId,
      amountTotal: args.amountTotal,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("stripeCheckoutSessions", {
      ...patch,
      status: "pending",
      createdAt: now,
    });
    return await ctx.db.get(id);
  },
});

/**
 * Internal mutation that updates the cached Stripe Connect status on a
 * competition. Called by the `refreshConnectStatus` action — actions cannot
 * write the database directly.
 */
export const persistConnectStatus = internalMutation({
  args: {
    competitionId: v.id("competitions"),
    stripeAccountId: v.optional(v.string()),
    onboardingComplete: v.boolean(),
  },
  handler: async (ctx, args) => {
    const patch: Partial<Doc<"competitions">> = {
      stripeOnboardingComplete: args.onboardingComplete,
      updatedAt: Date.now(),
    };
    if (args.stripeAccountId !== undefined) {
      patch.stripeAccountId = args.stripeAccountId;
    }
    await ctx.db.patch(args.competitionId, patch);
    return await ctx.db.get(args.competitionId);
  },
});

/**
 * Internal mutation to read the data the Stripe Checkout action needs without
 * exposing it as a public query. The action then calls Stripe and reports the
 * resulting URL back to the caller — Stripe-side work cannot happen inside
 * a mutation transaction.
 */
export const loadCheckoutData = internalMutation({
  args: {
    registrationIds: v.array(v.id("competitionRegistrations")),
    callerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.registrationIds.length === 0) {
      badRequest("registrationIds is required");
    }

    const regs: Doc<"competitionRegistrations">[] = [];
    for (const id of args.registrationIds) {
      const reg = await ctx.db.get(id);
      if (!reg) notFound(`Registration ${id} not found`);
      regs.push(reg);
    }
    const competitionId = regs[0]!.competitionId;
    if (!regs.every((r) => r.competitionId === competitionId)) {
      badRequest("All registrations must be for the same competition");
    }
    const comp = await ctx.db.get(competitionId);
    if (!comp) notFound("Competition not found");

    if (!comp.stripeAccountId || !comp.stripeOnboardingComplete) {
      badRequest("Competition has not set up online payments");
    }

    const ownsEveryRegistration = regs.every(
      (reg) => reg.userId === args.callerUserId,
    );
    if (!ownsEveryRegistration) {
      const canManageCheckout = await callerCanManageCheckout(
        ctx,
        comp,
        args.callerUserId,
      );
      if (!canManageCheckout) {
        forbidden("Cannot check out registrations for another user");
      }
    }

    const totalCents = regs.reduce((sum, r) => sum + r.amountOwed, 0);
    if (totalCents <= 0) badRequest("Nothing to pay");

    return {
      competitionName: comp.name,
      competitionId: comp._id,
      stripeAccountId: comp.stripeAccountId,
      totalCents,
      registrationIds: regs.map((r) => r._id) as Id<"competitionRegistrations">[],
      callerUserId: args.callerUserId,
    };
  },
});
