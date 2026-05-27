import Stripe from "stripe";
import { fetchMutation } from "convex/nextjs";
import type { FunctionReference } from "convex/server";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/**
 * `fetchMutation` is typed to accept public references only. Cast the
 * internal fulfillment mutation through the public-mutation type so the call
 * type-checks. The runtime accepts any function reference; the route is
 * gated by Stripe signature verification above, so unauthenticated callers
 * cannot reach this mutation.
 */
const fulfillRef =
  internal.competitions.payments.fulfillCheckoutSession as unknown as FunctionReference<
    "mutation",
    "public",
    {
      checkoutSessionId: string;
      paymentIntentId?: string;
      amountTotal: number;
      registrationIds: Id<"competitionRegistrations">[];
    },
    unknown
  >;

/**
 * Stripe webhook fulfillment endpoint (Task 11 of the Convex migration).
 *
 * Stripe POSTs verified payment events here after a hosted Checkout Session
 * completes. We verify the signature with the official Stripe SDK and then
 * forward the verified event payload to the internal Convex mutation
 * `fulfillCheckoutSession`, which is idempotent by Checkout Session id and
 * PaymentIntent id. Replays from Stripe (or our own retries) never duplicate
 * payment rows or re-mark a registration paid.
 *
 * The route must run in Node.js because the Stripe SDK uses Node primitives,
 * and we must read the raw request body before parsing — Next.js' default
 * JSON parsing would invalidate the signature.
 */

export const runtime = "nodejs";
// Stripe's signature verifies the raw bytes; do not cache, parse, or modify
// the body upstream.
export const dynamic = "force-dynamic";

function getStripeOrNull(): {
  stripe: Stripe;
  webhookSecret: string;
} | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return null;
  return { stripe: new Stripe(secretKey), webhookSecret };
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

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const config = getStripeOrNull();
  if (!config) {
    return new Response("Stripe webhook not configured", { status: 503 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = config.stripe.webhooks.constructEvent(
      body,
      signature,
      config.webhookSecret,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const registrationIds = parseRegistrationIds(session.metadata);

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined);

    await fetchMutation(fulfillRef, {
      checkoutSessionId: session.id,
      paymentIntentId,
      amountTotal: session.amount_total ?? 0,
      registrationIds,
    });
  }

  return Response.json({ received: true });
}
