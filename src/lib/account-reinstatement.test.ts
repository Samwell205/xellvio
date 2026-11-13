import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  account: { suspended_at: "2026-11-12T12:00:00.000Z" as string | null, onboarding_status: "suspended", sending_suspended_at: "2026-11-12T12:00:00.000Z" as string | null, warnings_counted_from: null as string | null },
  logs: [] as Record<string, any>[],
  updates: [] as Record<string, unknown>[],
  suspend: vi.fn(), resume: vi.fn(), notify: vi.fn(), failUpdate: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./tenant-suspension.server", () => ({ suspendTenantSending: state.suspend, resumeTenantSending: state.resume }));
vi.mock("./account-status-notice.server", () => ({ notifyAccountStatus: state.notify }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async () => ({ data: [], error: null }),
  from(table: string) {
    let patch: Record<string, unknown> | undefined;
    let cutoff = "";
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (table === "accounts") {
        if (patch) {
          if (state.failUpdate) return { data: null, error: { message: "update failed" } };
          state.updates.push(patch);
          Object.assign(state.account, patch);
        }
        return { data: { ...state.account }, error: null };
      }
      return { data: table === "content_screening_log" ? state.logs.filter(row => row.created_at >= cutoff && Object.entries(filters).every(([k, v]) => row[k] === v)) : [], error: null };
    };
    const chain = {
      select() { return chain; },
      eq(k: string, v: unknown) { filters[k] = v; return chain; },
      in() { return chain; }, order() { return chain; },
      gte(_k: string, v: string) { cutoff = v; return chain; },
      range(start: number, end: number) { const r = result(); return Promise.resolve({ ...r, data: Array.isArray(r.data) ? r.data.slice(start, end + 1) : r.data }); },
      update(row: Record<string, unknown>) { patch = row; return chain; },
      insert(row: Record<string, unknown>) {
        if (table === "content_screening_log") state.logs.push({ ...row, id: `log-${state.logs.length}`, created_at: new Date().toISOString() });
        return chain;
      },
      single: async () => result(), maybeSingle: async () => result(),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return chain;
  },
} }));

import { adminReinstateAccount } from "./admin-overview.functions";
import { screenMessageContent } from "./content-screening.server";

const context = { userId: "admin", supabase: { rpc: async () => ({ data: true, error: null }) } };
const reinstate = adminReinstateAccount as unknown as (args: { context: typeof context; data: { accountId: string } }) => Promise<unknown>;
const reopen = () => reinstate({ context, data: { accountId: "business" } });
const flag = () => screenMessageContent("Business Information Needed. Complete Your Company Details. Reply STOP", "business", { context: "test_send", skipReviewQueue: true });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
  vi.clearAllMocks();
  Object.assign(state.account, { suspended_at: "2026-11-12T12:00:00.000Z", onboarding_status: "suspended", sending_suspended_at: "2026-11-12T12:00:00.000Z", warnings_counted_from: null });
  state.updates = [];
  state.failUpdate = false;
  state.logs = Array.from({ length: 3 }, (_, i) => ({ id: `old-${i}`, account_id: "business", campaign_id: null, message_text: "old violation", action_taken: "blocked", created_at: "2026-11-12T12:00:00.000Z" }));
  state.resume.mockImplementation(async () => { state.account.sending_suspended_at = null; });
  state.suspend.mockImplementation(async () => { state.account.sending_suspended_at = new Date().toISOString(); });
});
afterEach(() => vi.useRealTimers());

describe("reopened account warning window", () => {
  it("counts the next rejected message as the first warning, retaining old audit rows", async () => {
    await reopen();
    expect(state.updates[0]).toEqual({ suspended_at: null, onboarding_status: "active", warnings_counted_from: "2026-11-13T12:00:00.000Z" });
    expect(state.resume).toHaveBeenCalledWith({ tenantAccountId: "business", liftedBy: "admin" });
    vi.advanceTimersByTime(1000);
    expect((await flag()).action).toBe("blocked");
    expect(state.logs).toHaveLength(4);
    expect(state.suspend).not.toHaveBeenCalled();
    expect(state.account.onboarding_status).toBe("active");
  });

  it("blocks the full account only on the third new warning", async () => {
    await reopen();
    await flag();
    await flag();
    expect(state.suspend).not.toHaveBeenCalled();
    await flag();
    expect(state.suspend).toHaveBeenCalledTimes(1);
    expect(state.account.onboarding_status).toBe("suspended");
    expect(state.account.suspended_at).toBe("2026-11-13T12:00:00.000Z");
  });

  it("still excludes warnings older than 90 days after reopening", async () => {
    await reopen();
    await flag();
    await flag();
    vi.advanceTimersByTime(91 * 24 * 60 * 60 * 1000);
    await flag();
    expect(state.suspend).not.toHaveBeenCalled();
    expect(state.account.onboarding_status).toBe("active");
  });

  it("does not reopen or lift sending if saving the reset fails", async () => {
    state.failUpdate = true;
    await expect(reopen()).rejects.toThrow("update failed");
    expect(state.account.onboarding_status).toBe("suspended");
    expect(state.account.warnings_counted_from).toBeNull();
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("rejects non-admins before changing the warning window", async () => {
    await expect(reinstate({ context: { ...context, supabase: { rpc: async () => ({ data: false, error: null }) } }, data: { accountId: "business" } })).rejects.toThrow("admin only");
    expect(state.updates).toHaveLength(0);
    expect(state.account.warnings_counted_from).toBeNull();
  });
});