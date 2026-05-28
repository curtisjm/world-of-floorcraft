import { describe, expect, it } from "vitest";
import { centsToDollarString, dollarsToCents } from "./money";

describe("money helpers", () => {
  it("converts a dollar string to integer cents", () => {
    expect(dollarsToCents("12.34")).toBe(1234);
  });

  it("converts a dollar number to integer cents", () => {
    expect(dollarsToCents(12.34)).toBe(1234);
  });

  it("rounds sub-cent amounts to the nearest cent using exact decimal half-up rounding", () => {
    expect(dollarsToCents("1.005")).toBe(101);
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents("0.005")).toBe(1);
    expect(dollarsToCents(2.999)).toBe(300);
  });

  it("supports negative dollar amounts", () => {
    expect(dollarsToCents("-12.34")).toBe(-1234);
    expect(dollarsToCents("-1.005")).toBe(-101);
  });

  it("formats integer cents as a two-decimal dollar string", () => {
    expect(centsToDollarString(1234)).toBe("12.34");
    expect(centsToDollarString(0)).toBe("0.00");
    expect(centsToDollarString(5)).toBe("0.05");
  });

  it("round-trips dollars through cents", () => {
    expect(centsToDollarString(dollarsToCents("99.99"))).toBe("99.99");
  });

  it("rejects invalid money values", () => {
    expect(() => dollarsToCents("not-a-number")).toThrow();
    expect(() => dollarsToCents("")).toThrow();
    expect(() => dollarsToCents("12.3.4")).toThrow();
    expect(() => dollarsToCents("$12.34")).toThrow();
    expect(() => dollarsToCents(" 12.34 ")).toThrow();
    expect(() => dollarsToCents(Number.NaN)).toThrow();
    expect(() => dollarsToCents(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("rejects amounts that cannot be represented as safe integer cents", () => {
    expect(() => dollarsToCents("90071992547409.92")).toThrow();
  });

  it("rejects non-integer cents", () => {
    expect(() => centsToDollarString(12.5)).toThrow();
  });
});
