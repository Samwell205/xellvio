// Text contracts supplement scripts/test-carrier-spam-sql.mjs, which executes
// the actual proposal and unchanged financial RPC against synthetic fixtures.
// Text matching alone cannot prove transactions or multi-session scheduling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPAM_PAUSE_REASON, FEEDBACK_TIMEOUT_REASON } from "./carrier-spam-guard";

const sql = readFileSync(resolve(__dirname, "../../db-proposals/20261022-campaign-spam-monitor.sql"), "utf8");
const amendment = readFileSync(resolve(__dirname, "../../db-proposals/20261022-remove-carrier-feedback-delays.sql"), "utf8");
const code = (sql + "\n" + amendment).replace(/--[^\n]*/g, ""); // Comments must not satisfy contracts.
const compact = (value: string) => value.replace(/\s+/g, "");
const functions = new Map<string, string>(
  [...code.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g)]
    .map((match) => [match[1], compact(match[2])] as const),
);
function body(name: string): string {
  const result = functions.get(name);
  if (!result) throw new Error(`Missing SQL function: ${name}`);
  return result;
}
const permissions = compact(code);

describe("immediate paid claims with confirmed-spam holds", () => {
  const claim = body("spam_gate_claim");

  it("locks campaign then monitor and refuses stopped campaigns before claiming", () => {
    const campaign = claim.indexOf("FROMpublic.campaignsWHEREcampaigns.id=_campaign_idFORUPDATE");
    const monitor = claim.indexOf("FROMpublic.campaign_spam_monitorsWHEREcampaign_id=_campaign_idFORUPDATE");
    expect(campaign).toBeGreaterThan(-1);
    expect(monitor).toBeGreaterThan(campaign);
    expect(claim.indexOf("public.claim_campaign_messages(")).toBeGreaterThan(monitor);
    expect(claim).toContain("c.statusNOTIN('queued','sending','processing','scheduled')THENRETURN");
    expect(claim).toContain("m.stateIN('paused_spam','paused_timeout')THENRETURN");
  });

  it("delegates the requested limit with no new feedback caps, wait or claim-time campaign scans", () => {
    expect(claim).toContain("public.claim_campaign_messages(_campaign_id,_limit)");
    expect(claim).not.toContain("LEAST(");
    expect(claim).not.toContain("new_capacity");
    expect(claim).not.toContain("outstanding");
    expect(claim).not.toContain("waiting_since");
    expect(claim).not.toContain("expected_total");
    expect(claim).not.toContain("interval");
    expect(claim).not.toContain("public.messages");
    expect(claim).not.toContain("campaign_spam_receipts");
    expect(claim).toContain("IFEXISTS(SELECT1FROMpublic.campaign_spam_receipt_invalidationsWHEREcampaign_id=_campaign_id)THENPERFORMpublic.spam_gate_refresh(_campaign_id)");
    expect(claim).toContain("m.finalized_count>=20ANDm.spam_count>=CEIL(m.finalized_count*0.2)");
    expect(claim).toContain("spam_gate_do_pause(_campaign_id,'spam')");
  });

  it("preserves financial RPC body and buffers claims until a locked account recheck", () => {
    expect(code).not.toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.claim_campaign_messages\(/);
    expect(claim).toContain("jsonb_agg(to_jsonb(x))INTOclaimedFROMpublic.claim_campaign_messages(_campaign_id,_limit)x");
    expect(claim).toContain("a.sending_suspended_atISNOTNULLORa.onboarding_status<>'active'");
    expect(claim).toContain("INTOon_holdFROMpublic.accountsaWHEREa.id=c.account_idFORUPDATE");
    expect(claim).toContain("RAISESQLSTATE'PT001'");
    expect(claim).toContain("EXCEPTIONWHENSQLSTATE'PT001'THENRETURN");
    expect(claim.indexOf("public.claim_campaign_messages(")).toBeLessThan(claim.indexOf("c.account_idFORUPDATE"));
  });

  it("visits only returned rows for idempotent reservation accounting", () => {
    expect(compact(code)).toContain("PRIMARYKEY(message_id,attempt_number)");
    expect(claim).toContain("jsonb_to_recordset(COALESCE(claimed,'[]'::jsonb))");
    expect(claim).toContain("VALUES(rec.id,rec.attempt_number,_campaign_id)ONCONFLICTDONOTHING");
    expect(claim).toContain("GETDIAGNOSTICSadded=ROW_COUNT;fresh:=fresh+added");
    expect(claim).toContain("submitted_count=submitted_count+fresh");
    expect(claim).not.toContain("count(*)");
  });

  it("leaves legacy campaigns and benign concluded monitors on the same original claim path", () => {
    expect(claim).toContain("IFm.campaign_idISNOTNULLTHEN");
    expect(claim.match(/public\.claim_campaign_messages\(/g)).toHaveLength(1);
    expect(claim).not.toContain("state='concluded'");
    expect(claim).not.toContain("UPDATEpublic.campaigns");
    expect(claim).not.toContain("SETstate=");
  });
});

describe("current signed final evidence", () => {
  it("checks exact message/campaign/current provider id under lock and deduplicates replay", () => {
    const receipt = body("spam_gate_record_receipt");
    expect(receipt).toContain("WHEREid=_message_idANDcampaign_id=_campaign_idFORUPDATE");
    expect(receipt).toContain("current_pidISNULLORcurrent_pidISDISTINCTFROM_provider_message_id");
    expect(receipt).toContain("IFNOTFOUNDTHENRETURN'unenrolled'");
    expect(receipt).toContain("ONCONFLICT(campaign_id,provider_message_id)DONOTHING");
    expect(receipt).not.toContain("UPDATEpublic.campaign_spam_receipts");
  });

  it("keeps routine callbacks incremental and removes replaced provider facts from exact counts", () => {
    const receipt = body("spam_gate_record_receipt");
    const refresh = body("spam_gate_refresh");
    const invalidate = body("spam_gate_invalidate_provider");
    expect(receipt).toContain("ELSIFinserted=1THENUPDATEpublic.campaign_spam_monitorsSETfinalized_count=finalized_count+1");
    expect(receipt).toContain("public.campaign_spam_receipt_invalidationsWHEREcampaign_id=_campaign_id");
    expect(refresh).toContain("ms.id=r.message_idANDms.campaign_id=r.campaign_idANDms.provider_message_id=r.provider_message_id");
    expect(refresh.indexOf("DELETEFROMpublic.campaign_spam_receipt_invalidations")).toBeLessThan(refresh.indexOf("SELECTcount(*)"));
    expect(invalidate).toContain("OLD.provider_message_idISNOTNULLANDOLD.provider_message_idISDISTINCTFROMNEW.provider_message_id");
    expect(invalidate).not.toContain("FORUPDATE");
    expect(invalidate).not.toContain("UPDATEpublic.campaign_spam_monitors");
  });

  it("continues checking late spam waves without concluding after merely20 finals", () => {
    const receipt = body("spam_gate_record_receipt");
    expect(receipt).toContain("m.finalized_count>=20ANDm.spam_count>=CEIL(m.finalized_count*0.2)");
    expect(receipt).toContain("spam_gate_do_pause(_campaign_id,'spam')");
    expect(receipt).not.toContain("state='concluded'");
    expect(receipt).not.toContain("message_send_attempts");
  });
});

describe("pause ownership, truthful copy and checked resume", () => {
  const pause = body("spam_gate_do_pause");

  it("keeps conditional pause, one incident and outbox insertion in one function", () => {
    expect(pause).toContain("UPDATEpublic.campaignsSETstatus='paused'");
    expect(pause).toContain("INSERTINTOpublic.campaign_spam_incidents");
    expect(pause).toContain("INSERTINTOpublic.campaign_spam_email_outbox");
    expect(pause.match(/ONCONFLICT\(campaign_id\)DONOTHING/g)).toHaveLength(2);
    expect(compact(code)).toContain("campaign_iduuidNOTNULLUNIQUEREFERENCESpublic.campaign_spam_incidents(campaign_id)");
  });

  it("lets cancellation/manual holds win and requires proof for completed late notices", () => {
    expect(pause).toContain("c.statusNOTIN('sent','completed')ORNOTall_submittedOR_kind<>'spam'");
    expect(pause).toContain("IFNOTwonTHENRETURN");
    expect(pause).toContain("WHEREid=_campaign_idANDstatusIN('queued','sending','processing','scheduled')");
    expect(pause).toContain("m.expected_totalISNOTNULLANDtotal=m.expected_totalANDsubmitted=m.expected_total");
  });

  it("distinguishes provider submissions, remaining sends and unknown planning totals", () => {
    expect(pause).toContain("count(*)FILTER(WHEREprovider_message_idISNOTNULL)::integer");
    expect(pause).toContain("WHENall_submittedTHEN'all_submitted'");
    expect(pause).toContain("THEN'remaining_stopped'ELSE'no_remaining_work'");
    expect(pause).toContain("CASEWHENm.expected_totalISNULLTHENNULLELSEremainingEND");
    expect(pause).toContain("COALESCE(NULLIF(BTRIM(a.contact_email),''),NULLIF(BTRIM(a.email),''))");
    expect(sql).toContain(SPAM_PAUSE_REASON);
    expect(sql).toContain(FEEDBACK_TIMEOUT_REASON);
  });

  it("resumes a legacy timeout only by explicit CAS, without waiting for minimum feedback", () => {
    const resume = body("spam_gate_resume_timeout");
    expect(resume).toContain("c.statusISDISTINCTFROM_status");
    expect(resume).toContain("c.account_idISDISTINCTFROM_account_idORc.message_bodyISDISTINCTFROM_body");
    expect(resume).toContain("c.paused_reasonISNULL");
    expect(resume).toContain("m.state<>'paused_timeout'");
    expect(resume).toContain("sending_suspended_atISNOTNULLORonboarding_status<>'active'");
    expect(resume).toContain("spam_gate_refresh(_campaign_id)");
    expect(resume).toContain("m.finalized_count>=20ANDm.spam_count>=CEIL(m.finalized_count*0.2)");
    expect(resume).not.toContain("m.finalized_count<20");
    expect(resume).toContain("SETstate='released',waiting_since=NULL");
    expect(resume).toContain("SETstatus='sending',paused_reason=NULL,paused_at=NULL");
  });

  it("uses cheap indexed live flags for each provider check, including unmonitored legacy campaigns", () => {
    const canSend = body("spam_gate_can_send");
    expect(canSend).toContain("SELECTEXISTS(");
    expect(canSend).toContain("c.statusIN('queued','sending','processing','scheduled')");
    expect(canSend).toContain("a.onboarding_status='active'ANDa.sending_suspended_atISNULL");
    expect(canSend).toContain("m.campaign_idISNULLORm.stateNOTIN('paused_spam','paused_timeout')");
    expect(canSend).not.toContain("campaign_spam_receipts");
    expect(canSend).not.toContain("campaign_spam_reservations");
    expect(canSend).not.toContain("count(");
  });
});

describe("durable notification outbox", () => {
  it("serializes pending-only enqueue and stores queue id in the same function", () => {
    const enqueue = body("spam_gate_outbox_enqueue");
    expect(enqueue).toContain("WHEREid=_outbox_idANDstatus='pending'FORUPDATE");
    expect(enqueue).toContain("IFNOTFOUNDTHENRETURNNULL");
    expect(enqueue).toContain("public.enqueue_email('transactional_emails',_payload)");
    expect(enqueue).toContain("SETstatus='queued',payload=_payload,queue_message_id=msg_id");
  });

  it("uses expected-status CAS, monotonic sent proof and no queued-to-pending rewind", () => {
    const mark = body("spam_gate_outbox_mark");
    expect(mark).toContain("WHEREid=_outbox_idFORUPDATE");
    expect(mark).toContain("current_stateISDISTINCTFROM_expected_statusTHENRETURNfalse");
    expect(mark).toContain("IFcurrent_state='sent'THENRETURN_status='sent'");
    expect(mark).toContain("current_state='pending'AND_statusIN('pending','suppressed','missing')");
    expect(mark).toContain("current_state='queued'AND_statusIN('queued','failed','suppressed')");
    expect(mark).not.toContain("current_state='queued'AND_statusIN('pending'");
    expect(mark).toContain("message_id='spamgate-incident-'||campaign::textANDstatus='sent'");
  });

  it("bounds advisory due scans; authoritative enqueue/CAS owns transitions", () => {
    expect(body("spam_gate_outbox_due")).toContain("o.statusIN('pending','queued')");
    expect(body("spam_gate_outbox_due")).toContain("LIMITGREATEST(0,LEAST(100,_limit))FORUPDATESKIPLOCKED");
  });
});

describe("future rollout and service-only access", () => {
  it("persists a future cutoff and enrolls under row locks only with zero paid work", () => {
    const enroll = body("spam_gate_enroll");
    expect(compact(code)).toContain("activated_attimestamptzNOTNULLDEFAULT(statement_timestamp()+interval'2minutes')");
    expect(enroll).toContain("c.created_at<cutoff");
    expect(enroll).toContain("FROMpublic.messagesWHEREcampaign_id=_campaign_idFORUPDATE");
    expect(enroll).toContain("public.message_send_attemptsWHEREcampaign_id=_campaign_id");
    expect(enroll).toContain("provider_message_idISNOTNULLORcharged_atISNOTNULLORattempt_number>0");
    expect(enroll).toContain("statusNOTIN('queued','failed')");
    expect(enroll.indexOf("FROMpublic.messagesWHEREcampaign_id=_campaign_idFORUPDATE")).toBeLessThan(enroll.indexOf("public.message_send_attempts"));
  });

  it("explicitly revokes browser table grants and enables RLS for every created table", () => {
    const tables = [...code.matchAll(/CREATE TABLE public\.(\w+)\s*\(/g)].map((match) => match[1]);
    const revoke = permissions.match(/REVOKEALLONTABLE([\s\S]*?)FROMPUBLIC,anon,authenticated;/)?.[1] ?? "";
    const grant = permissions.match(/GRANTALLONTABLE([\s\S]*?)TOservice_role;/)?.[1] ?? "";
    expect(tables).toContain("campaign_spam_rollout");
    expect(tables).toContain("campaign_spam_reservations");
    expect(tables).toContain("campaign_spam_receipt_invalidations");
    for (const table of tables) {
      expect(revoke, `${table}: browser access revoked`).toContain(`public.${table}`);
      expect(grant, `${table}: service role grant`).toContain(`public.${table}`);
      expect(permissions, `${table}: RLS enabled`).toContain(`ALTERTABLEpublic.${table}ENABLEROWLEVELSECURITY;`);
    }
    expect(code).not.toMatch(/CREATE POLICY/);
  });

  it("checks every created function's privileges instead of a fixed function count", () => {
    const privateFunctions = new Set(["spam_gate_invalidate_provider", "spam_gate_refresh", "spam_gate_do_pause"]);
    for (const name of functions.keys()) {
      expect(permissions, `${name}: browser execution revoked`).toMatch(new RegExp(`REVOKEALLONFUNCTIONpublic\\.${name}\\([^;]+FROMPUBLIC,anon,authenticated`));
      const grant = new RegExp(`GRANTEXECUTEONFUNCTIONpublic\\.${name}\\([^;]+TOservice_role;`);
      if (privateFunctions.has(name)) {
        expect(permissions, `${name}: private helper`).not.toMatch(grant);
        expect(permissions).toMatch(new RegExp(`REVOKEALLONFUNCTIONpublic\\.${name}\\([^;]+FROMPUBLIC,anon,authenticated,service_role;`));
      } else {
        expect(permissions, `${name}: service RPC`).toMatch(grant);
      }
    }
    expect(permissions).toContain("REVOKEALLONFUNCTIONpublic.claim_campaign_messages(uuid,integer)FROMPUBLIC,anon,authenticated,service_role;");
  });

  it("keeps durable gate state independent of expiring dispatch leases", () => {
    expect(code).not.toMatch(/dispatch_locks/);
  });
});
