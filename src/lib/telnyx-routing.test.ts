import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERNATIONAL_PROFILE_ID, ORIGINAL_PROFILE_ID, SECONDARY_PROFILE_ID, SECONDARY_WORKSPACE_ID } from "./telnyx-connection";
import { sendMessage } from "./telnyx.server";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function mockSend() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ data: { id: "test", to: [] } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("actual message connection selection", () => {
  it("sends international destinations on the dedicated international connection", async () => {
    vi.stubEnv("TELNYX_SECONDARY_INACTIVE_API_KEY", "secondary-test-key");
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: SECONDARY_WORKSPACE_ID, messagingProfileId: ORIGINAL_PROFILE_ID, from: "BYENSOPTUR", to: "+447700900123", text: "Test", idempotencyKey: "test-uk" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-test-key");
    expect(JSON.parse(String(options?.body))).toMatchObject({ from: "BYENSOPTUR", to: "+447700900123", messaging_profile_id: INTERNATIONAL_PROFILE_ID });
    expect((options?.headers as Record<string, string>)["Idempotency-Key"]).toBe("test-uk");
  });

  it("sends other non-US/CA destinations on the international connection too", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: SECONDARY_PROFILE_ID, from: "XELLVIO", to: "+4531234567", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-test-key");
    expect(JSON.parse(String(options?.body))).toMatchObject({ from: "XELLVIO", to: "+4531234567", messaging_profile_id: INTERNATIONAL_PROFILE_ID });
  });

  it("never sends +1 traffic through the temporary account; maps it to the original profile", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: SECONDARY_PROFILE_ID, from: "+18333580241", to: "+14155550123", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(options?.body))).toMatchObject({ from: "+18333580241", to: "+14155550123", messaging_profile_id: ORIGINAL_PROFILE_ID });
  });

  it("keeps +1 sends on the tenant's own profile when it is not the temporary one", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: "40019f2a-14c7-4447-8b7b-d4cb04511b5a", from: "+18333580241", to: "+14155550123", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(options?.body))).toMatchObject({ messaging_profile_id: "40019f2a-14c7-4447-8b7b-d4cb04511b5a" });
  });

  it("authenticates +1 sends with the primary account key and international sends with the international key", async () => {
    vi.stubEnv("TELNYX_PRIMARY_API_KEY", "primary-account-key");
    vi.stubEnv("TELNYX_API_KEY", "international-account-key");
    const fetchMock = mockSend();
    await sendMessage({ accountId: "other", messagingProfileId: ORIGINAL_PROFILE_ID, from: "+18333580241", to: "+14155550123", text: "Test" });
    let options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-account-key");
    await sendMessage({ accountId: "other", messagingProfileId: ORIGINAL_PROFILE_ID, from: "XELLVIO", to: "+447700900123", text: "Test" });
    options = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer international-account-key");
    expect(JSON.parse(String(options?.body))).toMatchObject({ messaging_profile_id: INTERNATIONAL_PROFILE_ID });
  });
});
