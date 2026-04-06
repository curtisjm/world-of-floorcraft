import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionRegistrations,
  payments,
} from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";
import { requireCompOrgRole, requireCompStaffRole } from "@competitions/lib/auth";
import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe not configured" });
  return new Stripe(key);
}

export const paymentRouter = router({
  listByRegistration: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      // User can view their own or staff can view any
      if (reg.userId !== ctx.userId) {
        await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);
      }

      const paymentList = await db
        .select()
        .from(payments)
        .where(eq(payments.registrationId, input.registrationId))
        .orderBy(desc(payments.createdAt));

      return paymentList;
    }),

  summaryByCompetition: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const [summary] = await db
        .select({
          totalCollected: sql<string>`coalesce(sum(case when ${payments.amount} > 0 then ${payments.amount} else 0 end), 0)`,
          totalRefunded: sql<string>`coalesce(sum(case when ${payments.amount} < 0 then abs(${payments.amount}) else 0 end), 0)`,
          netCollected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
          totalOwed: sql<string>`coalesce(sum(${competitionRegistrations.amountOwed}), 0)`,
          registrationCount: sql<number>`count(distinct ${competitionRegistrations.id})::int`,
          onlineCount: sql<number>`count(case when ${payments.method} = 'online' then 1 end)::int`,
          cashCount: sql<number>`count(case when ${payments.method} = 'cash' then 1 end)::int`,
          checkCount: sql<number>`count(case when ${payments.method} = 'check' then 1 end)::int`,
          otherCount: sql<number>`count(case when ${payments.method} = 'other' then 1 end)::int`,
        })
        .from(competitionRegistrations)
        .leftJoin(payments, eq(payments.registrationId, competitionRegistrations.id))
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        );

      return summary;
    }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        registrationIds: z.number().array().min(1),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();

      // Load all registrations
      const regs = [];
      for (const id of input.registrationIds) {
        const reg = await db.query.competitionRegistrations.findFirst({
          where: eq(competitionRegistrations.id, id),
        });
        if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: `Registration ${id} not found` });
        regs.push(reg);
      }

      // All must be for the same competition
      const compId = regs[0]!.competitionId;
      if (!regs.every((r) => r.competitionId === compId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All registrations must be for the same competition" });
      }

      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, compId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      if (!comp.stripeAccountId || !comp.stripeOnboardingComplete) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Competition has not set up online payments" });
      }

      // Calculate total amount
      const totalCents = regs.reduce((sum, r) => sum + Math.round(parseFloat(r.amountOwed) * 100), 0);
      if (totalCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to pay" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `${comp.name} — Registration` },
              unit_amount: totalCents,
            },
            quantity: 1,
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          competitionId: String(comp.id),
          registrationIds: input.registrationIds.join(","),
        },
        payment_intent_data: {
          transfer_data: { destination: comp.stripeAccountId },
        },
      });

      return { url: session.url };
    }),

  recordManual: protectedProcedure
    .input(
      z.object({
        registrationId: z.number(),
        amount: z.string(),
        method: z.enum(["cash", "check", "other"]),
        note: z.string().optional(),
        entryId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      const [payment] = await db
        .insert(payments)
        .values({
          registrationId: input.registrationId,
          amount: input.amount,
          method: input.method,
          note: input.note,
          entryId: input.entryId,
          processedBy: ctx.userId,
        })
        .returning();

      return payment;
    }),

  recordRefund: protectedProcedure
    .input(
      z.object({
        registrationId: z.number(),
        amount: z.string(),
        method: z.enum(["online", "cash", "check", "other"]),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      // Store as negative amount
      const refundAmount = `-${input.amount.replace(/^-/, "")}`;

      const [payment] = await db
        .insert(payments)
        .values({
          registrationId: input.registrationId,
          amount: refundAmount,
          method: input.method,
          note: input.note ?? "Refund",
          processedBy: ctx.userId,
        })
        .returning();

      return payment;
    }),

  createConnectAccount: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        refreshUrl: z.string().url(),
        returnUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comp = await requireCompOrgRole(input.competitionId, ctx.userId);
      const stripe = getStripe();

      let accountId = comp.stripeAccountId;

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;

        await db
          .update(competitions)
          .set({ stripeAccountId: accountId, updatedAt: new Date() })
          .where(eq(competitions.id, input.competitionId));
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: "account_onboarding",
      });

      return { url: accountLink.url };
    }),

  getConnectStatus: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const comp = await requireCompOrgRole(input.competitionId, ctx.userId);

      if (!comp.stripeAccountId) {
        return { connected: false, onboardingComplete: false };
      }

      const stripe = getStripe();
      const account = await stripe.accounts.retrieve(comp.stripeAccountId);

      const onboardingComplete = account.charges_enabled && account.payouts_enabled;

      if (onboardingComplete && !comp.stripeOnboardingComplete) {
        await db
          .update(competitions)
          .set({ stripeOnboardingComplete: true, updatedAt: new Date() })
          .where(eq(competitions.id, input.competitionId));
      }

      return {
        connected: true,
        onboardingComplete: !!onboardingComplete,
        chargesEnabled: !!account.charges_enabled,
        payoutsEnabled: !!account.payouts_enabled,
      };
    }),
});
