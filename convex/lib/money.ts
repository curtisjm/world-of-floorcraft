/**
 * Money helpers. Monetary amounts are stored in Convex as integer cents to
 * avoid floating-point drift; convert to/from display dollars at the edges.
 */

/** Convert a dollar amount (string or number) to integer cents. */
export function dollarsToCents(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid money value");
  return Math.round(parsed * 100);
}

/** Format integer cents as a fixed two-decimal dollar string (no symbol). */
export function centsToDollarString(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Invalid cents value");
  return (cents / 100).toFixed(2);
}
