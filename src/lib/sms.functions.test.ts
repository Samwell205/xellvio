import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), permission: vi.fn(), suppressed: vi.fn(), screen: vi.fn(),
  send: vi.fn(), provision: vi.fn(), adminFrom: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./acting-account.server", () => ({ resolveActingAccount: mocks.resolve, assertPermission: mocks.permission }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.adminFrom } }));
vi.mock("./suppression.server", () => ({ assertNotSuppressed: mocks.suppressed }));
vi.mock("./content-screening.server", () => ({ screenMessageContent: mocks.screen }));
vi.mock("./telnyx.server", () => ({
  isValidTelnyxUuid: (value: unknown) => value === "business-profile",
  ensureMessagingProfileForAccount: mocks.provision,
  sendMessage: mocks.send,
  safeTelnyxCall: (_name: string, _context: unknown, call: () => unknown) => call(),
}));
import { sendTestSms } from "./sms.functions";
import { TOS_CURRENT_VERSION } from "./tos";

const handler = sendTestSms as unknown as (args: { data: { to: string; body: string; country: string }; context: { userId: string; supabase: unknown } }) => Promise<unknown>;
const input = { to: "+14165550123", body: "Your requested update. Reply STOP to opt out.", country: "CA" };

function fixture(status = "verified") {
  const filters: Array<[string, string, unknown]> = [];
  const inserted: unknown[] = [];
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([table, column, value]); return query; },
      gte: () => query,
      maybeSingle: async () => ({ data: { tos_current_version_accepted: TOS_CURRENT_VERSION, sending_suspended_at: null }, error: null }),
      insert: async (row: unknown) => { inserted.push(row); return { error: null }; },
      then: (resolve: (result: unknown) => unknown) => resolve(table === "sender_assets"
        ? { data: filters.some(([t, c, v]) => t === table && c === "account_id" && v === "business")
          ? [{ phone_number: "+15555550100", telnyx_messaging_profile_id: "business-profile", sender_kind: "local", country_code: "US", verification_status: status }]
          : [], error: null }
        : { count: 0, error: null }),
    };
    return query;
  };
  mocks.adminFrom.mockImplementation(from);
  return { filters, inserted, context: { userId: "teammate", supabase: { from } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ accountId: "business", userId: "teammate", isOwner: false, role: "admin", permissions: { campaigns: true } });
  mocks.screen.mockResolvedValue({ passed: true });
  mocks.send.mockResolvedValue({ id: "test-receipt", to: [{ status: "queued" }] });
});

describe("shared-business test SMS", () => {
  it("uses the business's verified US local number for a Canada test, not the teammate's empty account", async () => {
    const f = fixture();
    await expect(handler({ data: input, context: f.context })).resolves.toMatchObject({ from: "+15555550100", status: "queued" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ accountId: "business", from: "+15555550100", messagingProfileId: "business-profile" }));
    expect(mocks.suppressed).toHaveBeenCalledWith("business", input.to);
    expect(mocks.screen).toHaveBeenCalledWith(input.body, "business", expect.any(Object));
    expect(f.filters).toContainEqual(["accounts", "id", "business"]);
    expect(f.inserted).toEqual([expect.objectContaining({ user_id: "teammate" })]);
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("still refuses an unverified business number", async () => {
    await expect(handler({ data: input, context: fixture("submitted").context })).rejects.toThrow("No verified sender");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("checks campaign permission before looking up a sender", async () => {
    mocks.permission.mockImplementationOnce(() => { throw new Error("Permission denied"); });
    await expect(handler({ data: input, context: fixture().context })).rejects.toThrow("Permission denied");
    expect(mocks.permission).toHaveBeenCalledWith(expect.objectContaining({ accountId: "business" }), "campaigns");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not let a read-only teammate send", async () => {
    mocks.resolve.mockResolvedValueOnce({ accountId: "business", isOwner: false, role: "viewer", permissions: { campaigns: true } });
    await expect(handler({ data: input, context: fixture().context })).rejects.toThrow("Read-only");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps the business's opt-out firewall before sending", async () => {
    mocks.suppressed.mockRejectedValueOnce(new Error("Opted out"));
    await expect(handler({ data: input, context: fixture().context })).rejects.toThrow("Opted out");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps content screening before sending", async () => {
    mocks.screen.mockResolvedValueOnce({ passed: false, blockedReasons: ["Blocked"], riskScore: 70 });
    await expect(handler({ data: input, context: fixture().context })).rejects.toThrow("Message blocked");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});