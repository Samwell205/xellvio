import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureIntlSubaccount, sendViaIntl } from "./intl-subaccounts.server";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => { throw new Error("no db expected"); } } }));

beforeEach(() => { vi.stubEnv("TWILIO_INTL_ACCOUNT_SID", "ACparent"); vi.stubEnv("TWILIO_INTL_AUTH_TOKEN", "test-token"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("international sending uses the main international account", () => {
  it("never creates a sub-account", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await ensureIntlSubaccount("business")).toEqual({ sid: "ACparent", token: "test-token" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends from the main international account", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM1", num_segments: "2" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendViaIntl("business", { to: "+447700900123", from: "XELLVIO", text: "Hi" })).toEqual({ id: "SM1", parts: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("/Accounts/ACparent/Messages.json");
  });
  it("fails clearly when the international account is not configured", async () => {
    vi.stubEnv("TWILIO_INTL_ACCOUNT_SID", "");
    await expect(ensureIntlSubaccount("business")).rejects.toThrow();
  });
});
