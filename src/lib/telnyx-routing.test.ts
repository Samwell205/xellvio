import { afterEach, describe, expect, it, vi } from "vitest";
import { ORIGINAL_PROFILE_ID, SECONDARY_PROFILE_ID, SECONDARY_WORKSPACE_ID } from "./telnyx-connection";
import { sendMessage } from "./telnyx.server";

const intl = vi.hoisted(() => ({ send: vi.fn(async () => ({ id: "SMintl", parts: 1 })) }));
vi.mock("@/integrations/supabase/client.server", () => {
  const query: any = { select: () => query, eq: () => query, in: () => query, limit: () => query, order: () => query, maybeSingle: async () => ({ data: null }) };
  return { supabaseAdmin: { from: () => query } };
});
vi.mock("./twilio-lines.server", () => ({ activeLineFor: async () => null, sendViaLine: vi.fn() }));
vi.mock("./intl-subaccounts.server", () => ({ sendViaIntl: intl.send }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); intl.send.mockClear(); });

function mockSend() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ data: { id: "test", to: [] } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("actual message connection selection", () => {
  it("sends UK destinations through the business's own international sub-account, never the old carrier", async () => {
    const fetchMock = mockSend();
    const r = await sendMessage({ accountId: SECONDARY_WORKSPACE_ID, messagingProfileId: ORIGINAL_PROFILE_ID, from: "BYENSOPTUR", to: "+447700900123", text: "Test" });
    expect(intl.send).toHaveBeenCalledWith(SECONDARY_WORKSPACE_ID, expect.objectContaining({ to: "+447700900123", from: "BYENSOPTUR" }));
    expect(r.id).toBe("SMintl");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends other non-US/CA destinations through the international sub-account too", async () => {
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: SECONDARY_PROFILE_ID, from: "XELLVIO", to: "+4531234567", text: "Test" });
    expect(intl.send).toHaveBeenCalledWith("other", expect.objectContaining({ to: "+4531234567", from: "XELLVIO" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends +1 traffic through the international account or the temporary account", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: SECONDARY_PROFILE_ID, from: "+18333580241", to: "+14155550123", text: "Test" });
    expect(intl.send).not.toHaveBeenCalled();
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(options?.body))).toMatchObject({ to: "+14155550123", messaging_profile_id: ORIGINAL_PROFILE_ID });
  });

  it("keeps +1 sends on the tenant's own profile when it is not the temporary one", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: "40019f2a-14c7-4447-8b7b-d4cb04511b5a", from: "+18333580241", to: "+14155550123", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(options?.body))).toMatchObject({ messaging_profile_id: "40019f2a-14c7-4447-8b7b-d4cb04511b5a" });
  });

  it("authenticates +1 sends with the primary account key", async () => {
    vi.stubEnv("TELNYX_PRIMARY_API_KEY", "primary-account-key");
    vi.stubEnv("TELNYX_API_KEY", "international-account-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: ORIGINAL_PROFILE_ID, from: "+18333580241", to: "+14155550123", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-account-key");
  });
});
