import { ConvexError } from "convex/values";

export const STRIPE_CHECKOUT_ALLOWED_ORIGINS_ENV =
  "STRIPE_CHECKOUT_ALLOWED_ORIGINS";

type CheckoutReturnUrlField = "successUrl" | "cancelUrl";

type StripeCheckoutReturnUrls = Record<CheckoutReturnUrlField, string>;

function isHttpUrl(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}

function throwInternal(message: string): never {
  throw new ConvexError({ code: "INTERNAL", message });
}

function throwBadRequest(message: string): never {
  throw new ConvexError({ code: "BAD_REQUEST", message });
}

function throwForbidden(message: string): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

function parseAllowedCheckoutOrigins(rawConfig: string | undefined): Set<string> {
  const rawOrigins = rawConfig
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (!rawOrigins || rawOrigins.length === 0) {
    throwInternal(
      `Stripe checkout return URL allowlist is not configured (${STRIPE_CHECKOUT_ALLOWED_ORIGINS_ENV} missing)`,
    );
  }

  return new Set(
    rawOrigins.map((origin) => {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throwInternal(
          `Stripe checkout return URL allowlist contains an invalid origin: ${origin}`,
        );
      }

      if (!isHttpUrl(url) || url.origin === "null") {
        throwInternal(
          `Stripe checkout return URL allowlist contains a non-HTTP(S) origin: ${origin}`,
        );
      }

      return url.origin;
    }),
  );
}

function normalizeCheckoutReturnUrl(
  field: CheckoutReturnUrlField,
  value: string,
  allowedOrigins: Set<string>,
): string {
  if (value.trim().length === 0) {
    throwBadRequest(`${field} is required`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throwBadRequest(`${field} must be an absolute URL`);
  }

  if (!isHttpUrl(url) || url.origin === "null") {
    throwBadRequest(`${field} must be an HTTP(S) URL`);
  }

  if (!allowedOrigins.has(url.origin)) {
    throwForbidden(`${field} origin is not allowed`);
  }

  return url.toString();
}

export function validateStripeCheckoutReturnUrls(
  urls: StripeCheckoutReturnUrls,
  allowedOriginsConfig: string | undefined,
): StripeCheckoutReturnUrls {
  const allowedOrigins = parseAllowedCheckoutOrigins(allowedOriginsConfig);

  return {
    successUrl: normalizeCheckoutReturnUrl(
      "successUrl",
      urls.successUrl,
      allowedOrigins,
    ),
    cancelUrl: normalizeCheckoutReturnUrl(
      "cancelUrl",
      urls.cancelUrl,
      allowedOrigins,
    ),
  };
}
