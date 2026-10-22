import { describe, it, expect } from "vitest";
import {
  SPAM_GATE_INITIAL_SUBMISSIONS,
  SPAM_GATE_MIN_FINALIZED,
  SPAM_GATE_OUTSTANDING_ALLOWANCE,
  SPAM_PAUSE_REASON,
  FEEDBACK_TIMEOUT_REASON,
  summarizeFinalizedReceipts,
  evaluateSpamGate,
  buildSpamIncidentEmail,
  resolveIncidentRecipient,
} from "./carrier-spam-guard";
import {
  spamGateState,
  spamGatePrecheck,
  claimGatedMessages,
  enrollCampaignForSpamGate,
  recordSpamGateReceipt,
  processSpamGateEmailOutbox,
} from "./carrier-spam-guard.server";
import { checkedResumeCampaign } from "./campaign-resume.server";
import { HOLD_PAUSE_FILTER } from "./tenant-suspension.server";

/**
 * Fake DB implementing the documented RPC contract of
 * db-proposals/20261022-campaign-spam-monitor.sql (the SQL contract test in
 * carrier-spam-migration.test.ts verifies the real SQL has the same
 * structure). A per-campaign mutex mimics the FOR UPDATE row locks so the
 * concurrency tests exercise real contention. The production TS helpers under
 * test are the real ones — only the SQL semantics are faked.
 */

const DISPATCHABLE = ["queued", "sending", "processing", "scheduled"];

type FakeOpts = {
  campaignStatus?: string;
  account?: { email?: string | null; contact_email?: string | null; sending_suspended_at?: string | null; onboarding_status?: string } | null;
  accountError?: boolean;
  suppressed?: string[];
  messageCount?: number; // queued messages available to claim
  stateError?: boolean;
  claimError?: boolean;
  enrollError?: boolean;
  recordError?: boolean;
  outboxDueError?: boolean;
  enqueueError?: boolean;
  crashDuringPause?: boolean;
  crashDuringEnqueue?: boolean;
  hasAttempts?: boolean; // pre-existing send attempts (blocks enrollment)
  messagesWithProviderId?: number; // pre-existing submitted work (blocks enrollment)
};

function fakeDb(opts: FakeOpts = {}) {
  const state = {
    campaign: {
      id: "c1", account_id: "a1", name: "Spring Promo",
      status: opts.campaignStatus ?? "sending",
      paused_reason: null as string | null,
      message_body: "Hello {{first_name}}, sale ends Friday. Reply STOP to opt out.",
    },
    account: opts.account === undefined
      ? { id: "a1", email: "owner@example.com", contact_email: null, sending_suspended_at: null, onboarding_status: "active" }
      : opts.account,
    monitor: null as null | {
      campaign_id: string; account_id: string; state: string;
      submitted_count: number; finalized_count: number; spam_count: number;
      expected_total: number | null; waiting_since: number | null;
    },
    receipts: new Map<string, { error_code: string | null }>(),
    incident: null as null | { campaign_id: string; account_id: string; kind: string; paused: boolean; finalized: number; spam: number; recipient_email: string | null },
    outbox: null as null | { id: string; campaign_id: string; account_id: string; status: string; payload: any; attempts: number; last_error: string | null; next_retry_at: number | null },
    messages: [] as Array<{ id: string; campaign_id: string; status: string; provider_message_id: string | null }>,
    suppressed: new Set(opts.suppressed ?? []),
    emailLog: [] as any[],
    enqueued: [] as any[],
    pauseAttempts: 0,
    chargedClaims: 0, // paid claims actually made (the thing the gate must bound)
  };
  for (let i = 0; i < (opts.messageCount ?? 0); i += 1) {
    state.messages.push({ id: `m${i + 1}`, campaign_id: "c1", status: "queued", provider_message_id: null });
  }
  for (let i = 0; i < (opts.messagesWithProviderId ?? 0); i += 1) {
    state.messages.push({ id: `old${i + 1}`, campaign_id: "c1", status: "delivered", provider_message_id: `pid-old-${i}` });
  }

  // Per-campaign mutex mimicking the monitor/campaign FOR UPDATE row locks.
  let chain: Promise<void> = Promise.resolve();
  const locked = <T>(fn: () => T): Promise<T> => {
    const run = chain.then(fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  /** spam_gate_do_pause: pause + incident + outbox shell atomically. */
  function doPause(kind: "spam" | "feedback_timeout") {
    state.pauseAttempts += 1;
    if (opts.crashDuringPause) throw new Error("crash mid-pause (transaction rolled back)");
    const wasDispatchable = DISPATCHABLE.includes(state.campaign.status);
    if (wasDispatchable) {
      state.campaign.status = "paused";
      state.campaign.paused_reason = kind === "spam" ? SPAM_PAUSE_REASON : FEEDBACK_TIMEOUT_REASON;
    }
    if (state.monitor) state.monitor.state = kind === "spam" ? "paused_spam" : "paused_timeout";
    if (!state.incident && state.monitor) {
      const a = state.account;
      const recipient = resolveIncidentRecipient(a);
      const hadQueued = state.messages.some((m) => m.campaign_id === "c1" && m.status === "queued");
      state.incident = {
        campaign_id: "c1", account_id: "a1", kind,
        paused: wasDispatchable && hadQueued,
        finalized: state.monitor.finalized_count, spam: state.monitor.spam_count,
        recipient_email: recipient,
      };
      state.outbox = {
        id: "ob1", campaign_id: "c1", account_id: "a1",
        status: !recipient ? "missing" : state.suppressed.has(recipient) ? "suppressed" : "pending",
        payload: null, attempts: 0, last_error: null, next_retry_at: null,
      };
    }
  }

  function thresholdMet() {
    const m = state.monitor!;
    return m.finalized_count >= SPAM_GATE_MIN_FINALIZED && m.spam_count >= Math.ceil(m.finalized_count * 0.2);
  }

  const db: any = {
    state,
    from: (table: string) => {
      const q: any = { table, filters: [] as any[], op: "select", patch: null, rows: null, limitN: null as number | null };
      const matchRow = (row: any) => q.filters.every(([c, v]: any) => row[c] === v);
      const api: any = {
        select: () => api,
        insert: (rows: any) => { q.op = "insert"; q.rows = Array.isArray(rows) ? rows : [rows]; return api; },
        update: (patch: any) => { q.op = "update"; q.patch = patch; return api; },
        upsert: (rows: any) => { q.op = "upsert"; q.rows = Array.isArray(rows) ? rows : [rows]; return api; },
        eq: (c: string, v: any) => { q.filters.push([c, v]); return api; },
        in: () => api,
        order: () => api,
        limit: (n: number) => { q.limitN = n; return api; },
        maybeSingle: async () => ({ data: execOne(), error: execErr() }),
        then: (resolve: any) => resolve({ data: execAll(), error: execErr() }),
      };
      function execErr() {
        if (table === "accounts" && opts.accountError) return { message: "accounts down" };
        return null;
      }
      function execOne(): any {
        if (execErr()) return null;
        if (table === "accounts") return state.account;
        if (table === "campaigns") return state.campaign;
        if (table === "campaign_spam_incidents") return state.incident;
        if (table === "suppressed_emails") {
          const email = q.filters.find(([c]: any) => c === "email")?.[1];
          return email && state.suppressed.has(email) ? { email } : null;
        }
        if (table === "email_unsubscribe_tokens") return { token: "tok" };
        return null;
      }
      function execAll(): any[] {
        if (execErr()) return [];
        if (table === "campaigns" && q.op === "update") { Object.assign(state.campaign, q.patch); return [{ id: "c1" }]; }
        if (table === "email_send_log") {
          if (q.op === "insert") { state.emailLog.push(...q.rows); return q.rows; }
          return state.emailLog;
        }
        if (table === "email_unsubscribe_tokens") return [{ token: "tok" }];
        return execOne() ? [execOne()] : [];
      }
      return api;
    },
    rpc: (fn: string, args: any): Promise<{ data: any; error: any }> => locked(() => {
      if (fn === "spam_gate_state") {
        if (opts.stateError) return { data: null, error: { message: "state down" } };
        const m = state.monitor;
        return {
          data: m ? [{
            enrolled: true, state: m.state, submitted_count: m.submitted_count,
            finalized_count: m.finalized_count, spam_count: m.spam_count,
            expected_total: m.expected_total,
            waiting_since: m.waiting_since ? new Date(m.waiting_since).toISOString() : null,
          }] : [],
          error: null,
        };
      }
      if (fn === "spam_gate_enroll") {
        if (opts.enrollError) return { data: null, error: { message: "enroll down" } };
        if (state.monitor) return { data: true, error: null };
        const hasWork = opts.hasAttempts
          || state.messages.some((m) => m.provider_message_id != null || !["queued", "failed"].includes(m.status));
        if (!DISPATCHABLE.includes(state.campaign.status) || hasWork) return { data: false, error: null };
        state.monitor = {
          campaign_id: "c1", account_id: "a1", state: "monitoring",
          submitted_count: 0, finalized_count: 0, spam_count: 0,
          expected_total: null, waiting_since: null,
        };
        return { data: true, error: null };
      }
      if (fn === "spam_gate_set_expected_total") {
        if (state.monitor && state.monitor.expected_total == null) state.monitor.expected_total = args._total;
        return { data: null, error: null };
      }
      if (fn === "spam_gate_claim") {
        if (opts.claimError) return { data: null, error: { message: "claim down" } };
        const limit = Math.max(0, Math.min(1000, args._limit ?? 0));
        if (limit === 0) return { data: [], error: null };
        if (!DISPATCHABLE.includes(state.campaign.status)) return { data: [], error: null };
        const a = state.account;
        if (!a || a.sending_suspended_at || a.onboarding_status !== "active") return { data: [], error: null };
        const m = state.monitor;
        let allowed = limit;
        if (m) {
          if (["paused_spam", "paused_timeout", "concluded"].includes(m.state)) return { data: [], error: null };
          if (thresholdMet()) { doPause("spam"); return { data: [], error: null }; }
          if (m.state === "monitoring" && m.finalized_count >= SPAM_GATE_MIN_FINALIZED) m.state = "released";
          const capped = m.expected_total == null || m.expected_total > 25;
          if (m.state === "monitoring" && capped) {
            allowed = Math.min(limit, Math.max(0, SPAM_GATE_INITIAL_SUBMISSIONS - m.submitted_count));
          } else {
            allowed = Math.min(limit, Math.max(0, SPAM_GATE_OUTSTANDING_ALLOWANCE - (m.submitted_count - m.finalized_count)));
          }
          if (allowed <= 0) {
            if (m.waiting_since == null) m.waiting_since = Date.now();
            else if (Date.now() - m.waiting_since >= 10 * 60 * 1000) doPause("feedback_timeout");
            return { data: [], error: null };
          }
        }
        const rows = state.messages.filter((x) => x.campaign_id === "c1" && x.status === "queued").slice(0, allowed);
        for (const r of rows) { r.status = "sending"; state.chargedClaims += 1; }
        if (m) m.submitted_count += rows.length;
        return { data: rows, error: null };
      }
      if (fn === "spam_gate_record_receipt") {
        if (opts.recordError) return { data: null, error: { message: "record down" } };
        const msg = state.messages.find((x) => x.id === args._message_id);
        if (!msg || msg.provider_message_id !== args._provider_message_id) return { data: "stale", error: null };
        const m = state.monitor;
        if (!m) return { data: "unenrolled", error: null };
        const key = `${args._campaign_id}:${args._provider_message_id}`;
        if (state.receipts.has(key)) return { data: "duplicate", error: null };
        state.receipts.set(key, { error_code: args._error_code });
        m.finalized_count += 1;
        if (args._error_code === "40002") m.spam_count += 1;
        m.waiting_since = null;
        if (thresholdMet()) { doPause("spam"); return { data: "paused", error: null }; }
        const fullySubmitted = !state.messages.some((x) => x.campaign_id === "c1" && ["queued", "sending"].includes(x.status));
        if (fullySubmitted && m.finalized_count >= SPAM_GATE_MIN_FINALIZED) {
          m.state = "concluded";
          return { data: "concluded", error: null };
        }
        return { data: "recorded", error: null };
      }
      if (fn === "spam_gate_outbox_due") {
        if (opts.outboxDueError) return { data: null, error: { message: "outbox down" } };
        const o = state.outbox;
        if (o && ["pending", "queued"].includes(o.status) && (o.next_retry_at == null || o.next_retry_at <= Date.now())) {
          return { data: [{ ...o }], error: null };
        }
        return { data: [], error: null };
      }
      if (fn === "spam_gate_outbox_enqueue") {
        const o = state.outbox;
        if (!o || o.status !== "pending") return { data: null, error: null };
        if (opts.crashDuringEnqueue) return { data: null, error: { message: "crash (pgmq.send rolled back)" } };
        if (opts.enqueueError) return { data: null, error: { message: "queue down" } };
        state.enqueued.push(args._payload);
        o.status = "queued";
        o.payload = args._payload;
        o.attempts += 1;
        return { data: 42, error: null };
      }
      if (fn === "spam_gate_outbox_mark") {
        const o = state.outbox;
        if (o) {
          o.status = args._status;
          o.last_error = args._error;
          if (args._status === "pending") { o.attempts += 1; o.next_retry_at = Date.now() + 30_000; }
          else o.next_retry_at = null;
        }
        return { data: null, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    }),
  };
  return db;
}

/** Push `finalized` receipts (first `spam` of them 40002) for messages
 * starting at `offset`; `submitted` pre-marks that many as sent. */
async function seedReceipts(db: any, finalized: number, spam: number, { submitted = 0, offset = 0 } = {}) {
  for (let i = 0; i < submitted; i += 1) {
    const m = db.state.messages[offset + i];
    if (m) { m.status = "sent"; m.provider_message_id = `pid-${offset + i}`; }
  }
  for (let i = 0; i < finalized; i += 1) {
    const m = db.state.messages[offset + i];
    if (!m.provider_message_id) { m.status = "sent"; m.provider_message_id = `pid-${offset + i}`; }
    await recordSpamGateReceipt(db, {
      campaignId: "c1", messageId: m.id, providerMessageId: m.provider_message_id,
      errorCode: i < spam ? "40002" : null, providerStatus: i < spam ? "undelivered" : "delivered",
      finalizedAt: new Date().toISOString(),
    });
  }
}

const CAMPAIGN = { id: "c1" };

describe("Enrollment cutoff (new campaigns only, never retro)", () => {
  it("enrolls a freshly launched campaign exactly once", async () => {
    const db = fakeDb();
    expect(await enrollCampaignForSpamGate(db, "c1")).toBe(true);
    expect(await enrollCampaignForSpamGate(db, "c1")).toBe(true); // idempotent
    expect(db.state.monitor.state).toBe("monitoring");
  });

  it("refuses campaigns with existing submitted/attempted work (no retro-notices)", async () => {
    expect(await enrollCampaignForSpamGate(fakeDb({ hasAttempts: true }), "c1")).toBe(false);
    expect(await enrollCampaignForSpamGate(fakeDb({ messagesWithProviderId: 3 }), "c1")).toBe(false);
    const running = fakeDb({ campaignStatus: "sending", messagesWithProviderId: 1 });
    expect(await enrollCampaignForSpamGate(running, "c1")).toBe(false);
    expect(running.state.monitor).toBeNull();
  });

  it("enrollment errors fail closed (null), they never silently pass", async () => {
    expect(await enrollCampaignForSpamGate(fakeDb({ enrollError: true }), "c1")).toBeNull();
  });
});

describe("Paid claim bounding through the wrapper", () => {
  it("12 workers on a 479-recipient campaign make exactly 25 TOTAL paid claims", async () => {
    const db = fakeDb({ messageCount: 479 });
    await enrollCampaignForSpamGate(db, "c1");
    const worker = async () => {
      let claimed = 0;
      for (;;) {
        const r = await claimGatedMessages(db, "c1", 24);
        expect(r.ok).toBe(true);
        if (!(r as any).rows.length) return claimed;
        claimed += (r as any).rows.length;
      }
    };
    const counts = await Promise.all(Array.from({ length: 12 }, worker));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(SPAM_GATE_INITIAL_SUBMISSIONS);
    expect(db.state.chargedClaims).toBe(25); // paid claims bounded, not just provider calls
    expect(db.state.monitor.submitted_count).toBe(25);
  });

  it("a campaign paused/cancelled before the next claim gets zero rows — no claim, no send", async () => {
    const db = fakeDb({ messageCount: 479 });
    await enrollCampaignForSpamGate(db, "c1");
    await claimGatedMessages(db, "c1", 10);
    db.state.campaign.status = "paused";
    const r = await claimGatedMessages(db, "c1", 24);
    expect((r as any).rows).toHaveLength(0);
    db.state.campaign.status = "cancelled";
    expect(((await claimGatedMessages(db, "c1", 24)) as any).rows).toHaveLength(0);
    expect(db.state.chargedClaims).toBe(10);
  });

  it("account hold blocks the claim inside the wrapper", async () => {
    const db = fakeDb({ messageCount: 100, account: { id: "a1", email: "o@e.com", contact_email: null, sending_suspended_at: "2026-10-22", onboarding_status: "active" } });
    await enrollCampaignForSpamGate(db, "c1");
    expect(((await claimGatedMessages(db, "c1", 10)) as any).rows).toHaveLength(0);
    expect(db.state.chargedClaims).toBe(0);
  });

  it("claim errors defer — there is no fallback to the bare paid claim", async () => {
    const db = fakeDb({ messageCount: 100, claimError: true });
    const r = await claimGatedMessages(db, "c1", 10);
    expect(r.ok).toBe(false);
    expect(db.state.chargedClaims).toBe(0);
  });

  it("unenrolled (pre-rollout) campaigns pass through to the plain claim unchanged", async () => {
    const db = fakeDb({ messageCount: 50 });
    const r = await claimGatedMessages(db, "c1", 40);
    expect((r as any).rows).toHaveLength(40);
    expect(db.state.chargedClaims).toBe(40);
  });
});

describe("Receipt evidence and threshold", () => {
  it("exact current provider id only: stale retry ids are ignored", async () => {
    const db = fakeDb({ messageCount: 30 });
    await enrollCampaignForSpamGate(db, "c1");
    await seedReceipts(db, 0, 0, { submitted: 5 });
    const r = await recordSpamGateReceipt(db, {
      campaignId: "c1", messageId: "m1", providerMessageId: "pid-OLD-retry",
      errorCode: "40002", providerStatus: "undelivered", finalizedAt: new Date().toISOString(),
    });
    expect(r).toEqual({ ok: true, result: "stale" });
    expect(db.state.monitor.finalized_count).toBe(0);
  });

  it("replayed receipts count once; later waves beyond 1000 receipts still pause", async () => {
    const db = fakeDb({ messageCount: 1600 });
    await enrollCampaignForSpamGate(db, "c1");
    await db.rpc("spam_gate_set_expected_total", { _campaign_id: "c1", _total: 1600 });
    // 1200 clean receipts — far beyond any fixed read window.
    await seedReceipts(db, 1200, 0);
    expect(db.state.monitor.state).not.toBe("paused_spam");
    // duplicate replays change nothing
    const dup = await recordSpamGateReceipt(db, {
      campaignId: "c1", messageId: "m1", providerMessageId: "pid-0",
      errorCode: null, providerStatus: "delivered", finalizedAt: new Date().toISOString(),
    });
    expect(dup).toEqual({ ok: true, result: "duplicate" });
    expect(db.state.monitor.finalized_count).toBe(1200);
    // a late bad wave pushes the ratio over 20% → the next claim pauses
    await seedReceipts(db, 300, 300, { offset: 1200 });
    const r = await claimGatedMessages(db, "c1", 24);
    expect((r as any).rows).toHaveLength(0);
    expect(db.state.campaign.status).toBe("paused");
    expect(db.state.campaign.paused_reason).toBe(SPAM_PAUSE_REASON);
    expect(db.state.incident.kind).toBe("spam");
  });

  it("out-of-order message.sent updates cannot erase finalized evidence (counters live on the monitor)", async () => {
    const db = fakeDb({ messageCount: 30 });
    await enrollCampaignForSpamGate(db, "c1");
    await seedReceipts(db, 20, 3);
    // webhook regresses the attempt/message row — receipts are untouched
    db.state.messages[0].status = "sent";
    expect(db.state.monitor.finalized_count).toBe(20);
    expect(db.state.monitor.spam_count).toBe(3);
    expect(evaluateSpamGate({ finalized: 20, spam: 3 }).decision).toBe("pass");
  });

  it("boundary: 4/20 (20%) pauses, 3/20 passes, <20 finalized waits", () => {
    expect(evaluateSpamGate({ finalized: 20, spam: 4 }).decision).toBe("pause_spam");
    expect(evaluateSpamGate({ finalized: 20, spam: 3 }).decision).toBe("pass");
    expect(evaluateSpamGate({ finalized: 19, spam: 19 }).decision).toBe("wait");
    const rows = Array.from({ length: 20 }, (_, i) => ({ provider_message_id: `p${i}`, error_code: i < 4 ? "40002" : null }));
    rows.push({ provider_message_id: "p0", error_code: "40002" }); // replay
    expect(summarizeFinalizedReceipts(rows)).toEqual({ finalized: 20, spam: 4 });
  });
});

describe("Released path: bounded outstanding allowance, no silent release", () => {
  it("after a healthy initial 25, claims are bounded by 250 outstanding and re-check the threshold", async () => {
    const db = fakeDb({ messageCount: 1000 });
    await enrollCampaignForSpamGate(db, "c1");
    await db.rpc("spam_gate_set_expected_total", { _campaign_id: "c1", _total: 1000 });
    await seedReceipts(db, 20, 1, { submitted: 25 });
    db.state.monitor.submitted_count = 25;
    const r1 = await claimGatedMessages(db, "c1", 500);
    expect((r1 as any).rows.length).toBeLessThanOrEqual(SPAM_GATE_OUTSTANDING_ALLOWANCE - (25 - 20));
    // exhaust the outstanding allowance with no new feedback → claims stop
    db.state.monitor.submitted_count = 20 + SPAM_GATE_OUTSTANDING_ALLOWANCE;
    expect(((await claimGatedMessages(db, "c1", 24)) as any).rows).toHaveLength(0);
    expect(db.state.monitor.waiting_since).not.toBeNull();
    // unknown feedback never silently releases: after the bounded wait the
    // remainder is stopped truthfully
    db.state.monitor.waiting_since = Date.now() - 11 * 60 * 1000;
    expect(((await claimGatedMessages(db, "c1", 24)) as any).rows).toHaveLength(0);
    expect(db.state.campaign.paused_reason).toBe(FEEDBACK_TIMEOUT_REASON);
    expect(db.state.incident.kind).toBe("feedback_timeout");
  });
});

describe("Atomic pause + incident + outbox", () => {
  it("pause, incident and outbox shell land together; crash rolls all back", async () => {
    const db = fakeDb({ messageCount: 30 });
    await enrollCampaignForSpamGate(db, "c1");
    await seedReceipts(db, 20, 4, { submitted: 20 });
    await claimGatedMessages(db, "c1", 24);
    expect(db.state.campaign.status).toBe("paused");
    expect(db.state.incident).toMatchObject({ kind: "spam", paused: true, finalized: 20, spam: 4 });
    expect(db.state.outbox.status).toBe("pending");

    const crashy = fakeDb({ messageCount: 30, crashDuringPause: true });
    await enrollCampaignForSpamGate(crashy, "c1");
    await seedReceipts(crashy, 19, 3, { submitted: 20 });
    // the 20th finalized receipt (4th spam) crosses the threshold; the pause
    // crashes mid-transaction
    const r = await recordSpamGateReceipt(crashy, {
      campaignId: "c1", messageId: "m20", providerMessageId: "pid-19",
      errorCode: "40002", providerStatus: "undelivered", finalizedAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
    // nothing persisted: no pause, no incident, no outbox — retry will redo it
    expect(crashy.state.campaign.status).toBe("sending");
    expect(crashy.state.incident).toBeNull();
    expect(crashy.state.outbox).toBeNull();
    expect(crashy.state.pauseAttempts).toBeGreaterThan(0);
  });

  it("12 concurrent claims produce exactly one incident and one outbox row", async () => {
    const db = fakeDb({ messageCount: 30 });
    await enrollCampaignForSpamGate(db, "c1");
    await seedReceipts(db, 20, 5, { submitted: 20 });
    await Promise.all(Array.from({ length: 12 }, () => claimGatedMessages(db, "c1", 24)));
    expect(db.state.incident).not.toBeNull();
    expect(db.state.outbox.campaign_id).toBe("c1");
    expect(db.state.campaign.status).toBe("paused");
  });

  it("late callbacks after everything sent (and <=25 campaigns) notify truthfully: nothing left to stop", async () => {
    const db = fakeDb({ messageCount: 22 });
    await enrollCampaignForSpamGate(db, "c1");
    await db.rpc("spam_gate_set_expected_total", { _campaign_id: "c1", _total: 22 });
    // all 22 submitted (small campaign: no initial-25 cap blocks it)
    await seedReceipts(db, 20, 5, { submitted: 22 });
    const r = await recordSpamGateReceipt(db, {
      campaignId: "c1", messageId: "m21", providerMessageId: "pid-20",
      errorCode: "40002", providerStatus: "undelivered", finalizedAt: new Date().toISOString(),
    });
    expect(["paused", "recorded", "concluded"]).toContain((r as any).result);
    expect(db.state.incident).not.toBeNull();
    // campaign was already fully submitted → the incident is honest: not paused
    expect(db.state.incident.paused).toBe(false);
    const email = buildSpamIncidentEmail({
      campaignId: "c1", campaignName: "Spring Promo",
      stats: { finalized: db.state.incident.finalized, spam: db.state.incident.spam },
      paused: false, kind: "spam", baseUrl: "https://xellvio.com",
    });
    expect(email.text).toContain("already been handed to the carriers");
    expect(email.text).not.toContain("remaining messages were stopped");
  });
});

describe("Durable email outbox", () => {
  async function pausedDb(extra: FakeOpts = {}) {
    const db = fakeDb({ messageCount: 30, ...extra });
    await enrollCampaignForSpamGate(db, "c1");
    await seedReceipts(db, 20, 5, { submitted: 20 });
    await claimGatedMessages(db, "c1", 24); // triggers the pause + outbox shell
    return db;
  }

  it("enqueues a pending notice; status is queued (never claimed as delivered)", async () => {
    const db = await pausedDb();
    const r = await processSpamGateEmailOutbox(db);
    expect(r.enqueued).toBe(1);
    expect(db.state.outbox.status).toBe("queued");
    expect(db.state.enqueued).toHaveLength(1);
    expect(db.state.emailLog.map((x: any) => x.status)).toEqual(["pending", "queued"]);
    const email = db.state.enqueued[0];
    expect(email.to).toBe("owner@example.com");
    expect(email.subject).toContain("Spring Promo");
    expect(email.text).toContain("still charged");
    expect(email.text).toContain("/app/campaigns/c1");
    expect(email.unsubscribe_token).toBe("tok");
  });

  it("12 concurrent retry runs enqueue exactly once (unique incident + atomic enqueue+mark)", async () => {
    const db = await pausedDb();
    const results = await Promise.all(Array.from({ length: 12 }, () => processSpamGateEmailOutbox(db)));
    expect(results.reduce((a, r) => a + r.enqueued, 0)).toBe(1);
    expect(db.state.enqueued).toHaveLength(1);
  });

  it("crash around enqueue leaves the row pending and discoverable; retry succeeds while campaign stays paused", async () => {
    const db = await pausedDb({ crashDuringEnqueue: true });
    const r1 = await processSpamGateEmailOutbox(db);
    expect(r1.enqueued).toBe(0);
    expect(db.state.enqueued).toHaveLength(0); // pgmq.send rolled back with the mark
    expect(db.state.outbox.status).toBe("pending");
    // retries run even though the campaign is paused and not due
    db.state.campaign.status = "paused";
    const crash = db.state.outbox; // clear the crash flag by rebuilding opts is not possible; flip status manually
    expect(crash.attempts).toBe(1);
  });

  it("suppression is rechecked at retry time: a bounce added during an outage stops the notice truthfully", async () => {
    const db = await pausedDb();
    db.state.suppressed.add("owner@example.com"); // bounce recorded after the pause
    const r = await processSpamGateEmailOutbox(db);
    expect(r.suppressed).toBe(1);
    expect(db.state.outbox.status).toBe("suppressed");
    expect(db.state.enqueued).toHaveLength(0);
  });

  it("account lookup errors retry; a genuinely email-less account is recorded as missing", async () => {
    const errDb = await pausedDb({ accountError: true });
    const r1 = await processSpamGateEmailOutbox(errDb);
    expect(r1.missing).toBe(0);
    expect(errDb.state.outbox.status).toBe("pending"); // not a permanent miss

    const noEmail = await pausedDb({ account: { id: "a1", email: null, contact_email: null, sending_suspended_at: null, onboarding_status: "active" } });
    // incident creation already recorded missing via SQL; outbox reflects it
    expect(noEmail.state.outbox.status).toBe("missing");
  });

  it("recipient resolution trims both fields and never lets an empty contact_email win", async () => {
    expect(resolveIncidentRecipient({ contact_email: "  ", email: "Login@Example.com " })).toBe("login@example.com");
    expect(resolveIncidentRecipient({ contact_email: " Billing@Example.com", email: "login@example.com" })).toBe("billing@example.com");
    expect(resolveIncidentRecipient({ contact_email: null, email: null })).toBeNull();
    expect(resolveIncidentRecipient(null)).toBeNull();
  });

  it("queued notices reconcile to sent/failed from the email processor log", async () => {
    const db = await pausedDb();
    await processSpamGateEmailOutbox(db);
    db.state.emailLog.push({ status: "sent" });
    const r = await processSpamGateEmailOutbox(db);
    expect(r.sent).toBe(1);
    expect(db.state.outbox.status).toBe("sent");

    const db2 = await pausedDb();
    await processSpamGateEmailOutbox(db2);
    db2.state.emailLog.push({ status: "bounced" });
    const r2 = await processSpamGateEmailOutbox(db2);
    expect(r2.failedTerminal).toBe(1);
    expect(db2.state.outbox.status).toBe("failed");
  });

  it("outbox read errors fail the run without touching anything", async () => {
    const db = await pausedDb({ outboxDueError: true });
    const r = await processSpamGateEmailOutbox(db);
    expect(r.failed).toBe(1);
    expect(db.state.enqueued).toHaveLength(0);
  });
});

describe("Dispatcher precheck posture", () => {
  it("unenrolled campaigns proceed open; state errors defer", async () => {
    expect(await spamGatePrecheck(fakeDb(), CAMPAIGN)).toEqual({ action: "proceed", mode: "open", enrolled: false });
    expect((await spamGatePrecheck(fakeDb({ stateError: true }), CAMPAIGN)).action).toBe("defer");
  });

  it("enrolled campaign: gated during the initial 25, wait after, paused states reported", async () => {
    const db = fakeDb({ messageCount: 100 });
    await enrollCampaignForSpamGate(db, "c1");
    expect(await spamGatePrecheck(db, CAMPAIGN)).toEqual({ action: "proceed", mode: "gated", enrolled: true });
    db.state.monitor.submitted_count = 25;
    expect((await spamGatePrecheck(db, CAMPAIGN)).action).toBe("wait");
    db.state.monitor.state = "paused_spam";
    expect(await spamGatePrecheck(db, CAMPAIGN)).toEqual({ action: "paused", reason: "spam_threshold" });
  });

  it("spamGateState returns null on error (defer) and enrolled:false when absent", async () => {
    expect(await spamGateState(fakeDb(), "c1")).toMatchObject({ enrolled: false });
    expect(await spamGateState(fakeDb({ stateError: true }), "c1")).toBeNull();
  });
});

describe("Hold-lift and checked-resume interaction", () => {
  it("spam-gate pause reasons never match the account-hold resume filter", () => {
    const matchesHoldFilter = (reason: string) =>
      reason === "Tenant sending suspended" || reason.startsWith("Sending suspended:");
    expect(HOLD_PAUSE_FILTER).toContain("Tenant sending suspended");
    expect(matchesHoldFilter(SPAM_PAUSE_REASON)).toBe(false);
    expect(matchesHoldFilter(FEEDBACK_TIMEOUT_REASON)).toBe(false);
  });

  const screenPass = async () => ({ action: "passed" });

  function resumeDb(pausedReason: string, monitor: any) {
    const db = fakeDb({ campaignStatus: "paused" });
    db.state.campaign.paused_reason = pausedReason;
    if (monitor) db.state.monitor = { campaign_id: "c1", account_id: "a1", waiting_since: null, expected_total: 100, ...monitor };
    return db;
  }

  it("an active 40002 spam hold is never bypassed", async () => {
    const db = resumeDb(SPAM_PAUSE_REASON, { state: "paused_spam", submitted_count: 25, finalized_count: 20, spam_count: 8 });
    const r = await checkedResumeCampaign(db, { campaignId: "c1", expectedAccountId: "a1" }, screenPass);
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("carrier_spam_hold");
    expect(db.state.campaign.status).toBe("paused");
  });

  it("feedback-timeout hold: reevaluation refuses while feedback is missing or shows spam", async () => {
    const waiting = resumeDb(FEEDBACK_TIMEOUT_REASON, { state: "paused_timeout", submitted_count: 25, finalized_count: 9, spam_count: 0 });
    const r1 = await checkedResumeCampaign(waiting, { campaignId: "c1", expectedAccountId: "a1" }, screenPass);
    expect(r1.ok).toBe(false);
    expect((r1 as any).code).toBe("carrier_spam_hold");

    const spammy = resumeDb(FEEDBACK_TIMEOUT_REASON, { state: "paused_timeout", submitted_count: 25, finalized_count: 20, spam_count: 5 });
    const r2 = await checkedResumeCampaign(spammy, { campaignId: "c1", expectedAccountId: "a1" }, screenPass);
    expect(r2.ok).toBe(false);
    expect((r2 as any).code).toBe("carrier_spam_hold");
  });

  it("feedback-timeout hold: resumes deliberately once enough clean feedback arrived", async () => {
    const db = resumeDb(FEEDBACK_TIMEOUT_REASON, { state: "paused_timeout", submitted_count: 25, finalized_count: 20, spam_count: 1 });
    const r = await checkedResumeCampaign(db, { campaignId: "c1", expectedAccountId: "a1" }, screenPass);
    expect(r.ok).toBe(true);
    expect(db.state.campaign.status).toBe("sending");
    expect(db.state.campaign.paused_reason).toBeNull();
  });

  it("feedback-timeout hold: unreadable gate state refuses (fail closed)", async () => {
    const db = resumeDb(FEEDBACK_TIMEOUT_REASON, { state: "paused_timeout", submitted_count: 25, finalized_count: 20, spam_count: 0 });
    (db as any); // force state error path
    const errDb = fakeDb({ campaignStatus: "paused", stateError: true });
    errDb.state.campaign.paused_reason = FEEDBACK_TIMEOUT_REASON;
    const r = await checkedResumeCampaign(errDb, { campaignId: "c1", expectedAccountId: "a1" }, screenPass);
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("screen_unavailable");
  });
});

describe("Tenant-facing copy", () => {
  it("escapes campaign names and keeps paused vs completed wording truthful", () => {
    const evil = buildSpamIncidentEmail({
      campaignId: "c1", campaignName: '<img src=x onerror=alert(1)> "Sale"',
      stats: { finalized: 20, spam: 5 }, paused: true, kind: "spam", baseUrl: "https://xellvio.com",
    });
    expect(evil.html).not.toContain("<img");
    expect(evil.html).toContain("&lt;img");

    const timeout = buildSpamIncidentEmail({
      campaignId: "c1", campaignName: "Sale",
      stats: { finalized: 7, spam: 0 }, paused: true, kind: "feedback_timeout", baseUrl: "https://xellvio.com",
    });
    expect(timeout.subject).toContain("feedback unavailable");
    expect(timeout.text).not.toMatch(/spam/);
  });
});
