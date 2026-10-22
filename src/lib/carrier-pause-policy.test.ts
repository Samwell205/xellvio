// Owner rule: monitor signed final carrier receipts passively. Repeated 40002
// results pause remaining sends and notify the tenant; no feedback wait/cap.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSrc = readFileSync(resolve(__dirname, "../routes/api.public.dispatch-campaign.ts"), "utf8");

describe("Carrier spam-rejection pause policy", () => {
  it("the dispatcher is wired to the spam gate (fails if the integration is removed)", () => {
    expect(routeSrc).not.toMatch(/spamGatePrecheck|spam_gate_can_send|canSendClaimedCampaignMessage/);
    expect(routeSrc).not.toMatch(/spamGateState\(/);
    // every paid claim goes through the wrapper — never the bare claim
    expect(routeSrc).toMatch(/claimGatedMessages\(supabaseAdmin, campaign\.id/);
    expect(routeSrc).not.toMatch(/rpc\("claim_campaign_messages"/);
    expect(routeSrc).toMatch(/enrollCampaignForSpamGate\(supabaseAdmin, campaign\.id\)/);
    expect(routeSrc).toMatch(/processSpamGateEmailOutbox\(supabaseAdmin/);
  });

  it("the receipt webhook feeds the gate after recording final evidence", () => {
    const webhookSrc = readFileSync(resolve(__dirname, "../routes/api.public.telnyx-status.ts"), "utf8");
    expect(webhookSrc).toMatch(/recordSpamGateReceipt\(supabaseAdmin/);
    // gate errors propagate so the carrier redelivers the signed event
    expect(webhookSrc).toMatch(/if \(!gate\.ok\) throw/);
  });

  it("the old blanket relaxations stay removed — no preflight canary, no unguarded bypass", () => {
    expect(routeSrc).not.toMatch(/Paused by carrier preflight/);
    expect(routeSrc).not.toMatch(/carrierPreflight|carrierSpamBlockRate/);
  });

  it("gate thresholds are the owner-chosen values", async () => {
    const g = await import("./carrier-spam-guard");
    expect("SPAM_GATE_MIN_RECIPIENTS" in g).toBe(false);
    expect("SPAM_GATE_INITIAL_SUBMISSIONS" in g).toBe(false);
    expect("SPAM_GATE_OUTSTANDING_ALLOWANCE" in g).toBe(false);
    expect("SPAM_GATE_FEEDBACK_WAIT_MS" in g).toBe(false);
    expect(g.SPAM_GATE_MIN_FINALIZED).toBe(20);
    expect(g.SPAM_GATE_SPAM_CODE).toBe("40002");
    expect(g.SPAM_GATE_SPAM_RATIO).toBe(0.2);
  });

  it("spam-gate pauses stay distinct from account holds and user stops", async () => {
    const g = await import("./carrier-spam-guard");
    const { HOLD_PAUSE_FILTER } = await import("./tenant-suspension.server");
    expect(HOLD_PAUSE_FILTER).not.toContain(g.SPAM_PAUSE_REASON);
    expect(HOLD_PAUSE_FILTER).not.toContain(g.FEEDBACK_TIMEOUT_REASON);
    expect(g.SPAM_PAUSE_REASON).not.toBe(g.FEEDBACK_TIMEOUT_REASON);
    expect(g.isSpamGateReason(g.SPAM_PAUSE_REASON)).toBe(true);
    expect(g.isSpamGateReason(g.FEEDBACK_TIMEOUT_REASON)).toBe(true);
    expect(g.isSpamGateReason("Tenant sending suspended")).toBe(false);
    expect(g.isSpamGateReason("Paused by user")).toBe(false);
  });
});
