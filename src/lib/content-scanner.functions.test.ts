import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ aiScan: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./ai-content-scan.server", () => ({ aiScan: mocks.aiScan }));
import { scanCampaignContent } from "./content-scanner.functions";
import type { ScanResult } from "./content-scanner";

const scan = scanCampaignContent as unknown as (args: { data: { messageBody: string } }) => Promise<ScanResult>;
beforeEach(() => vi.clearAllMocks());

describe("campaign preview safety decision", () => {
  it.each(["https://summitfieldgroup.com/home", "https://xellvio.com/r/EtfNCnFH"])("does not approve the reported notice or request another AI opinion: %s", async (url) => {
    const result = await scan({ data: { messageBody: `{{first_name}}: Business Information Needed\nComplete Your Company Details\nReview your details: ${url}\nSTOP` } });
    expect(result).toMatchObject({ allowed: false, confidence: "keyword", category: "phishing" });
    expect(mocks.aiScan).not.toHaveBeenCalled();
  });
  it("does not approve a keyword flag that test sending will block", async () => {
    expect(await scan({ data: { messageBody: "Urgent action required. Reply STOP to unsubscribe." } })).toMatchObject({ allowed: false, confidence: "keyword" });
    expect(mocks.aiScan).not.toHaveBeenCalled();
  });
  it("lets clean text without links through when AI cannot check (rules fallback)", async () => {
    mocks.aiScan.mockResolvedValue({ allowed: true, confidence: "none", unavailable: true });
    expect(await scan({ data: { messageBody: "Summit: Your requested order is ready. STOP" } })).toMatchObject({ allowed: true });
  });
  it("holds text with a link when AI cannot check", async () => {
    mocks.aiScan.mockResolvedValue({ allowed: true, confidence: "none", unavailable: true });
    expect(await scan({ data: { messageBody: "Order ready: https://example.com STOP" } })).toMatchObject({ allowed: false });
  });
  it("allows an ordinary identified order update after a successful safety check", async () => {
    mocks.aiScan.mockResolvedValue({ allowed: true, confidence: "ai" });
    expect(await scan({ data: { messageBody: "Summit: Your requested order is ready. STOP" } })).toMatchObject({ allowed: true, confidence: "ai" });
    expect(mocks.aiScan).toHaveBeenCalledOnce();
  });
});