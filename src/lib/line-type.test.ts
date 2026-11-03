import { afterAll, describe, expect, it } from "vitest";
import { isTextable, keyForPhone } from "./line-type.server";
import { LOOKUP_PRICE_PER_NUMBER, lookupCostCents } from "./line-type.shared";

const ENV_SNAPSHOT = { ...process.env };
afterAll(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_SNAPSHOT)) delete process.env[key];
  }
  Object.assign(process.env, ENV_SNAPSHOT);
});

describe("phone type check pricing", () => {
  it("charges $0.01 per newly looked-up number", () => {
    expect(LOOKUP_PRICE_PER_NUMBER).toBe(0.01);
    expect(lookupCostCents(1)).toBe(1);
    expect(lookupCostCents(1000)).toBe(1000); // 1,000 contacts → $10.00
  });

  it("never bills numbers already checked before", () => {
    expect(lookupCostCents(0)).toBe(0);
  });
});

describe("carrier account routing for lookups", () => {
  it("bills +1 lookups to the funded primary account and everything else to the international account", () => {
    process.env['TELNYX_PRIMARY_API_KEY'] = "primary-key";
    process.env['TELNYX_API_KEY'] = "intl-key";
    expect(keyForPhone("+18664725941")).toBe("primary-key");
    expect(keyForPhone("+447494883874")).toBe("intl-key");
    delete process.env['TELNYX_PRIMARY_API_KEY'];
    expect(keyForPhone("+18664725941")).toBe("intl-key");
  });
});

describe("textable line types", () => {
  it("blocks landlines and toll-free lines but keeps mobile, VoIP and unchecked numbers", () => {
    expect(isTextable("landline")).toBe(false);
    expect(isTextable("toll_free")).toBe(false);
    expect(isTextable("mobile")).toBe(true);
    expect(isTextable("voip")).toBe(true);
    expect(isTextable(null)).toBe(true);
  });
});
