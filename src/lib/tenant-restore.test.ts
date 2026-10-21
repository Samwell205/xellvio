import { describe, it, expect, vi } from "vitest";

const updates: Array<{ table: string; patch: any; filters: any[] }> = [];
vi.mock("@/integrations/supabase/client.server", () => {
  const chain = (table: string): any => {
    let current: { table: string; patch: any; filters: any[] } | null = null;
    const rec = (name: string) => (...args: any[]) => { current?.filters.push([name, ...args]); return q; };
    const q: any = {
      select: () => q, eq: rec("eq"), is: rec("is"), in: rec("in"), or: rec("or"), neq: rec("neq"),
      maybeSingle: async () => ({ data: { id: "a1", telnyx_messaging_profile_id: null } }),
      update: (patch: any) => { current = { table, patch, filters: [] }; updates.push(current); return q; },
      then: (r: any) => r({ data: current?.table === "campaigns" ? [{ id: "c1" }, { id: "c2" }] : null, error: null, count: 1 }),
    };
    return q;
  };
  return { supabaseAdmin: { from: chain } };
});

describe("Restoring account sending", () => {
  it("restarts only campaigns the account hold paused", async () => {
    const { resumeTenantSending, HOLD_PAUSE_FILTER } = await import("./tenant-suspension.server");
    const r = await resumeTenantSending({ tenantAccountId: "a1", liftedBy: "admin" });
    expect(updates.some((u) => u.table === "accounts" && u.patch.sending_suspended_at === null)).toBe(true);
    const camp = updates.filter((u) => u.table === "campaigns");
    expect(camp).toHaveLength(1);
    expect(camp[0].patch.status).toBe("queued");
    expect(camp[0].filters).toContainEqual(["eq", "status", "paused"]);
    expect(camp[0].filters).toContainEqual(["eq", "account_id", "a1"]);
    expect(camp[0].filters).toContainEqual(["or", HOLD_PAUSE_FILTER]);
    expect(r.campaignsResumed).toBe(2);
  });

  it("hold filter never matches user pauses, review holds or content blocks", async () => {
    const { HOLD_PAUSE_FILTER } = await import("./tenant-suspension.server");
    expect(HOLD_PAUSE_FILTER).not.toMatch(/Held for review|Blocked by screening|Stopped by user/);
    expect(HOLD_PAUSE_FILTER).toContain("Tenant sending suspended");
    expect(HOLD_PAUSE_FILTER).toContain("Sending suspended:*");
  });
});
