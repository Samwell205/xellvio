import { describe, it, expect } from "vitest";
import { parseTwilioPrice } from "./twilio-price-sync.server";

describe("parseTwilioPrice", () => {
  it("turns Twilio's negative price into a positive cost", () => {
    expect(parseTwilioPrice("-0.00830")).toBe(0.0083);
  });
  it("keeps unpriced messages as null, not zero", () => {
    expect(parseTwilioPrice(null)).toBeNull();
    expect(parseTwilioPrice("")).toBeNull();
  });
});
