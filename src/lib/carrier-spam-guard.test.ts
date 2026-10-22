import { describe, it, expect } from "vitest";
import {
  SPAM_GATE_INITIAL_SUBMISSIONS,
  SPAM_GATE_MIN_FINALIZED,
  SPAM_PAUSE_REASON,
  FEEDBACK_TIMEOUT_REASON,
  SPAM_GATE_INCIDENT_EVENT,
  spamGateSlotPrefix,
  summarizeFinalizedReceipts,
  evaluateSpamGate,
  buildSpamIncidentEmail,
} from "./carrier-spam-guard";
import {
  tryClaimGateSubmission,
  spamGatePrecheck,
  pauseCampaignForSpamGate,
  recordSpamGateIncident,
  retrySpamGateIncidentEmails,
  concludeMonitoredCampaign,
} from "./carrier-spam-guard.server";
import { checkedResumeCampaign } from "./campaign-resume.server";
import { HOLD_PAUSE_FILTER } from "./tenant-suspension.server";

/**
 * Fake DB with the same semantics the helpers rely on: dispatch_locks is an
 * atomic INSERT … ON CONFLICT DO NOTHING set; campaign updates are
 * status-conditional; receipts come from message_send_attempts.
 */
function fakeDb(opts: {
  locks?: Array<[string, string]>; // [name, acquired_at ISO]
  lockError?: boolean;
  receipts?: any[];
  receiptError?: boolean;
  campaign?: { status: string; paused_reason?: string | null } | null;
  account?: { email?: string | null; contact_email?: string | null } | null;
  suppressed?: boolean;
  enqueueError?: boolean;
} = {}) {
  const state = {
    locks: new Map<string, string>(opts.locks ?? []),
    receipts: opts.receipts ?? [],
    campaign: opts.campaign === undefined ? { status: "sending", paused_reason: null } : opts.campaign,
    account: opts.account === undefined ? { email: "owner@example.com", contact_email: null } : opts.account,
    suppressed: opts.suppressed ?? false,
    enqueueError: opts.enqueueError ?? false,
    events: [] as any[],
    emailLog: [] as any[],
    enqueued: [] as any[],
    eventSeq: 0,
  };

  function match(row: any, filters: any[]): boolean {
    return filters.every(([op, col, v]) => {
      const value = col === "payload->>email_status" ? row.payload?.email_status : row[col];
      if (op === "eq") return value === v;
      if (op === "in") return (v as any[]).includes(value);
      if (op === "like") return String(value ?? "").startsWith(String(v).replace(/%$/, ""));
      if (op === "not") return !(value == null);
      return true;
    });
  }

  function query(table: string) {
    const q: any = { op: "select", filters: [] as any[], patch: null, rows: null as any, limit: null as number | null };
    const api: any = {
      select: () => api,
      insert: (rows: any) => { q.op = "insert"; q.rows = Array.isArray(rows) ? rows : [rows]; return api; },
      update: (patch: any) => { q.op = "update"; q.patch = patch; return api; },
      upsert: (rows: any) => { q.op = "upsert"; q.rows = Array.isArray(rows) ? rows : [rows]; return api; },
      eq: (c: string, v: any) => { q.filters.push(["eq", c, v]); return api; },
      in: (c: string, v: any[]) => { q.filters.push(["in", c, v]); return api; },
      not: (c: string, _o: string, v: any) => { q.filters.push(["not", c, v]); return api; },
      like: (c: string, v: string) => { q.filters.push(["like", c, v]); return api; },
      filter: (c: string, _o: string, v: any) => { q.filters.push(["eq", c, v]); return api; },
      order: () => api,
      limit: (n: number) => { q.limit = n; return api; },
      maybeSingle: async () => {
        const r = exec(table, q);
        return { data: r.rows[0] ?? null, error: r.error };
      },
      then: (resolve: any, reject: any) => {
        try {
          const r = exec(table, q);
          resolve({ data: r.rows, error: r.error, count: r.rows.length });
        } catch (e) { reject(e); }
      },
    };
    return api;
  }

  function exec(table: string, q: any): { rows: any[]; error: any; count?: number } {
    if (table === "dispatch_locks") {
      if (opts.lockError) return { rows: [], error: { message: "locks down" } };
      const rows = [...state.locks.entries()]
        .map(([name, acquired_at]) => ({ name, acquired_at }))
        .filter((r) => match(r, q.filters));
      return { rows, error: null };
    }
    if (table === "message_send_attempts") {
      if (opts.receiptError) return { rows: [], error: { message: "stats down" } };
      let rows = state.receipts.filter((r) => r.finalized_at != null);
      if (q.limit) rows = rows.slice(0, q.limit);
      return { rows, error: null };
    }
    if (table === "campaigns") {
      if (q.op === "update") {
        const live = state.campaign;
        const allowed = q.filters.find(([op]: any) => op === "in")?.[2] as string[] | undefined;
        if (!live || (allowed && !allowed.includes(live.status))) return { rows: [], error: null };
        Object.assign(live, q.patch);
        return { rows: [{ id: "c1" }], error: null };
      }
      return { rows: state.campaign ? [{ id: "c1", account_id: "a1", name: "Test", ...state.campaign }] : [], error: null };
    }
    if (table === "accounts") return { rows: state.account ? [state.account] : [], error: null };
    if (table === "suppressed_emails") return { rows: state.suppressed ? [{ email: "owner@example.com" }] : [], error: null };
    if (table === "email_unsubscribe_tokens") return { rows: [{ token: "tok" }], error: null };
    if (table === "email_send_log") {
      if (q.op === "insert") { state.emailLog.push(...q.rows); return { rows: q.rows, error: null }; }
      return { rows: state.emailLog, error: null };
    }
    if (table === "events") {
      if (q.op === "insert") {
        const inserted = q.rows.map((r: any) => ({ id: `e${++state.eventSeq}`, created_at: new Date().toISOString(), ...r }));
        state.events.push(...inserted);
        return { rows: inserted.map((r: any) => ({ id: r.id })), error: null };
      }
      if (q.op === "update") {
        const id = q.filters.find(([op, c]: any) => op === "eq" && c === "id")?.[2];
        const row = state.events.find((e) => e.id === id);
        if (row) Object.assign(row, q.patch);
        return { rows: row ? [row] : [], error: null };
      }
      const rows = state.events.filter((r) => match(r, q.filters));
      return { rows: q.limit ? rows.slice(0, q.limit) : rows, error: null };
    }
    return { rows: [], error: null };
  }

  const db: any = {
    state,
    from: (table: string) => query(table),
    rpc: async (fn: string, args: any) => {
      if (fn === "try_acquire_dispatch_lock") {
        if (opts.lockError) return { data: null, error: { message: "locks down" } };
        const name = args._name as string;
        if (state.locks.has(name)) return { data: false, error: null };
        state.locks.set(name, new Date().toISOString());
        return { data: true, error: null };
      }
      if (fn === "enqueue_email") {
        if (state.enqueueError) return { data: null, error: { message: "queue down" } };
        state.enqueued.push(args.payload);
        return { data: null, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
  };
  return db;
}

function receipt(id: string, code: string | null, status = "delivered") {
  return { provider_message_id: id, message_id: `m-${id}`, error_code: code, provider_status: status, finalized_at: "2026-10-22T00:00:00Z" };
}
/** n finalized receipts with `spam` 40002 refusals, plus duplicate replays. */
function receiptSet(finalized: number, spam: number, { duplicates = 0, sentEvidence = false } = {}) {
  const rows: any[] = [];
  for (let i = 0; i < finalized; i += 1) {
    const isSpam = i < spam;
    rows.push(receipt(`p${i}`, isSpam ? "40002" : null, sentEvidence && isSpam ? "sent" : isSpam ? "undelivered" : "delivered"));
  }
  for (let i = 0; i < duplicates; i += 1) rows.push(receipt(`p${i % Math.max(1, finalized)}`, i < spam ? "40002" : null));
  return rows;
}

const CAMPAIGN = { id: "c1", account_id: "a1", name: "Spring Promo" };

describe("Initial submission gate (25 across all workers)", () => {
  it("12 overlapping workers on a 479-recipient campaign claim exactly 25 total", async () => {
    const db = fakeDb();
    const worker = async () => {
      let claimed = 0;
      for (;;) {
        const r = await tryClaimGateSubmission(db, CAMPAIGN.id);
        if (r === "claimed") { claimed += 1; continue; }
        expect(r).toBe("full");
        return claimed;
      }
    };
    const counts = await Promise.all(Array.from({ length: 12 }, worker));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(SPAM_GATE_INITIAL_SUBMISSIONS);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(25);
  });

  it("fails closed when the lock state cannot be read", async () => {
    const db = fakeDb({ lockError: true });
    expect(await tryClaimGateSubmission(db, CAMPAIGN.id)).toBe("unavailable");
    expect((await spamGatePrecheck(db, CAMPAIGN)).action).toBe("defer");
  });
});

describe("Spam-threshold evaluation on distinct finalized receipts", () => {
  it("20 finalized with 4 spam (20%) pauses; 3 spam (15%) does not", () => {
    expect(evaluateSpamGate({ finalized: 20, spam: 4 }).decision).toBe("pause_spam");
    expect(evaluateSpamGate({ finalized: 20, spam: 3 }).decision).toBe("pass");
    expect(evaluateSpamGate({ finalized: SPAM_GATE_MIN_FINALIZED - 1, spam: 19 }).decision).toBe("wait");
  });

  it("duplicate/out-of-order receipts count once; sent rows with finalized 40002 evidence count as spam", () => {
    const rows = receiptSet(20, 4, { duplicates: 40, sentEvidence: true });
    const stats = summarizeFinalizedReceipts(rows);
    expect(stats).toEqual({ finalized: 20, spam: 4 });
    expect(evaluateSpamGate(stats).decision).toBe("pause_spam");
  });

  it("landline 40001 and invalid 40012 never trigger a spam pause", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => receipt(`l${i}`, "40001", "undelivered")),
      ...Array.from({ length: 10 }, (_, i) => receipt(`v${i}`, "40012", "undelivered")),
    ];
    const stats = summarizeFinalizedReceipts(rows);
    expect(stats).toEqual({ finalized: 20, spam: 0 });
    expect(evaluateSpamGate(stats).decision).toBe("pass");
  });
});

describe("Gate decisions in the dispatcher precheck", () => {
  const spentLocks = (startedAt: string) =>
    Array.from({ length: 25 }, (_, i) => [`spamgate:c1:sub:${i + 1}`, startedAt] as [string, string]);

  it("gate spent + spam threshold pauses the campaign with the spam reason", async () => {
    const db = fakeDb({
      locks: spentLocks(new Date().toISOString()),
      receipts: receiptSet(20, 4),
    });
    const r = await spamGatePrecheck(db, CAMPAIGN);
    expect(r).toEqual({ action: "paused", reason: "spam_threshold" });
    expect(db.state.campaign.status).toBe("paused");
    expect(db.state.campaign.paused_reason).toBe(SPAM_PAUSE_REASON);
  });

  it("gate spent + clean feedback releases full parallel delivery", async () => {
    const db = fakeDb({
      locks: spentLocks(new Date().toISOString()),
      receipts: receiptSet(20, 1),
    });
    const r = await spamGatePrecheck(db, CAMPAIGN);
    expect(r).toEqual({ action: "proceed", mode: "open" });
    expect(db.state.locks.has("spamgate:c1:released")).toBe(true);
  });

  it("insufficient feedback waits; after the bounded timeout the remainder stays stopped truthfully", async () => {
    const recent = fakeDb({
      locks: spentLocks(new Date().toISOString()),
      receipts: receiptSet(7, 0),
    });
    expect((await spamGatePrecheck(recent, CAMPAIGN)).action).toBe("wait");
    expect(recent.state.campaign.status).toBe("sending");

    const stale = fakeDb({
      locks: spentLocks(new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      receipts: receiptSet(7, 0),
    });
    const r = await spamGatePrecheck(stale, CAMPAIGN);
    expect(r).toEqual({ action: "paused", reason: "feedback_timeout" });
    expect(stale.state.campaign.paused_reason).toBe(FEEDBACK_TIMEOUT_REASON);
    expect(stale.state.campaign.paused_reason).not.toBe(SPAM_PAUSE_REASON);
  });

  it("stat errors defer — unknown is never released and never labelled spam", async () => {
    const db = fakeDb({
      locks: spentLocks(new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      receiptError: true,
    });
    expect((await spamGatePrecheck(db, CAMPAIGN)).action).toBe("defer");
    expect(db.state.campaign.status).toBe("sending");
    expect(db.state.locks.has("spamgate:c1:released")).toBe(false);
  });

  it("post-release monitoring still pauses a later spam wave", async () => {
    const db = fakeDb({
      locks: [["spamgate:c1:released", new Date().toISOString()]],
      receipts: receiptSet(60, 12),
    });
    const r = await spamGatePrecheck(db, CAMPAIGN);
    expect(r).toEqual({ action: "paused", reason: "spam_threshold" });
    expect(db.state.campaign.status).toBe("paused");
  });
});

describe("Pause safety and stopped-state preservation", () => {
  it("a campaign cancelled mid-evaluation is never paused or notified (cancellation race)", async () => {
    const db = fakeDb({ campaign: { status: "cancelled", paused_reason: null } });
    const r = await pauseCampaignForSpamGate(db, CAMPAIGN, { finalized: 20, spam: 10 }, "spam");
    expect(r).toEqual({ paused: false, reason: "stopped" });
    expect(db.state.campaign.status).toBe("cancelled");
    expect(db.state.events).toHaveLength(0);
    expect(db.state.enqueued).toHaveLength(0);
  });

  it("no further action after the pause: a second pause attempt is refused and creates no incident", async () => {
    const db = fakeDb({ receipts: receiptSet(20, 8) });
    const first = await pauseCampaignForSpamGate(db, CAMPAIGN, { finalized: 20, spam: 8 }, "spam");
    expect(first.paused).toBe(true);
    const second = await pauseCampaignForSpamGate(db, CAMPAIGN, { finalized: 20, spam: 8 }, "spam");
    expect(second.paused).toBe(false);
    expect(db.state.events).toHaveLength(1);
  });
});

describe("Hold-lift and checked-resume interaction", () => {
  it("spam-gate pause reasons never match the account-hold resume filter", () => {
    // HOLD_PAUSE_FILTER = paused_reason.eq.Tenant sending suspended,paused_reason.like.Sending suspended:*
    const matchesHoldFilter = (reason: string) =>
      reason === "Tenant sending suspended" || reason.startsWith("Sending suspended:");
    expect(HOLD_PAUSE_FILTER).toContain("Tenant sending suspended");
    expect(matchesHoldFilter(SPAM_PAUSE_REASON)).toBe(false);
    expect(matchesHoldFilter(FEEDBACK_TIMEOUT_REASON)).toBe(false);
  });

  it("checked resume refuses to bypass an active carrier spam hold", async () => {
    const db = fakeDb({ campaign: { status: "paused", paused_reason: SPAM_PAUSE_REASON } });
    const r = await checkedResumeCampaign(db, { campaignId: "c1", expectedAccountId: "a1" });
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("carrier_spam_hold");

    const db2 = fakeDb({ campaign: { status: "paused", paused_reason: FEEDBACK_TIMEOUT_REASON } });
    expect(((await checkedResumeCampaign(db2, { campaignId: "c1", expectedAccountId: "a1" })) as any).code).toBe("carrier_spam_hold");
  });
});

describe("Durable incident + operational email", () => {
  it("12 concurrent callbacks create exactly one incident and one email", async () => {
    const db = fakeDb();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        recordSpamGateIncident(db, CAMPAIGN, { finalized: 20, spam: 6 }, { paused: true, kind: "spam" })),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(db.state.events).toHaveLength(1);
    expect(db.state.enqueued).toHaveLength(1);
    const keys = db.state.enqueued.map((p: any) => p.idempotency_key);
    expect(new Set(keys).size).toBe(1);
    // Visibility: pending then queued — never claimed as delivered.
    const statuses = db.state.emailLog.map((r: any) => r.status);
    expect(statuses).toEqual(["pending", "queued"]);
    // Operational notice content: counts, reason, in-flight/charge caveat, links.
    const email = db.state.enqueued[0];
    expect(email.subject).toContain("Spring Promo");
    expect(email.text).toContain("6");
    expect(email.text).toContain("still charged");
    expect(email.text).toContain(`/app/campaigns/${CAMPAIGN.id}`);
    expect(email.text).toContain("/app/support");
    expect(email.text).not.toMatch(/fraud|rotate|new number/i);
    expect(email.unsubscribe_token).toBe("tok");
  });

  it("enqueue failure keeps a retryable outbox; the retry later succeeds while the campaign stays paused", async () => {
    const db = fakeDb({ enqueueError: true });
    const r = await recordSpamGateIncident(db, CAMPAIGN, { finalized: 20, spam: 5 }, { paused: true, kind: "spam" });
    expect(r).toEqual({ created: true, emailStatus: "pending_retry" });
    expect(db.state.events[0].payload.email_status).toBe("pending_retry");
    expect(db.state.emailLog.map((x: any) => x.status)).toEqual(["pending", "failed"]);

    db.state.enqueueError = false;
    db.state.campaign.status = "paused"; // paused campaigns dropped from dispatch; retry must not care
    const retry = await retrySpamGateIncidentEmails(db);
    expect(retry).toEqual({ scanned: 1, queued: 1, stillPending: 0, failed: 0 });
    expect(db.state.events[0].payload.email_status).toBe("queued");
    expect(db.state.enqueued).toHaveLength(1);
    expect(db.state.campaign.status).toBe("paused");
  });

  it("suppressed and missing recipients are recorded truthfully, never sent", async () => {
    const suppressed = fakeDb({ suppressed: true });
    const r1 = await recordSpamGateIncident(suppressed, CAMPAIGN, { finalized: 20, spam: 5 }, { paused: true, kind: "spam" });
    expect(r1).toEqual({ created: true, emailStatus: "suppressed" });
    expect(suppressed.state.enqueued).toHaveLength(0);
    expect(suppressed.state.emailLog[0].status).toBe("suppressed");

    const noEmail = fakeDb({ account: { email: null, contact_email: null } });
    const r2 = await recordSpamGateIncident(noEmail, CAMPAIGN, { finalized: 20, spam: 5 }, { paused: true, kind: "spam" });
    expect(r2).toEqual({ created: true, emailStatus: "no_recipient" });
    expect(noEmail.state.enqueued).toHaveLength(0);
    expect(noEmail.state.events[0].type).toBe(SPAM_GATE_INCIDENT_EVENT);
  });

  it("the incident uses the server-owned account email (contact_email preferred), never a recipient phone", async () => {
    const db = fakeDb({ account: { email: "login@example.com", contact_email: "billing@example.com" } });
    await recordSpamGateIncident(db, CAMPAIGN, { finalized: 20, spam: 5 }, { paused: true, kind: "spam" });
    expect(db.state.enqueued[0].to).toBe("billing@example.com");
    expect(db.state.enqueued[0].text).not.toMatch(/\+1\d{10}/);
  });
});

describe("Receipt-side conclusion and no retroactive notices", () => {
  it("a monitored campaign that finished before final results still gets one honest notice", async () => {
    const db = fakeDb({ receipts: receiptSet(25, 5) });
    const r = await concludeMonitoredCampaign(db, CAMPAIGN);
    expect(r).toEqual({ concluded: true, incident: true });
    expect(db.state.enqueued).toHaveLength(1);
    // Honest wording: everything was already submitted; nothing left to stop.
    expect(db.state.enqueued[0].text).toContain("already been handed to the carriers");
    expect(db.state.enqueued[0].text).not.toContain("remaining messages were stopped");
    // Concluded marker prevents any repeat.
    const again = await concludeMonitoredCampaign(db, CAMPAIGN);
    expect(again).toEqual({ concluded: true, incident: false });
    expect(db.state.enqueued).toHaveLength(1);
  });

  it("a clean monitored campaign is concluded silently", async () => {
    const db = fakeDb({ receipts: receiptSet(25, 1) });
    expect(await concludeMonitoredCampaign(db, CAMPAIGN)).toEqual({ concluded: true, incident: false });
    expect(db.state.enqueued).toHaveLength(0);
    expect(db.state.locks.has("spamgate:c1:done")).toBe(true);
  });

  it("no retroactive notices: retries only scan retryable incident outbox rows", async () => {
    const db = fakeDb();
    const retry = await retrySpamGateIncidentEmails(db);
    expect(retry.scanned).toBe(0);
    expect(db.state.enqueued).toHaveLength(0);
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
