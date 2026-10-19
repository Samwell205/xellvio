import { describe, expect, it } from "vitest";
import { keywordScan } from "./content-scanner";

describe("scam filter does not hard-block normal business texts", () => {
  it("allows sign-ups wording", () => {
    expect(keywordScan("Thanks for the sign-ups! Please confirm your details for Saturday").allowed).toBe(true);
  });
  it("allows order shipping notices", () => {
    expect(keywordScan("Your Amazon order shipped, log in to track it").allowed).toBe(true);
  });
  it("still blocks a locked-account phishing text", () => {
    expect(keywordScan("Coinbase: your account has been locked, verify now").allowed).toBe(false);
    expect(keywordScan("PayPal alert: your account is restricted, verify at link").allowed).toBe(false);
  });
});
