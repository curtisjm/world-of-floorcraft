import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCompOrgRole } from "../lib/permissions";
import { paymentMethod } from "../schema";

/**
 * Read-only payment analytics — totals, ledger, and outstanding balances.
 * Ported from `src/domains/competitions/routers/payment-analytics.ts` minus
 * the Stripe-derived analytics; those follow Task 11. Money values are stored
 * as integer cents in the new schema, so totals do not need the parseFloat
 * round-trip the tRPC version performs.
 */

export const getSummary = query({
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

    type PaymentWithReg = Doc<"payments"> & {
      registrationId: Id<"competitionRegistrations">;
    };
    const allPayments: PaymentWithReg[] = [];
    for (const reg of activeRegs) {
      const ps = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      allPayments.push(...ps.map((p) => ({ ...p, registrationId: reg._id })));
    }

    const totalRevenue = allPayments.reduce((s, p) => s + p.amount, 0);

    let outstandingBalance = 0;
    for (const reg of activeRegs) {
      const owed = reg.amountOwed;
      const paid = allPayments
        .filter((p) => p.registrationId === reg._id)
        .reduce((s, p) => s + p.amount, 0);
      const balance = owed - paid;
      if (balance > 0) outstandingBalance += balance;
    }

    const methodBreakdown: Record<string, number> = {};
    for (const p of allPayments) {
      methodBreakdown[p.method] = (methodBreakdown[p.method] ?? 0) + p.amount;
    }

    const paidCount = activeRegs.filter((r) => {
      const paid = allPayments
        .filter((p) => p.registrationId === r._id)
        .reduce((s, p) => s + p.amount, 0);
      return paid >= r.amountOwed && r.amountOwed > 0;
    }).length;

    return {
      totalRevenue,
      outstandingBalance,
      methodBreakdown,
      registrationCount: activeRegs.length,
      paidCount,
      averageRevenuePerCompetitor:
        activeRegs.length > 0
          ? Math.round(totalRevenue / activeRegs.length)
          : 0,
    };
  },
});

export const getPaymentLog = query({
  args: {
    competitionId: v.id("competitions"),
    method: v.optional(paymentMethod),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
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

    const rows = [];
    for (const reg of activeRegs) {
      const ps = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      for (const p of ps) rows.push({ ...p, reg });
    }

    let filtered = rows;
    if (args.method) {
      filtered = filtered.filter((p) => p.method === args.method);
    }
    if (args.dateFrom) {
      const from = new Date(args.dateFrom).getTime();
      filtered = filtered.filter((p) => p.createdAt >= from);
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo);
      to.setHours(23, 59, 59, 999);
      const toMs = to.getTime();
      filtered = filtered.filter((p) => p.createdAt <= toMs);
    }
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      filtered.map(async (p) => {
        const user = await ctx.db.get(p.reg.userId);
        const processedByUser = p.processedBy
          ? await ctx.db.get(p.processedBy)
          : null;
        return {
          id: p._id,
          amount: p.amount,
          method: p.method,
          note: p.note ?? null,
          stripePaymentIntentId: p.stripePaymentIntentId ?? null,
          createdAt: p.createdAt,
          competitorName: user?.displayName ?? null,
          competitorNumber: p.reg.competitorNumber ?? null,
          processedByName: processedByUser?.displayName ?? null,
        };
      }),
    );
  },
});

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
    const activeRegs = regs.filter((r) => !r.cancelled);

    const outstanding = [];
    for (const reg of activeRegs) {
      if (reg.amountOwed <= 0) continue;
      const ps = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      const paid = ps.reduce((s, p) => s + p.amount, 0);
      const balance = reg.amountOwed - paid;
      if (balance <= 0) continue;
      const user = await ctx.db.get(reg.userId);
      outstanding.push({
        registrationId: reg._id,
        userId: reg.userId,
        displayName: user?.displayName ?? null,
        username: user?.username ?? null,
        competitorNumber: reg.competitorNumber ?? null,
        amountOwed: reg.amountOwed,
        amountPaid: paid,
        balance,
      });
    }
    outstanding.sort((a, b) => b.balance - a.balance);
    return outstanding;
  },
});
