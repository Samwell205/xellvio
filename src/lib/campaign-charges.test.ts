import { describe, it, expect } from "vitest";
import { netCampaignCharge } from "./campaign-charges";

describe("netCampaignCharge", () => {
  it("charged equals debits minus refunds (HENRIIK: 1128.8028 - 321.8420)", () => {
    const r = netCampaignCharge([
      { type: "debit", amount: 1000 },
      { type: "debit", amount: "128.8028" },
      { type: "refund", amount: 321.842 },
    ]);
    expect(r.debited).toBe(1128.8028);
    expect(r.refunded).toBe(321.842);
    expect(r.net).toBe(806.9608);
  });
});
