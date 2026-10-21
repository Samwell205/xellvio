import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ai: vi.fn(), suspend: vi.fn(), insert: vi.fn() }));
vi.mock("./ai-content-scan.server", () => ({ aiScan: mocks.ai }));
vi.mock("./tenant-suspension.server", () => ({ suspendTenantSending: mocks.suspend }));
vi.mock("@/integrations/supabase/client.server", () => {
  const query = {
    select: () => query, eq: () => query, in: () => query, gte: () => query,
    insert: (row: unknown) => { mocks.insert(row); return query; },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
  };
  return { supabaseAdmin: { from: () => query, rpc: async () => ({ data: [], error: null }) } };
});
import { screenMessageContent } from "./content-screening.server";

beforeEach(() => vi.clearAllMocks());
describe("reported information-demand consistency", () => {
  it.each(["test_send", "campaign_plan", "inbox_reply"])("blocks before delivery in %s without another AI opinion", async (context) => {
    const message = "{{first_name}}: Business Information Needed\n\nComplete Your Company Details\n\nReview your details: https://xellvio.com/r/EtfNCnFH\n\nSTOP";
    const result = await screenMessageContent(message, "business", { context, skipReviewQueue: true });
    expect(result).toMatchObject({ passed: false, action: "blocked", riskScore: 70 });
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: "category:phishing", score: 70 }));
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.suspend).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ account_id: "business", action_taken: "blocked", context }));
  });
});