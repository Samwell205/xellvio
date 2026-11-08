import { describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({ database: { from: vi.fn() } }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: database }));
import { adminGetCampaignReport } from "./admin-campaigns.functions";

async function report(messages: Record<string, unknown>[]) {
  const tables: Record<string, unknown[]> = {
    campaigns: [{ id: "campaign", account_id: "business", name: "Test" }],
    accounts: [{ id: "business" }],
    country_rates: [
      { country_code: "US", cost_price: 0.009, passthrough_fee: 0.002 },
      { country_code: "GB", cost_price: 0.034, passthrough_fee: 0 },
    ],
    messages,
    message_send_attempts: [],
    link_clicks: [],
  };
  database.from.mockImplementation((table: string) => {
    const rows = tables[table] ?? [];
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  });
  const handler = adminGetCampaignReport as unknown as (input: unknown) => Promise<{ totals: Record<string, number | null> }>;
  return (await handler({
    data: { campaignId: "campaign" },
    context: { userId: "admin", supabase: { rpc: async () => ({ data: true, error: null }) } },
  })).totals;
}

const priced = { status: "delivered", country_code: "US", cost: 0.0165, segments_count: 1, provider_message_id: "SMpriced", carrier_price: 0.0083 };

describe("campaign report price coverage", () => {
  it("does not claim actual profit when a non-Twilio message has no price", async () => {
    const totals = await report([priced, { status: "sent", country_code: "GB", cost: 0.048, segments_count: 1, provider_message_id: "other-carrier-id" }]);
    expect(totals.carrier_cost).toBe(0.045);
    expect(totals.margin).toBe(0.0195);
    expect(totals.actual_margin).toBeNull();
    expect(totals.price_pending_count).toBe(1);
  });
  it("checked without a price is unknown rather than free", async () => {
    const totals = await report([{ ...priced, carrier_price: null, carrier_price_checked_at: "2026-11-08T00:00:00Z" }]);
    expect(totals.actual_margin).toBeNull();
    expect(totals.price_pending_count).toBe(1);
  });
  it("returns actual margin when every submitted message has a recorded price", async () => {
    const totals = await report([priced]);
    expect(totals.twilio_total).toBe(0.0103);
    expect(totals.actual_margin).toBe(0.0062);
    expect(totals.price_pending_count).toBe(0);
  });
  it("queued recipients are not billed or missing submitted-message prices", async () => {
    const totals = await report([priced, { status: "queued", country_code: "GB", cost: 0.048, segments_count: 1 }]);
    expect(totals.cost).toBe(0.0165);
    expect(totals.carrier_cost).toBe(0.011);
    expect(totals.reserved_cost).toBe(0.048);
    expect(totals.actual_margin).toBe(0.0062);
    expect(totals.price_pending_count).toBe(0);
  });
});