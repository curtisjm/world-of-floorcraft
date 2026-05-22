/**
 * Time helpers. Timestamps are epoch milliseconds throughout the schema.
 *
 * Note: `now()` and `isFresh()` read the wall clock. Do not call them inside
 * a cacheable Convex query for freshness logic — pass time in as an argument
 * instead, per the migration's performance guardrails. They are safe in
 * mutations, actions, and scheduled functions.
 */

/** Current time as epoch milliseconds. */
export function now(): number {
  return Date.now();
}

/** Epoch milliseconds `minutes` from now. */
export function minutesFromNow(minutes: number): number {
  return now() + minutes * 60_000;
}

/** True when `timestamp` is within `ttlMs` of the current time. */
export function isFresh(timestamp: number, ttlMs: number): boolean {
  return now() - timestamp <= ttlMs;
}
