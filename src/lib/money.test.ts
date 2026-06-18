import { describe, it, expect } from "vitest";
import { formatUSD, formatRate, formatPerSms } from "./money";

describe("formatUSD", () => {
  it("formats 0 as $0.00", () => { expect(formatUSD(0)).toBe("$0.00"); });
  it("formats 1 as $1.00", () => { expect(formatUSD(1)).toBe("$1.00"); });
  it("rounds half-even to 2 decimals", () => {
    expect(formatUSD(0.005)).toBe("$0.01");
    expect(formatUSD(0.014)).toBe("$0.01");
    expect(formatUSD(0.015)).toBe("$0.02");
  });
  it("handles strings", () => { expect(formatUSD("12.5")).toBe("$12.50"); });
  it("handles null/undefined as $0.00", () => {
    expect(formatUSD(null)).toBe("$0.00");
    expect(formatUSD(undefined)).toBe("$0.00");
  });
  it("includes thousands separator", () => {
    expect(formatUSD(1234.5)).toBe("$1,234.50");
  });
  it("formats large totals", () => {
    expect(formatUSD(1000000)).toBe("$1,000,000.00");
  });
});

describe("formatRate (4 decimal precision)", () => {
  it("shows 4 decimals", () => {
    expect(formatRate(0.015)).toBe("$0.0150");
    expect(formatRate(0.045)).toBe("$0.0450");
    expect(formatRate(0.09)).toBe("$0.0900");
  });
  it("handles zero and null", () => {
    expect(formatRate(0)).toBe("$0.0000");
    expect(formatRate(null)).toBe("$0.0000");
  });
});

describe("formatPerSms", () => {
  it("appends 'per SMS'", () => {
    expect(formatPerSms(0.015)).toBe("$0.0150 per SMS");
  });
});
