/**
 * Money helpers. Monetary amounts are stored in Convex as integer cents to
 * avoid floating-point drift; convert to/from display dollars at the edges.
 */

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const MONEY_DECIMAL_RE = /^(-?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;

/** Convert a dollar amount (string or number) to integer cents. */
export function dollarsToCents(value: string | number): number {
  const decimal =
    typeof value === "number" ? numberToDecimalString(value) : value;
  const match = MONEY_DECIMAL_RE.exec(decimal);
  if (!match) throw new Error("Invalid money value");

  const [, sign, wholePart = "0"] = match;
  const fractionalPart = match[3] ?? match[4] ?? "";
  const paddedFractional = fractionalPart.padEnd(3, "0");

  let cents =
    BigInt(wholePart) * BigInt(100) +
    BigInt(paddedFractional.slice(0, 2));

  if (Number(paddedFractional[2]) >= 5) cents += BigInt(1);
  if (sign === "-") cents = -cents;

  if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) {
    throw new Error("Money value exceeds safe integer cents");
  }

  return Number(cents);
}

function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Invalid money value");

  const rendered = value.toString();
  if (!/[eE]/.test(rendered)) return rendered;

  return expandExponentialDecimal(rendered);
}

function expandExponentialDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(value);
  if (!match) throw new Error("Invalid money value");

  const [, sign, whole, fractional = "", exponentRaw] = match;
  const exponent = Number(exponentRaw);
  const digits = whole + fractional;
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  }

  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

/** Format integer cents as a fixed two-decimal dollar string (no symbol). */
export function centsToDollarString(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Invalid cents value");
  return (cents / 100).toFixed(2);
}
