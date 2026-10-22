import { afterEach, describe, expect, it, vi } from "vitest";
import { SECONDARY_PROFILE_ID, SECONDARY_WORKSPACE_ID } from "./telnyx-connection";
import { sendMessage } from "./telnyx.server";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("actual message connection selection", () => {
  it("never sends through the temporary account; uses the original key and profile", async () => {
    vi.stubEnv("TELNYX_SECONDARY_INACTIVE_API_KEY", "secondary-test-key");
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ data: { id: "test", to: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendMessage({ accountId: SECONDARY_WORKSPACE_ID, messagingProfileId: SECONDARY_PROFILE_ID, from: "BYENSOPTUR", to: "+4512345678", text: "Test", idempotencyKey: "test-denmark" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-test-key");
    expect(JSON.parse(String(options?.body))).toMatchObject({ from: "BYENSOPTUR", to: "+4512345678", messaging_profile_id: "40019f2a-14c7-4447-8b7b-d4cb04511b5a" });
    expect((options?.headers as Record<string, string>)["Idempotency-Key"]).toBe("test-denmark");
  });
  it("sends another workspace's message on its own original profile and sender", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ data: { id: "test", to: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendMessage({ accountId: "other", messagingProfileId: "40019f2a-14c7-4447-8b7b-d4cb04511b5a", from: "+18333580241", to: "+14155550123", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-test-key");
    expect(JSON.parse(String(options?.body))).toMatchObject({ from: "+18333580241", to: "+14155550123", messaging_profile_id: "40019f2a-14c7-4447-8b7b-d4cb04511b5a" });
  });
});
