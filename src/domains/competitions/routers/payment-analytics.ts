import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitionRegistrations,
  payments,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { requireCompOrgRole } from "@competitions/lib/auth";

export const paymentAnalyticsRouter = router({
  // ── Financial summary ───────────────────────────────────────────
  getSummary: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const regs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      // Get all payments for these registrations
      const allPayments: { id: number; registrationId: number; amount: string; method: string; createdAt: Date; note: string | null; stripePaymentIntentId: string | null; processedBy: string | null; entryId: number | null }[] = [];
      for (const reg of regs) {
        const regPayments = await db.query.payments.findMany({
          where: eq(payments.registrationId, reg.id),
        });
        allPayments.push(...regPayments);
      }

      const totalRevenue = allPayments.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      );

      const outstandingBalance = regs.reduce((sum, reg) => {
        const owed = parseFloat(reg.amountOwed);
        const regPayments = allPayments.filter(
          (p) => p.registrationId === reg.id,
        );
        const paid = regPayments.reduce(
          (s, p) => s + parseFloat(p.amount),
          0,
        );
        const balance = owed - paid;
        return sum + (balance > 0 ? balance : 0);
      }, 0);

      // Payment method breakdown
      const methodBreakdown: Record<string, number> = {};
      for (const p of allPayments) {
        methodBreakdown[p.method] = (methodBreakdown[p.method] ?? 0) + parseFloat(p.amount);
      }

      const paidCount = regs.filter((r) => {
        const regPayments = allPayments.filter(
          (p) => p.registrationId === r.id,
        );
        const paid = regPayments.reduce(
          (s, p) => s + parseFloat(p.amount),
          0,
        );
        return paid >= parseFloat(r.amountOwed) && parseFloat(r.amountOwed) > 0;
      }).length;

      return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
        methodBreakdown,
        registrationCount: regs.length,
        paidCount,
        averageRevenuePerCompetitor:
          regs.length > 0
            ? Math.round((totalRevenue / regs.length) * 100) / 100
            : 0,
      };
    }),

  // ── Full payment log ────────────────────────────────────────────
  getPaymentLog: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        method: z.enum(["online", "cash", "check", "other"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const regs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      const allPayments = [];
      for (const reg of regs) {
        const regPayments = await db.query.payments.findMany({
          where: eq(payments.registrationId, reg.id),
        });
        for (const p of regPayments) {
          allPayments.push({ ...p, reg });
        }
      }

      // Apply filters
      let filtered = allPayments;
      if (input.method) {
        filtered = filtered.filter((p) => p.method === input.method);
      }
      if (input.dateFrom) {
        const from = new Date(input.dateFrom);
        filtered = filtered.filter((p) => p.createdAt >= from);
      }
      if (input.dateTo) {
        const to = new Date(input.dateTo);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter((p) => p.createdAt <= to);
      }

      // Sort by date descending
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Enrich with names
      const enriched = await Promise.all(
        filtered.map(async (p) => {
          const user = await db.query.users.findFirst({
            where: eq(users.id, p.reg.userId),
          });
          const processedByUser = p.processedBy
            ? await db.query.users.findFirst({ where: eq(users.id, p.processedBy) })
            : null;

          return {
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.method,
            note: p.note,
            stripePaymentIntentId: p.stripePaymentIntentId,
            createdAt: p.createdAt,
            competitorName: user?.displayName ?? null,
            competitorNumber: p.reg.competitorNumber,
            processedByName: processedByUser?.displayName ?? null,
          };
        }),
      );

      return enriched;
    }),

  // ── Outstanding balances ────────────────────────────────────────
  getOutstanding: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const regs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, input.competitionId),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      const outstanding = [];
      for (const reg of regs) {
        const owed = parseFloat(reg.amountOwed);
        if (owed <= 0) continue;

        const regPayments = await db.query.payments.findMany({
          where: eq(payments.registrationId, reg.id),
        });
        const paid = regPayments.reduce(
          (sum, p) => sum + parseFloat(p.amount),
          0,
        );
        const balance = owed - paid;
        if (balance <= 0) continue;

        const user = await db.query.users.findFirst({
          where: eq(users.id, reg.userId),
        });

        outstanding.push({
          registrationId: reg.id,
          userId: reg.userId,
          displayName: user?.displayName ?? null,
          username: user?.username ?? null,
          competitorNumber: reg.competitorNumber,
          amountOwed: owed,
          amountPaid: paid,
          balance: Math.round(balance * 100) / 100,
        });
      }

      // Sort by balance descending
      outstanding.sort((a, b) => b.balance - a.balance);

      return outstanding;
    }),
});
