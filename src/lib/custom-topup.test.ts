import { describe, expect, it } from "vitest";
import { priceCustomTopUp } from "./custom-topup";

describe("priceCustomTopUp", () => {
  it("credits 1 per dollar", () => expect(priceCustomTopUp(25)).toEqual({ amountUsd: 25, credits: 25 }));
  it("rejects cents", () => expect(() => priceCustomTopUp(5.49)).toThrow());
  it("rejects below $5", () => expect(() => priceCustomTopUp(4)).toThrow());
  it("rejects above $10,000", () => expect(() => priceCustomTopUp(10001)).toThrow());
});
