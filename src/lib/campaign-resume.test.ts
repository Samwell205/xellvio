import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { checkedResumeCampaign } from "./campaign-resume.server";

type Opts = {
  campaign?: any; campaignErr?: boolean; accounts?: any[]; accountErr?: boolean; updatedRows?: any[]; updateErr?: boolean;
};
function fakeDb(o: Opts) {
  const updates: any[] = [];
  let acctReads = 0;
  const db = {
    updates,
    from: (table: string) => {
      const filters: any[] = [];
      let patch: any = null;
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => { filters.push([c, v]); return q; },
        update: (p: any) => { patch = p; return q; },
        maybeSingle: async () => {
          if (table === "campaigns") return o.campaignErr ? { data: null, error: { message: "x" } } : { data: o.campaign ?? null, error: null };
          if (o.accountErr) return { data: null, error: { message: "x" } };
          const list = o.accounts ?? [{ id: "a1", onboarding_status: "active", sending_suspended_at: null }];
          return { data: list[Math.min(acctReads++, list.length - 1)], error: null };
        },
        then: (r: any) => {
          updates.push({ table, patch, filters });
          return r(o.updateErr ? { data: null, error: { message: "x" } } : { data: o.updatedRows ?? [{ id: "c1" }], error: null });
        },
      };
      return q;
    },
  };
  return db;
}
const paused = { id: "c1", account_id: "a1", status: "paused", message_body: "Hi. Reply STOP to opt out", name: "Business" };
const pass = vi.fn(async () => ({ action: "passed" }));
const target = { campaignId: "c1", expectedAccountId: "a1" };

describe("checked resume", () => {
  it("passed screen + exact CAS returns queue-only success", async () => {
    const db = fakeDb({ campaign: paused });
    const r = await checkedResumeCampaign(db, target, pass);
    expect(r.ok).toBe(true);
    expect(db.updates).toHaveLength(1);
    const u = db.updates[0];
    expect(u.patch).toEqual({ status: "sending", paused_reason: null, paused_at: null });
    expect(u.filters).toEqual([["id", "c1"], ["account_id", "a1"], ["status", "paused"], ["message_body", paused.message_body]]);
    expect(pass).toHaveBeenCalledWith(paused.message_body, "a1", expect.objectContaining({ skipReviewQueue: true }));
  });

  it.each([
    ["wrong account", { campaign: { ...paused, account_id: "other" } }, "wrong_account"],
    ["missing campaign", { campaign: null }, "not_found"],
    ["failed read", { campaignErr: true }, "read_failed"],
    ["empty body", { campaign: { ...paused, message_body: "  " } }, "read_failed"],
    ["cancelled", { campaign: { ...paused, status: "cancelled" } }, "not_resumable"],
    ["blocked_content", { campaign: { ...paused, status: "blocked_content" } }, "not_resumable"],
    ["final sent", { campaign: { ...paused, status: "sent" } }, "not_resumable"],
    ["hold before screen", { campaign: paused, accounts: [{ id: "a1", onboarding_status: "active", sending_suspended_at: "2026-01-01" }] }, "sending_hold"],
    ["inactive account", { campaign: paused, accounts: [{ id: "a1", onboarding_status: "pending", sending_suspended_at: null }] }, "account_inactive"],
    ["account read fails", { campaign: paused, accountErr: true }, "read_failed"],
  ])("%s never screens or queues", async (_n, o, code) => {
    const screen = vi.fn(async () => ({ action: "passed" }));
    const db = fakeDb(o as Opts);
    const r = await checkedResumeCampaign(db, target, screen);
    expect(r).toMatchObject({ ok: false, code });
    expect(screen).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it.each([
    ["blocked", async () => ({ action: "blocked", blockedReasons: ["phishing"] }), "screen_blocked"],
    ["held", async () => ({ action: "held_for_review", blockedReasons: ["review"] }), "screen_held"],
    ["unavailable (throws)", async () => { throw new Error("ai down"); }, "screen_unavailable"],
    ["unknown result", async () => ({ action: "weird" }), "screen_unavailable"],
  ])("screen %s never queues", async (_n, screen, code) => {
    const db = fakeDb({ campaign: paused });
    const r = await checkedResumeCampaign(db, target, screen as any);
    expect(r).toMatchObject({ ok: false, code });
    expect(db.updates).toHaveLength(0);
  });

  it("hold applied during screening refuses", async () => {
    const db = fakeDb({ campaign: paused, accounts: [
      { id: "a1", onboarding_status: "active", sending_suspended_at: null },
      { id: "a1", onboarding_status: "active", sending_suspended_at: "now" },
    ] });
    expect(await checkedResumeCampaign(db, target, pass)).toMatchObject({ ok: false, code: "sending_hold" });
    expect(db.updates).toHaveLength(0);
  });

  it("no-op CAS (body/state changed) or update error reports changed", async () => {
    expect(await checkedResumeCampaign(fakeDb({ campaign: paused, updatedRows: [] }), target, pass)).toMatchObject({ ok: false, code: "changed" });
    expect(await checkedResumeCampaign(fakeDb({ campaign: paused, updatedRows: [{}, {}] }), target, pass)).toMatchObject({ ok: false, code: "changed" });
    expect(await checkedResumeCampaign(fakeDb({ campaign: paused, updateErr: true }), target, pass)).toMatchObject({ ok: false, code: "changed" });
  });

  it("admin endpoint and copilot are admin-gated and use the shared helper without substitution", () => {
    const admin = readFileSync("src/lib/admin-campaigns.functions.ts", "utf8");
    const block = admin.slice(admin.indexOf("adminCheckAndResumeCampaign"));
    expect(block).toMatch(/has_role[\s\S]*Forbidden: admin only[\s\S]*checkedResumeCampaign/);
    const cop = readFileSync("src/lib/support-copilot.functions.ts", "utf8");
    expect(cop).toMatch(/checkedResumeCampaign\(sb, \{ campaignId: data\.target, expectedAccountId: row\.account_id \}\)/);
    expect(cop).not.toMatch(/fall back to this tenant's single paused campaign/);
  });
});
