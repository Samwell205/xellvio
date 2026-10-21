import { describe, it, expect, vi } from "vitest";
import {
  claimInitialScreening, currentCampaignStatus, updateIfDispatchable, isDispatchableStatus,
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

/** Mirrors the dispatcher slot order: live status → suspension pause →
 * one-time screening claim → screen → conditional block → provider send. */
async function runSlot(db: any, deps: { screen: () => Promise<"blocked" | "passed">; send: () => void; suspended: () => boolean }) {
  if (!isDispatchableStatus(await currentCampaignStatus(db, "c1"))) return "skip";
  if (deps.suspended()) { await updateIfDispatchable(db, "c1", { status: "paused", paused_reason: "Tenant sending suspended" }); return "suspended"; }
  if ((await claimInitialScreening(db, "c1", "body")) === "busy") return "busy";
  const r = await deps.screen();
  if (r === "blocked") { await updateIfDispatchable(db, "c1", { status: "blocked_content", paused_reason: "Blocked" }); return "blocked"; }
  deps.send(); return "sent";
}

describe("Dispatcher honours current campaign state", () => {
  it("12 stale slots of one snapshot screen once, stay blocked and never reach the provider", async () => {
    const db = fakeDb("queued");
    let suspended = false;
    const screen = vi.fn(async () => { suspended = true; return "blocked" as const; });
    const send = vi.fn();
    await Promise.all(Array.from({ length: 12 }, () => runSlot(db, { screen, send, suspended: () => suspended })));
    expect(screen).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(db.campaign.status).toBe("blocked_content");
  });

  it("an overlapping worker after suspension cannot overwrite blocked_content with paused", async () => {
    const db = fakeDb("blocked_content");
    const send = vi.fn();
    expect(await runSlot(db, { screen: async () => "passed", send, suspended: () => true })).toBe("skip");
    await updateIfDispatchable(db, "c1", { status: "paused", paused_reason: "Tenant sending suspended" });
    expect(db.campaign.status).toBe("blocked_content");
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to screening (not freezing) when the lock helper is unavailable", async () => {
    const db = { rpc: async () => ({ data: null, error: { message: "missing" } }) };
    expect(await claimInitialScreening(db, "c1", "x")).toBe("unguarded");
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
