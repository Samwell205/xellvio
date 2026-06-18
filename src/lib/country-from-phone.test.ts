import { describe, it, expect } from "vitest";
import { countryFromPhone } from "./country-from-phone";

const RATES = [
  { country_code: "US", dial_prefix: "+1" },
  { country_code: "CA", dial_prefix: "+1" },
  { country_code: "GB", dial_prefix: "+44" },
  { country_code: "NG", dial_prefix: "+234" },
  { country_code: "AE", dial_prefix: "+971" },
  { country_code: "IN", dial_prefix: "+91" },
  { country_code: "DE", dial_prefix: "+49" },
  { country_code: "AU", dial_prefix: "+61" },
];

describe("countryFromPhone", () => {
  it("returns null for empty input", () => {
    expect(countryFromPhone("", RATES)).toBeNull();
  });

  it("returns null when not E.164 (missing +)", () => {
    expect(countryFromPhone("15551234567", RATES)).toBeNull();
  });

  it("returns null when no prefix matches", () => {
    expect(countryFromPhone("+9990000000", RATES)).toBeNull();
  });

  it("matches +1 prefix (US/CA collide → first match wins after sort)", () => {
    // both share +1; sort is stable in V8 — should still return one of them deterministically
    const r = countryFromPhone("+15551234567", RATES);
    expect(["US", "CA"]).toContain(r);
  });

  it("matches +44 UK", () => {
    expect(countryFromPhone("+447911123456", RATES)).toBe("GB");
  });

  it("matches longer +234 over shorter +2", () => {
    const rates = [{ country_code: "ZZ", dial_prefix: "+2" }, ...RATES];
    expect(countryFromPhone("+2348012345678", rates)).toBe("NG");
  });

  it("matches longer +971 over shorter +9", () => {
    const rates = [{ country_code: "ZZ", dial_prefix: "+9" }, ...RATES];
    expect(countryFromPhone("+971501234567", rates)).toBe("AE");
  });

  it("trims whitespace", () => {
    expect(countryFromPhone("  +447911123456  ", RATES)).toBe("GB");
  });

  it("longest-prefix beats shortest regardless of input order", () => {
    const rates = [
      { country_code: "JM", dial_prefix: "+1876" },
      { country_code: "US", dial_prefix: "+1" },
    ];
    expect(countryFromPhone("+18761234567", rates)).toBe("JM");
    expect(countryFromPhone("+15551234567", rates)).toBe("US");
  });
});
