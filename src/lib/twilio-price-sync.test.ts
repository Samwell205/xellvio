import { describe, it, expect } from "vitest";
import { parseTwilioPrice, verifiedPricePatch } from "./twilio-price-sync.server";

describe("parseTwilioPrice", () => {
  it("turns Twilio's negative price into a positive cost", () => {
    expect(parseTwilioPrice("-0.00830")).toBe(0.0083);
  });
  it("keeps unpriced messages as null, not zero", () => {
    expect(parseTwilioPrice(null)).toBeNull();
    expect(parseTwilioPrice("")).toBeNull();
  });
  it("only records an exact matching USD message price", () => {
    const row = { id: "row", provider_message_id: "SMone" };
    expect(verifiedPricePatch(row, { sid: "SMone", price: "-0.0083", price_unit: "USD" })?.carrier_price).toBe(0.0083);
    expect(verifiedPricePatch(row, { sid: "SMother", price: "-0.0083", price_unit: "USD" })).toBeNull();
    expect(verifiedPricePatch(row, { sid: "SMone", price: "-0.0083", price_unit: "EUR" })).toBeNull();
    expect(verifiedPricePatch(row, { sid: "SMone", price: null, price_unit: "USD" })).toBeNull();
  });
});
