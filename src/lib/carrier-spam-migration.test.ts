// SQL contract test: the migration proposal must structurally implement the
// semantics the TS helpers (and their fakes) rely on. This reads the proposal
// text — it does NOT apply or connect to any database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPAM_PAUSE_REASON, FEEDBACK_TIMEOUT_REASON } from "./carrier-spam-guard";

const sql = readFileSync(resolve(__dirname, "../../db-proposals/20261022-campaign-spam-monitor.sql"), "utf8");

function fnBody(name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("$function$;", rest.indexOf("AS $function$"));
  return end === -1 ? rest : rest.slice(0, end);
}

describe("spam_gate_claim wrapper contract", () => {
  const body = fnBody("spam_gate_claim");

  it("locks the campaign row (contends pause/cancel) and the monitor row", () => {
    expect(body).toMatch(/FROM public\.campaigns WHERE campaigns\.id = _campaign_id FOR UPDATE/);
    expect(body).toMatch(/FROM public\.campaign_spam_monitors\s+WHERE campaign_id = _campaign_id FOR UPDATE/);
  });

  it("checks live campaign status and account hold before any claim", () => {
    expect(body).toMatch(/c_status NOT IN \('queued','sending','processing','scheduled'\)/);
    expect(body).toMatch(/sending_suspended_at IS NOT NULL/);
    expect(body).toMatch(/onboarding_status <> 'active'/);
  });

  it("invokes the EXISTING claim_campaign_messages inside the wrapper (financial internals preserved)", () => {
    expect(body).toMatch(/RETURN QUERY SELECT \* FROM public\.claim_campaign_messages\(_campaign_id, allowed\)/);
    // paid claim count is fed back into the gate allowance in the same transaction
    expect(body).toMatch(/GET DIAGNOSTICS claimed_count = ROW_COUNT/);
    expect(body).toMatch(/submitted_count = submitted_count \+ claimed_count/);
  });

  it("bounds claims: 25 initial for capped campaigns, 250 outstanding after release, 10-minute feedback timeout", () => {
    expect(body).toMatch(/25 - m\.submitted_count/);
    expect(body).toMatch(/250 - \(m\.submitted_count - m\.finalized_count\)/);
    expect(body).toMatch(/interval '10 minutes'/);
    expect(body).toMatch(/spam_gate_do_pause\(_campaign_id, 'feedback_timeout'\)/);
  });

  it("re-checks the spam threshold on every claim (late waves pause after release)", () => {
    expect(body).toMatch(/m\.finalized_count >= 20 AND m\.spam_count >= CEIL\(m\.finalized_count \* 0\.2\)/);
    expect(body).toMatch(/spam_gate_do_pause\(_campaign_id, 'spam'\)/);
  });

  it("delegates unenrolled campaigns to the plain claim (pre-rollout behavior unchanged)", () => {
    expect(body).toMatch(/IF NOT FOUND THEN\s+-- Pre-rollout[\s\S]*claim_campaign_messages\(_campaign_id, _limit\)/);
  });
});

describe("spam_gate_do_pause atomicity contract", () => {
  const body = fnBody("spam_gate_do_pause");

  it("pause + incident + outbox shell live in ONE function (one transaction)", () => {
    expect(body).toMatch(/UPDATE public\.campaigns\s+SET status = 'paused'/);
    expect(body).toMatch(/INSERT INTO public\.campaign_spam_incidents/);
    expect(body).toMatch(/INSERT INTO public\.campaign_spam_email_outbox/);
  });

  it("never resurrects stopped campaigns and records paused=false honestly", () => {
    expect(body).toMatch(/status IN \('queued','sending','processing','scheduled'\)/);
    expect(body).toMatch(/\(stopped_id IS NOT NULL\)/);
  });

  it("exactly one incident and one outbox row per campaign", () => {
    expect(body.match(/ON CONFLICT \(campaign_id\) DO NOTHING/g)!.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/campaign_id uuid NOT NULL UNIQUE REFERENCES public\.campaign_spam_incidents/);
  });

  it("pause reasons match the TS constants byte-for-byte", () => {
    expect(sql).toContain(SPAM_PAUSE_REASON);
    expect(sql).toContain(FEEDBACK_TIMEOUT_REASON);
  });

  it("resolves the recipient by trimming both emails, empty strings never win", () => {
    expect(body).toMatch(/COALESCE\(NULLIF\(BTRIM\(a\.contact_email\), ''\), NULLIF\(BTRIM\(a\.email\), ''\)\)/);
  });
});

describe("spam_gate_record_receipt contract", () => {
  const body = fnBody("spam_gate_record_receipt");

  it("matches the message's CURRENT provider id exactly; stale retry ids ignored", () => {
    expect(body).toMatch(/current_pid IS NULL OR current_pid <> _provider_message_id/);
  });

  it("dedupes replayed receipts and only touches enrolled campaigns", () => {
    expect(body).toMatch(/ON CONFLICT \(campaign_id, provider_message_id\) DO NOTHING/);
    expect(body).toMatch(/IF NOT FOUND THEN RETURN 'unenrolled'/);
  });

  it("concludes only after enough final feedback, not on submission completion", () => {
    expect(body).toMatch(/fully_submitted AND m\.finalized_count >= 20/);
    expect(body).toMatch(/SET state = 'concluded'/);
  });
});

describe("outbox contract", () => {
  it("enqueue + status flip are one transactional function around pgmq.send", () => {
    const body = fnBody("spam_gate_outbox_enqueue");
    expect(body).toMatch(/FOR UPDATE/);
    expect(body).toMatch(/status = 'pending'/);
    expect(body).toMatch(/enqueue_email\('transactional_emails', _payload\)/);
    expect(body).toMatch(/SET status = 'queued'/);
  });

  it("due-selection is bounded and lock-skipping", () => {
    const body = fnBody("spam_gate_outbox_due");
    expect(body).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(body).toMatch(/LIMIT GREATEST\(0, LEAST\(100, _limit\)\)/);
  });
});

describe("enrollment and access control contract", () => {
  it("enrolls only zero-work campaigns (rollout cutoff: no retro enrollment)", () => {
    const body = fnBody("spam_gate_enroll");
    expect(body).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.message_send_attempts/);
    expect(body).toMatch(/m\.provider_message_id IS NOT NULL/);
    expect(body).toMatch(/ON CONFLICT \(campaign_id\) DO NOTHING/);
  });

  it("tables are service-role only with RLS; functions revoked from anon/authenticated", () => {
    for (const t of ["campaign_spam_monitors", "campaign_spam_receipts", "campaign_spam_incidents", "campaign_spam_email_outbox"]) {
      expect(sql).toContain(`GRANT ALL ON public.${t} TO service_role;`);
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.spam_gate_claim\(uuid, integer\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.spam_gate_claim\(uuid, integer\) TO service_role;/);
    // the internal pause function is never granted
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.spam_gate_do_pause/);
  });

  it("never uses expiring dispatch_locks as permanent state", () => {
    expect(sql).not.toMatch(/dispatch_locks/);
  });
});
