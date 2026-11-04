import { describe, it, expect } from "vitest";
import { carrierFundsHeld, isCarrierFundsError, FUNDS_HOLD_MS } from "./carrier-funds-guard";

const now = 1_000_000_000;

describe("carrier funds guard", () => {
  it("treats account-suspended codes as funds errors", () => {
    expect(isCarrierFundsError("TW30002")).toBe(true);
    expect(isCarrierFundsError("20003")).toBe(true);
    expect(isCarrierFundsError("TW30003")).toBe(false);
  });
  it("holds when balance is at or below the buffer", () => {
    expect(carrierFundsHeld({ balanceOk: true, balance: 5, buffer: 5, heldAtMs: null, nowMs: now })).toBe(true);
    expect(carrierFundsHeld({ balanceOk: true, balance: 50, buffer: 5, heldAtMs: null, nowMs: now })).toBe(false);
  });
  it("never holds on an unknown balance alone", () => {
    expect(carrierFundsHeld({ balanceOk: false, balance: 0, buffer: 5, heldAtMs: null, nowMs: now })).toBe(false);
  });
  it("recent rejection holds unless balance is confirmed healthy", () => {
    const heldAtMs = now - 60_000;
    expect(carrierFundsHeld({ balanceOk: false, balance: 0, buffer: 5, heldAtMs, nowMs: now })).toBe(true);
    expect(carrierFundsHeld({ balanceOk: true, balance: 100, buffer: 5, heldAtMs, nowMs: now })).toBe(false);
    expect(carrierFundsHeld({ balanceOk: false, balance: 0, buffer: 5, heldAtMs: now - FUNDS_HOLD_MS - 1, nowMs: now })).toBe(false);
  });
});
