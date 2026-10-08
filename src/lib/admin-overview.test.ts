import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { table: string; limit?: number; columns?: string }[], fail: false }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    const query: { table: string; limit?: number; columns?: string } = { table };
    state.queries.push(query);
    const chain = {
      select(columns: string) { query.columns = columns; return chain; },
      eq() { return chain; }, gte() { return chain; }, in() { return chain; }, order() { return chain; },
      limit(n: number) { query.limit = n; return chain; },
      abortSignal() { return Promise.resolve({ count: 0, data: [], error: state.fail ? { message: "unavailable" } : null }); },
    };
    return chain;
  },
} }));

import { adminGetOverview } from "./admin-overview.functions";
const handler = adminGetOverview as unknown as (args: { context: { supabase: { rpc: () => Promise<{ data: boolean; error: null }> } } }) => Promise<unknown>;
const context = { supabase: { rpc: async () => ({ data: true, error: null }) } };

describe("admin operational overview", () => {
  beforeEach(() => { state.queries = []; state.fail = false; });
  it("keeps message previews bounded instead of downloading financial history", async () => {
    await handler({ context });
    const previews = state.queries.filter(q => q.columns !== "id");
    expect(previews).toEqual([
      { table: "accounts", columns: "id,email,full_name,company,created_at", limit: 5 },
      { table: "messages", columns: "id,phone_e164,status,created_at", limit: 6 },
    ]);
    expect(state.queries.some(q => q.table === "payments")).toBe(false);
  });
  it("does not display a failed read as zero activity", async () => {
    state.fail = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(handler({ context })).rejects.toThrow("temporarily unavailable");
    log.mockRestore();
  });
  it("rejects a non-admin before privileged reads", async () => {
    await expect(handler({ context: { supabase: { rpc: async () => ({ data: false, error: null }) } } })).rejects.toThrow("admin only");
    expect(state.queries).toHaveLength(0);
  });
});