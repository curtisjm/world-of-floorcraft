import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const payload = await request.text();
    const result = await ctx.runAction(
      internal.competitions.stripeActions.fulfillStripeWebhook,
      { payload, signature },
    );

    if (!result.ok) {
      return new Response(result.message, { status: result.status });
    }

    return Response.json(result.body, { status: result.status });
  }),
});

export default http;
