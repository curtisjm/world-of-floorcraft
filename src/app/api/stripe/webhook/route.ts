/**
 * Compatibility endpoint for Stripe webhook deliveries configured against the
 * Next.js app. Fulfillment now happens inside Convex: the Convex HTTP action
 * verifies the Stripe signature, then calls the internal mutation from a
 * server-only Convex context.
 *
 * Keep the raw body unchanged while proxying, because Stripe signatures cover
 * the exact request payload.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_WEBHOOK_PATH = "/stripe/webhook";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function getConvexSiteUrl(): string | null {
  const explicit =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    process.env.CONVEX_HTTP_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;

  try {
    const url = new URL(convexUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const convexSiteUrl = getConvexSiteUrl();
  if (!convexSiteUrl) {
    return new Response("Convex webhook URL not configured", { status: 503 });
  }

  const body = await request.text();
  const contentType = request.headers.get("content-type") ?? "application/json";

  let response: Response;
  try {
    response = await fetch(`${convexSiteUrl}${STRIPE_WEBHOOK_PATH}`, {
      method: "POST",
      body,
      headers: {
        "content-type": contentType,
        "stripe-signature": signature,
      },
    });
  } catch {
    return new Response("Convex webhook unavailable", { status: 502 });
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "text/plain",
    },
  });
}
