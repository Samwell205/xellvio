import { afterEach, describe, expect, it, vi } from "vitest";
import { SECONDARY_PROFILE_ID, SECONDARY_WORKSPACE_ID } from "./telnyx-connection";
import { sendMessage } from "./telnyx.server";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("actual message connection selection", () => {
  it("sends Denmark with the new key and preserves the sender name", async () => {
    vi.stubEnv("TELNYX_SECONDARY_INACTIVE_API_KEY", "secondary-test-key");
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "test", to: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendMessage({ accountId: SECONDARY_WORKSPACE_ID, messagingProfileId: SECONDARY_PROFILE_ID, from: "BYENSOPTUR", to: "+4512345678", text: "Test", idempotencyKey: "test-denmark" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer secondary-test-key");
    expect(JSON.parse(String(options?.body))).toMatchObject({ from: "BYENSOPTUR", to: "+4512345678", messaging_profile_id: SECONDARY_PROFILE_ID });
    expect((options?.headers as Record<string, string>)["Idempotency-Key"]).toBe("test-denmark");
  });
  it("rejects another workspace using the new profile before contacting the carrier", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendMessage({ accountId: "other", messagingProfileId: SECONDARY_PROFILE_ID, to: "+4512345678", text: "Test" })).rejects.toThrow("unavailable for this workspace");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps other profiles on the original key", async () => {
    vi.stubEnv("TELNYX_API_KEY", "primary-test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "test", to: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendMessage({ messagingProfileId: "40019f2a-14c7-4447-8b7b-d4cb04511b5a", to: "+4512345678", text: "Test" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer primary-test-key");
  });
});