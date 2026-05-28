"use node";

import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  STRIPE_CHECKOUT_ALLOWED_ORIGINS_ENV,
  validateStripeCheckoutReturnUrls,
} from "./stripeReturnUrls";

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

function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new ConvexError({
      code: "INTERNAL",
      message: "Stripe webhook is not configured (STRIPE_WEBHOOK_SECRET missing)",
    });
  }
  return webhookSecret;
}

function parseRegistrationIds(
  metadata: Stripe.Metadata | null | undefined,
): Id<"competitionRegistrations">[] {
  const raw = metadata?.registrationIds;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as Id<"competitionRegistrations">[];
}

type WebhookResult =
  | {
      ok: true;
      status: 200;
      body: { received: true; skipped?: "no_registrations" };
    }
  | { ok: false; status: 400 | 503; message: string };

/**
 * Verify a raw Stripe webhook payload and fulfill completed checkout sessions.
 *
 * This is an internal Node action so the public HTTP surface is only the
 * `/stripe/webhook` HTTP action in `convex/http.ts`, while Stripe SDK work can
 * still run in Node.js. External callers cannot directly run the fulfillment
 * mutation; they would need a valid Stripe signature for this raw payload.
 */
export const fulfillStripeWebhook = internalAction({
  args: {
    payload: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args): Promise<WebhookResult> => {
    let stripe: Stripe;
    let webhookSecret: string;
    try {
      stripe = getStripe();
      webhookSecret = getStripeWebhookSecret();
    } catch {
      return {
        ok: false,
        status: 503,
        message: "Stripe webhook not configured",
      };
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        args.payload,
        args.signature,
        webhookSecret,
      );
    } catch {
      return { ok: false, status: 400, message: "Invalid signature" };
    }

    if (event.type !== "checkout.session.completed") {
      return { ok: true, status: 200, body: { received: true } };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const registrationIds = parseRegistrationIds(session.metadata);

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined);

    const fulfillment = await ctx.runMutation(
      internal.competitions.payments.fulfillCheckoutSession,
      {
        checkoutSessionId: session.id,
        paymentIntentId,
        amountTotal: session.amount_total ?? 0,
        registrationIds,
      },
    );

    if (fulfillment.status === "skipped") {
      return {
        ok: true,
        status: 200,
        body: { received: true, skipped: "no_registrations" },
      };
    }

    return { ok: true, status: 200, body: { received: true } };
  },
});

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

    const returnUrls = validateStripeCheckoutReturnUrls(
      { successUrl: args.successUrl, cancelUrl: args.cancelUrl },
      process.env[STRIPE_CHECKOUT_ALLOWED_ORIGINS_ENV],
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
      success_url: returnUrls.successUrl,
      cancel_url: returnUrls.cancelUrl,
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
