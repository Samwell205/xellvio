import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ensureIntlSubaccount, sendViaIntl } from "./intl-subaccounts.server";

const state = vi.hoisted(() => ({ row: null as any, decrypt: null as string | null, encryptError: null as any, updates: [] as any[], claimed: true }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => {
    let updating = false;
    const q: any = {
      select: () => q, eq: () => q, is: () => q,
      insert: async () => ({ error: null }),
      update: (patch: any) => { updating = true; state.updates.push(patch); return q; },
      maybeSingle: async () => ({ data: updating ? (state.claimed ? { account_id: "business" } : null) : state.row, error: null }),
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
    };
    return q;
  },
  rpc: async (name: string) => name === "decrypt_twilio_token" ? { data: state.decrypt } : { data: state.encryptError ? null : "encrypted", error: state.encryptError },
} }));

beforeEach(() => {
  state.row = null; state.decrypt = null; state.encryptError = null; state.updates = []; state.claimed = true;
  vi.stubEnv("TWILIO_INTL_ACCOUNT_SID", "ACparent"); vi.stubEnv("TWILIO_INTL_AUTH_TOKEN", "test-token");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const response = (body: any, status = 200) => new Response(JSON.stringify(body), { status });

describe("international account ownership and capacity", () => {
  it("never creates a replacement when an existing account token cannot be recovered", async () => {
    state.row = { subaccount_sid: "ACowned" };
    const fetcher = vi.fn(async () => response({}, 401)); vi.stubGlobal("fetch", fetcher);
    await expect(ensureIntlSubaccount("business")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBeUndefined(); // replaced below with URL capture
    expect(state.updates).toHaveLength(0);
  });
  it("reuses the exact active parent-owned account before any create call", async () => {
    const fetcher = vi.fn(async () => response({ accounts: [{ sid: "ACexisting", auth_token: "test-child-token", owner_account_sid: "ACparent", friendly_name: "xellvio-intl-business", status: "active" }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await ensureIntlSubaccount("business")).toEqual({ sid: "ACexisting", token: "test-child-token" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.updates[0]).toMatchObject({ subaccount_sid: "ACexisting", status: "active" });
  });
  it("does not create or send after capacity error 21480", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ accounts: [] })).mockResolvedValueOnce(response({ code: 21480, message: "Reached maximum number of subaccounts" }, 400));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendViaIntl("business", { to: "+447700900123", from: "XELLVIO", text: "Test" })).rejects.toMatchObject({ internationalSetupCode: "capacity_exhausted" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.updates[0]).toMatchObject({ status: "failed", last_error: "Reached maximum number of subaccounts" });
  });
  it("does not adopt another parent's account or create a replacement", async () => {
    const fetcher = vi.fn(async () => response({ accounts: [{ sid: "ACforeign", auth_token: "test", owner_account_sid: "ACother", friendly_name: "xellvio-intl-business", status: "active" }] })); vi.stubGlobal("fetch", fetcher);
    await expect(ensureIntlSubaccount("business")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.updates).toHaveLength(0);
  });
  it("a worker that loses the retry claim cannot create an account", async () => {
    state.row = { subaccount_sid: null, status: "failed", updated_at: "2026-11-13T00:00:00Z" }; state.claimed = false;
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(ensureIntlSubaccount("business")).rejects.toMatchObject({ telnyxCode: "10011" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not return a new account when encrypting its token fails", async () => {
    state.encryptError = { message: "encryption unavailable" };
    const fetcher = vi.fn().mockResolvedValueOnce(response({ accounts: [] })).mockResolvedValueOnce(response({ sid: "ACnew", auth_token: "test-child" })); vi.stubGlobal("fetch", fetcher);
    await expect(ensureIntlSubaccount("business")).rejects.toThrow();
    expect(state.updates).toHaveLength(0);
  });
});