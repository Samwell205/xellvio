import { describe, expect, it } from "vitest";
import { keywordScan } from "./content-scanner";

const blocked = (t: string) => keywordScan(t).allowed === false;

describe("scam and phishing content is blocked", () => {
  it("blocks Coinbase impersonation", () => {
    expect(blocked("Coinbase: unusual sign-in detected. Secure your account at cb-help.co")).toBe(true);
  });
  it("blocks wallet seed phrase requests", () => {
    expect(blocked("Sync your wallet now, enter your recovery phrase here")).toBe(true);
  });
  it("blocks locked-account bank phishing", () => {
    expect(blocked("Chase alert: your account has been suspended. Verify now")).toBe(true);
  });
  it("still allows an ordinary promotion", () => {
    expect(keywordScan("Weekend sale at Rosa's Bakery: 20% off all cakes. Reply STOP to opt out").allowed).toBe(true);
  });
});
