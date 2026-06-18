// Integration tests for the per-message cost + per-country aggregation logic
// used by both the campaign builder cost panel and the dispatch route.
//
// These mirror the formula:
//   cost(message) = segments * sell_price * (media ? mms_multiplier : 1)
//   total         = sum over recipients
//
// They guard against:
//  - off-by-one segment counts at boundaries
//  - float-rounding errors when summing many small per-SMS costs
//  - mis-routing recipients to wrong country
//  - MMS multiplier silently dropping when media URL is absent
import { describe, it, expect } from "vitest";
import { calculateSegments } from "./sms-segments";
import { countryFromPhone } from "./country-from-phone";

const RATES = [
  { country_code: "US", country_name: "United States", dial_prefix: "+1", sell_price: 0.015, mms_multiplier: 3.0 },
  { country_code: "GB", country_name: "United Kingdom", dial_prefix: "+44", sell_price: 0.040, mms_multiplier: 3.0 },
  { country_code: "NG", country_name: "Nigeria", dial_prefix: "+234", sell_price: 0.045, mms_multiplier: 3.0 },
  { country_code: "DE", country_name: "Germany", dial_prefix: "+49", sell_price: 0.085, mms_multiplier: 3.0 },
  { country_code: "AE", country_name: "UAE", dial_prefix: "+971", sell_price: 0.090, mms_multiplier: 3.0 },
];

type Recipient = { phone_e164: string; country_code?: string | null };

function estimate(recipients: Recipient[], body: string, opts: { media?: boolean } = {}) {
  const seg = calculateSegments(body);
  const counts: Record<string, number> = {};
  for (const p of recipients) {
    const cc = p.country_code || countryFromPhone(p.phone_e164, RATES) || "??";
    counts[cc] = (counts[cc] ?? 0) + 1;
  }
  const breakdown = Object.entries(counts).map(([cc, n]) => {
    const r = RATES.find((x) => x.country_code === cc);
    const unit = r ? Number(r.sell_price) : 0;
    const mult = opts.media && r ? Number(r.mms_multiplier) : 1;
    const subtotal = +(n * seg.segments * unit * mult).toFixed(4);
    return { country_code: cc, recipients: n, subtotal, segments: seg.segments };
  });
  const total = +breakdown.reduce((a, b) => a + b.subtotal, 0).toFixed(4);
  return { seg, breakdown, total };
}

describe("per-country cost aggregation", () => {
  it("single US recipient, 1-segment GSM message", () => {
    const r = estimate([{ phone_e164: "+15551234567" }], "Hi there");
    expect(r.seg.segments).toBe(1);
    expect(r.total).toBe(0.015);
    expect(r.breakdown).toHaveLength(1);
  });

  it("mixed US + GB + NG split correctly by dial prefix", () => {
    const recipients: Recipient[] = [
      { phone_e164: "+15551234567" },
      { phone_e164: "+15557654321" },
      { phone_e164: "+447911123456" },
      { phone_e164: "+2348011112222" },
    ];
    const r = estimate(recipients, "A");
    const byCC = Object.fromEntries(r.breakdown.map((b) => [b.country_code, b]));
    expect(byCC.US.recipients).toBe(2);
    expect(byCC.GB.recipients).toBe(1);
    expect(byCC.NG.recipients).toBe(1);
    expect(byCC.US.subtotal).toBe(0.03);
    expect(byCC.GB.subtotal).toBe(0.04);
    expect(byCC.NG.subtotal).toBe(0.045);
    expect(r.total).toBe(0.115);
  });

  it("explicit profile.country_code wins over phone prefix", () => {
    const r = estimate(
      [{ phone_e164: "+15551234567", country_code: "GB" }],
      "Hi",
    );
    expect(r.breakdown[0].country_code).toBe("GB");
    expect(r.total).toBe(0.04);
  });

  it("unknown prefix becomes '??' bucket with zero cost", () => {
    const r = estimate([{ phone_e164: "+9990000000" }], "Hi");
    expect(r.breakdown[0].country_code).toBe("??");
    expect(r.breakdown[0].subtotal).toBe(0);
    expect(r.total).toBe(0);
  });

  it("multi-segment message multiplies cost by segment count", () => {
    const body = "A".repeat(161); // 2 segments GSM
    const r = estimate([{ phone_e164: "+15551234567" }], body);
    expect(r.seg.segments).toBe(2);
    expect(r.total).toBe(0.03);
  });

  it("Unicode 71-char body costs 2 segments × rate", () => {
    const body = "👍" + "a".repeat(70);
    const r = estimate([{ phone_e164: "+447911123456" }], body);
    expect(r.seg.segments).toBe(2);
    expect(r.total).toBe(0.08); // 2 × 0.040
  });

  it("MMS applies ×3 multiplier per country", () => {
    const r = estimate([{ phone_e164: "+15551234567" }], "Hi", { media: true });
    expect(r.total).toBe(0.045); // 1 × 0.015 × 3
  });

  it("MMS off → no multiplier applied", () => {
    const r = estimate([{ phone_e164: "+15551234567" }], "Hi", { media: false });
    expect(r.total).toBe(0.015);
  });
});

describe("decimal precision under bulk aggregation", () => {
  it("1000 US recipients × $0.015 sums to exactly $15.00 (no float drift)", () => {
    const recipients: Recipient[] = Array.from({ length: 1000 }, () => ({ phone_e164: "+15551234567" }));
    const r = estimate(recipients, "Hi");
    expect(r.total).toBe(15);
  });

  it("10,000 mixed-country recipients sums cleanly", () => {
    const recipients: Recipient[] = [];
    for (let i = 0; i < 4000; i++) recipients.push({ phone_e164: "+15551234567" }); // US
    for (let i = 0; i < 3000; i++) recipients.push({ phone_e164: "+447911123456" }); // GB
    for (let i = 0; i < 2000; i++) recipients.push({ phone_e164: "+4915112345678" }); // DE
    for (let i = 0; i < 1000; i++) recipients.push({ phone_e164: "+971501234567" }); // AE
    const r = estimate(recipients, "Hi");
    // 4000*0.015 + 3000*0.040 + 2000*0.085 + 1000*0.090
    // = 60 + 120 + 170 + 90 = 440.00
    expect(r.total).toBe(440);
  });

  it("rounds per-country subtotals to 4dp to avoid creeping float drift", () => {
    // 7 × 0.090 = 0.63 exactly under fixed-precision
    const recipients: Recipient[] = Array.from({ length: 7 }, () => ({ phone_e164: "+971501234567" }));
    const r = estimate(recipients, "Hi");
    expect(r.breakdown[0].subtotal).toBe(0.63);
    expect(r.total).toBe(0.63);
  });

  it("multi-segment × thousand recipients keeps integer-cent precision", () => {
    const body = "A".repeat(307); // 3 segments
    const recipients: Recipient[] = Array.from({ length: 1000 }, () => ({ phone_e164: "+15551234567" }));
    const r = estimate(recipients, body);
    // 1000 × 3 × 0.015 = 45.00
    expect(r.total).toBe(45);
  });
});

describe("balance / insufficient detection", () => {
  function check(balance: number, totalCost: number) {
    return { insufficient: totalCost > balance, balanceAfter: +(balance - totalCost).toFixed(4) };
  }

  it("exact-match balance is sufficient", () => {
    expect(check(15, 15)).toEqual({ insufficient: false, balanceAfter: 0 });
  });

  it("one cent short blocks send", () => {
    expect(check(14.99, 15)).toEqual({ insufficient: true, balanceAfter: -0.01 });
  });

  it("large send well under balance", () => {
    expect(check(1000, 440)).toEqual({ insufficient: false, balanceAfter: 560 });
  });

  it("zero-cost send (no recipients matched any rate) is always allowed", () => {
    expect(check(0, 0)).toEqual({ insufficient: false, balanceAfter: 0 });
  });
});
