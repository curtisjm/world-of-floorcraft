import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { validateStripeCheckoutReturnUrls } from "./stripeReturnUrls";

function expectConvexErrorCode(run: () => unknown, code: string) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
    return;
  }

  throw new Error(`Expected ConvexError with code ${code}`);
}

describe("stripe checkout return URL validation", () => {
  it("normalizes allowed return URLs", () => {
    expect(
      validateStripeCheckoutReturnUrls(
        {
          successUrl: "https://app.example.com/payments/success?session_id={CHECKOUT_SESSION_ID}",
          cancelUrl: "https://app.example.com/payments/cancel",
        },
        "https://app.example.com, http://localhost:3000",
      ),
    ).toEqual({
      successUrl:
        "https://app.example.com/payments/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://app.example.com/payments/cancel",
    });
  });

  it("rejects disallowed origins", () => {
    expectConvexErrorCode(
      () =>
        validateStripeCheckoutReturnUrls(
          {
            successUrl: "https://evil.example/payments/success",
            cancelUrl: "https://app.example.com/payments/cancel",
          },
          "https://app.example.com",
        ),
      "FORBIDDEN",
    );
  });

  it("rejects missing, malformed, and relative return URLs", () => {
    expectConvexErrorCode(
      () =>
        validateStripeCheckoutReturnUrls(
          {
            successUrl: "",
            cancelUrl: "https://app.example.com/payments/cancel",
          },
          "https://app.example.com",
        ),
      "BAD_REQUEST",
    );

    expectConvexErrorCode(
      () =>
        validateStripeCheckoutReturnUrls(
          {
            successUrl: "not a url",
            cancelUrl: "https://app.example.com/payments/cancel",
          },
          "https://app.example.com",
        ),
      "BAD_REQUEST",
    );

    expectConvexErrorCode(
      () =>
        validateStripeCheckoutReturnUrls(
          {
            successUrl: "/payments/success",
            cancelUrl: "https://app.example.com/payments/cancel",
          },
          "https://app.example.com",
        ),
      "BAD_REQUEST",
    );
  });

  it("rejects missing allowlist config", () => {
    expectConvexErrorCode(
      () =>
        validateStripeCheckoutReturnUrls(
          {
            successUrl: "https://app.example.com/payments/success",
            cancelUrl: "https://app.example.com/payments/cancel",
          },
          undefined,
        ),
      "INTERNAL",
    );
  });
});
