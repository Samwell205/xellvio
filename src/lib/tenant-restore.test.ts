import { describe, it, expect, vi } from "vitest";

const updates: Array<{ table: string; patch: any }> = [];
vi.mock("@/integrations/supabase/client.server", () => {
  const chain = (table: string): any => {
    const q: any = {
      select: () => q, eq: () => q, is: () => q, in: () => q, or: () => q, neq: () => q,
      maybeSingle: async () => ({ data: { id: "a1", telnyx_messaging_profile_id: null } }),
      update: (patch: any) => { updates.push({ table, patch }); return q; },
      then: (r: any) => r({ data: null, error: null, count: 2 }),
    };
    return q;
  };
  return { supabaseAdmin: { from: chain } };
});

describe("Restoring account sending", () => {
  it("lifts the hold but never requeues campaigns", async () => {
    const { resumeTenantSending } = await import("./tenant-suspension.server");
    const r = await resumeTenantSending({ tenantAccountId: "a1", liftedBy: "admin" });
    expect(updates.some((u) => u.table === "accounts" && u.patch.sending_suspended_at === null)).toBe(true);
    expect(updates.filter((u) => u.table === "campaigns")).toEqual([]);
    expect(r.campaignsLeftPaused).toBe(2);
  });
});
