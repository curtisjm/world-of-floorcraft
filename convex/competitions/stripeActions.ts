"use node";

import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";

/**
 * Stripe-facing Convex actions. These run in Node.js because the official
 * `stripe` SDK uses Node primitives (and the secret key only lives on the
 * Convex deployment).
 *
 * Database writes happen through internal mutations in
 * `convex/competitions/payments.ts` and `convex/competitions/registration.ts`;
 * actions cannot transactionally write the database.
 */

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ConvexError({
      code: "INTERNAL",
      message: "Stripe is not configured (STRIPE_SECRET_KEY missing)",
    });
  }
  return new Stripe(key);
}

/**
 * Start a hosted Stripe Checkout Session for a set of registrations on a
 * single competition. The action validates the registrations through an
 * internal mutation, then calls Stripe and returns the session URL. The
 * UI redirects the user to that URL; Stripe redirects back to the
 * supplied `successUrl` / `cancelUrl` after the payment.
 */
export const createCheckoutSession = action({
  args: {
    registrationIds: v.array(v.id("competitionRegistrations")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sign in required",
      });
    }

    const data = await ctx.runMutation(
      internal.competitions.payments.loadCheckoutData,
      {
        registrationIds: args.registrationIds,
        callerUserId: me._id,
      },
    );

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${data.competitionName} — Registration` },
            unit_amount: data.totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        competitionId: String(data.competitionId),
        registrationIds: data.registrationIds.join(","),
      },
      payment_intent_data: {
        transfer_data: { destination: data.stripeAccountId },
      },
    });

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined);

    await ctx.runMutation(
      internal.competitions.payments.persistPendingCheckoutSession,
      {
        checkoutSessionId: session.id,
        paymentIntentId,
        competitionId: data.competitionId,
        registrationIds: data.registrationIds,
        callerUserId: data.callerUserId,
        amountTotal: data.totalCents,
      },
    );

    return { url: session.url };
  },
});

/**
 * Create (or reuse) a Stripe Express Connect account for a competition and
 * return an onboarding link. The org admin/owner is allowed; the permission
 * check happens in the underlying mutation through the standard helper.
 */
export const createConnectAccount = action({
  args: {
    competitionId: v.id("competitions"),
    refreshUrl: v.string(),
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const stripe = getStripe();

    const status = await ctx.runQuery(
      api.competitions.payments.getConnectStatusRecord,
      { competitionId: args.competitionId },
    );

    let accountId = status.stripeAccountId ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      await ctx.runMutation(
        internal.competitions.payments.persistConnectStatus,
        {
          competitionId: args.competitionId,
          stripeAccountId: accountId,
          onboardingComplete: false,
        },
      );
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: "account_onboarding",
    });
    return { url: link.url };
  },
});

/**
 * Query Stripe for the live Connect account state and persist the
 * `charges_enabled && payouts_enabled` summary onto the competition.
 */
export const refreshConnectStatus = action({
  args: { competitionId: v.id("competitions") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    connected: boolean;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  }> => {
    const status = await ctx.runQuery(
      api.competitions.payments.getConnectStatusRecord,
      { competitionId: args.competitionId },
    );
    if (!status.stripeAccountId) {
      return {
        connected: false,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(status.stripeAccountId);
    const onboardingComplete = Boolean(
      account.charges_enabled && account.payouts_enabled,
    );

    if (onboardingComplete !== status.onboardingComplete) {
      await ctx.runMutation(
        internal.competitions.payments.persistConnectStatus,
        {
          competitionId: args.competitionId,
          onboardingComplete,
        },
      );
    }

    return {
      connected: true,
      onboardingComplete,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
    };
  },
});
