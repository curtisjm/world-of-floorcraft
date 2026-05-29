import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const AUTH_RATE_LIMIT = 5;
export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  judgeAuthFailures: {
    kind: "fixed window",
    rate: AUTH_RATE_LIMIT,
    period: AUTH_RATE_WINDOW_MS,
  },
});
