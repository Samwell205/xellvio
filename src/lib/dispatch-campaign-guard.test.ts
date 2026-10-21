import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  claimInitialScreening, updateIfDispatchable, reloadClaimedCampaign, recoverAfterTickError,
  distinctViolationCount,
} from "./dispatch-campaign-guard";

/** Minimal fake DB: one campaign row + a dispatch_locks table with the same
 * INSERT … ON CONFLICT DO NOTHING semantics as try_acquire_dispatch_lock. */
function fakeDb(initialStatus: string) {
  const campaign = { id: "c1", status: initialStatus, paused_reason: null as string | null };
  const locks = new Set<string>();
  const db = {
    campaign,
    rpc: async (_fn: string, { _name }: { _name: string }) => {
      await Promise.resolve();
      if (locks.has(_name)) return { data: false, error: null };
      locks.add(_name); return { data: true, error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: campaign.status } }) }) }),
      update: (patch: any) => ({ eq: () => ({ in: async (_c: string, allowed: string[]) => {
        if (allowed.includes(campaign.status)) Object.assign(campaign, patch);
        return { error: null };
      } }) }),
    }),
  };
  return db;
}

/** Fake with message counts for the tick-error path. */
function withMessages(db: any, counts: { leftover: number; planned: number; handed: number }, statusAt?: () => void) {
  const base = db.from;
  db.from = (t: string) => t !== "messages" ? base(t) : ({
    select: () => { let n = counts.planned; const q: any = {
      eq: () => q,
      in: (_c: string, v: string[]) => { n = v.includes("queued") ? counts.leftover : counts.handed; return q; },
      then: (r: any) => { statusAt?.(); return r({ count: n, error: null }); },
    }; return q; },
  });
  return db;
}

describe("Dispatcher coordination (production helpers)", () => {
  it("coordination failure defers — no unguarded fallback", async () => {
    expect(await claimInitialScreening({ rpc: async () => ({ data: null, error: { message: "down" } }) }, "c1", "x")).toBe("unavailable");
    expect(await claimInitialScreening({ rpc: async () => { throw new Error("net"); } }, "c1", "x")).toBe("unavailable");
  });

  it("12 concurrent claims for one revision yield exactly one screener", async () => {
    const db = fakeDb("queued");
    const r = await Promise.all(Array.from({ length: 12 }, () => claimInitialScreening(db, "c1", "body")));
    expect(r.filter((x) => x === "claimed")).toHaveLength(1);
  });

  it("reload after claim refuses a stopped campaign or an edited body", async () => {
    const stopped = fakeDb("blocked_content");
    expect(await reloadClaimedCampaign(stopped, { id: "c1", message_body: null })).toEqual({ ok: false, reason: "campaign_not_dispatchable" });
    const db: any = fakeDb("queued");
    db.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "c1", status: "queued", message_body: "new" } }) }) }) });
    expect(await reloadClaimedCampaign(db, { id: "c1", message_body: "old" })).toEqual({ ok: false, reason: "campaign_body_changed" });
    db.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "x" } }) }) }) });
    expect((await reloadClaimedCampaign(db, { id: "c1" })).ok).toBe(false);
  });

  it("tick error after a block preserves blocked_content (zero-row path cannot requeue)", async () => {
    const db = withMessages(fakeDb("blocked_content"), { leftover: 0, planned: 0, handed: 0 });
    expect(await recoverAfterTickError(db, "c1", new Error("boom"))).toBe("preserved");
    expect(db.campaign.status).toBe("blocked_content");
  });

  it("stop landing during error recovery is still preserved by the conditional write", async () => {
    const db: any = fakeDb("sending");
    withMessages(db, { leftover: 0, planned: 0, handed: 0 }, () => { db.campaign.status = "paused_by_user"; });
    await recoverAfterTickError(db, "c1", new Error("boom"));
    expect(db.campaign.status).toBe("paused_by_user");
  });

  it("a genuinely dispatchable campaign with nothing planned is requeued for retry", async () => {
    const db = withMessages(fakeDb("sending"), { leftover: 0, planned: 0, handed: 0 });
    expect(await recoverAfterTickError(db, "c1", new Error("boom"))).toBe("queued");
    expect(db.campaign.status).toBe("queued");
  });

  it("conditional update never overwrites a stopped state", async () => {
    const db = fakeDb("blocked_content");
    await updateIfDispatchable(db, "c1", { status: "paused" });
    expect(db.campaign.status).toBe("blocked_content");
  });

  it("dispatcher is wired to these guards (fails if integration is removed)", () => {
    const src = readFileSync("src/routes/api.public.dispatch-campaign.ts", "utf8");
    expect(src).toMatch(/claim === "unavailable"\) return \{ ok: false/);
    expect(src).toMatch(/reloadClaimedCampaign\(supabaseAdmin, campaign\)/);
    expect(src).toMatch(/recoverAfterTickError\(supabaseAdmin, c\.id, e\)/);
    expect(src).not.toMatch(/UNGUARDED_LEASE[^;]*screen/);
  });
});


describe("Repeat-abuse counting", () => {
  it("collapses duplicate checks of one campaign revision into a single violation", () => {
    const rows = [1, 2, 3, 4].map((i) => ({ id: `r${i}`, campaign_id: "c1", message_text: "same" }));
    expect(distinctViolationCount(rows)).toBe(1);
  });
  it("still counts three distinct violations so the existing 3-strike policy suspends", () => {
    expect(distinctViolationCount([
      { id: "a", campaign_id: "c1", message_text: "one" },
      { id: "b", campaign_id: "c2", message_text: "two" },
      { id: "c", campaign_id: null, message_text: "two" },
    ])).toBe(3);
  });
  it("an edited revision of the same campaign is a new violation", () => {
    expect(distinctViolationCount([
      { id: "a", campaign_id: "c1", message_text: "v1" },
      { id: "b", campaign_id: "c1", message_text: "v2" },
    ])).toBe(2);
  });
});
