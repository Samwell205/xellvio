// Telnyx-backed campaign dispatcher. Sends via Telnyx Messages API scoped to
// each tenant's Messaging Profile. Twilio has been removed entirely.

import { createFileRoute } from "@tanstack/react-router";
import { calculateSegments } from "@/lib/sms-segments";
import { countryFromPhone } from "@/lib/country-from-phone";
import { keywordScan } from "@/lib/content-scanner";

const PLAN_INSERT_CHUNK = 500;
// Recipients enriched + inserted per invocation. Bounds planning CPU cost to
// a fixed amount regardless of campaign size — previously the entire
// eligible list was enriched (segment calc, link rewriting, crypto RNG) in
// one shot, which is what exceeded the Worker's CPU time limit for large
// campaigns (e.g. 3,019 recipients in one request).
const PLAN_BATCH_SIZE = 500;
// Keep each dispatcher invocation small enough to always finish inside the
// caller's HTTP timeout. If the caller (pg_cron/pg_net) hangs up mid-run the
// serverless worker is cancelled, leaving claimed rows stuck in `sending`
// which the next run then has to write off as `dispatch_timeout`.
const DELIVER_PER_WORKER = 120;
// Was 30. This project's Postgres tier caps out at 60 total connections, and
// steady-state background usage (PostgREST, realtime, pg_cron, etc.) already
// holds ~25 of those. A first-tick invocation stacks 30-way concurrent writes
// on top of the connection load from planning/screening moments earlier —
// under that pressure, some of the per-message status UPDATEs in
// sendOneMessage were failing, and because those calls didn't check the
// returned error, the code reported success anyway while the row stayed
// stuck at status='sending' — later swept as dispatch_timeout. Confirmed via
// direct comparison of a dispatch tick's own reported delivered/failed
// counts against the messages table's actual state two minutes later: the
// tick claimed success for all 9 messages in a campaign, but all 9 were
// still 'sending' at the next tick. Lower concurrency + writeWithRetry below
// are the two-part fix.
const DELIVER_CONCURRENCY = 12;
// Soft wall-clock budget for one invocation. Anything left over is picked up by
// the next scheduled run instead of risking a mid-flight cancellation.
const RUN_BUDGET_MS = 40_000;

function render(body: string, p: { first_name?: string | null; last_name?: string | null; country_code?: string | null; phone_e164?: string | null; custom_fields?: Record<string, any> | null }) {
  const fields: Record<string, any> = {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    country: p.country_code ?? "",
    country_code: p.country_code ?? "",
    phone: p.phone_e164 ?? "",
    ...(p.custom_fields && typeof p.custom_fields === "object" ? p.custom_fields : {}),
  };
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = fields[key];
    return v == null ? "" : String(v);
  });
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? "https://xellvio.com").replace(/\/$/, "");
}

function supportsMms(countryCode?: string | null) {
  const cc = (countryCode ?? "").toUpperCase();
  return cc === "US" || cc === "CA";
}
function mediaLinkForMessage(messageId: string) {
  return `${publicBaseUrl()}/m/${messageId}`;
}
function fallbackMediaBody(body: string, messageId: string) {
  return `${body}\n\nImage: ${mediaLinkForMessage(messageId)}`;
}

type Rate = {
  country_code: string;
  dial_prefix: string;
  sell_price: number;
  mms_multiplier: number;
  active: boolean;
};

type Sender = {
  messagingProfileId?: string | null;
  fromNumber?: string | null;
  assets: Array<{
    country_code: string;
    sender_kind?: string | null;
    telnyx_messaging_profile_id?: string | null; // now stores telnyx messaging_profile_id
    phone_number?: string | null;
  }>;
};

async function loadEligibleRecipients(supabaseAdmin: any, accountId: string, audience: any): Promise<any[]> {
  const PAGE = 1000;
  const recipients: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin.rpc("eligible_profile_ids_page", {
      _account_id: accountId,
      _audience: audience,
      _limit: PAGE,
      _offset: offset,
    });
    if (error) throw error;
    const rows = data ?? [];
    recipients.push(...rows);
    if (rows.length < PAGE) break;
  }
  return recipients;
}

/**
 * Page through the eligible list, skipping profiles that already have a
 * message row for this campaign, and return up to `batchSize` NEW ones plus
 * whether any more remain beyond that. This is what makes planning resumable
 * across ticks instead of an all-or-nothing single pass: each invocation
 * only enriches/inserts one bounded batch, and processCampaign() re-derives
 * "is this campaign fully planned yet" from `hasMore` rather than assuming
 * "any messages exist" means "fully planned."
 */
async function loadNextUnplannedBatch(
  supabaseAdmin: any,
  campaignId: string,
  accountId: string,
  audience: any,
  batchSize: number,
): Promise<{ recipients: any[]; hasMore: boolean }> {
  const { data: plannedRows, error: plannedErr } = await supabaseAdmin
    .from("messages")
    .select("profile_id")
    .eq("campaign_id", campaignId);
  if (plannedErr) throw plannedErr;
  const planned = new Set((plannedRows ?? []).map((r: any) => r.profile_id));

  const PAGE = 1000;
  const recipients: any[] = [];
  let hasMore = false;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin.rpc("eligible_profile_ids_page", {
      _account_id: accountId,
      _audience: audience,
      _limit: PAGE,
      _offset: offset,
    });
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      if (planned.has(r.profile_id)) continue;
      if (recipients.length < batchSize) {
        recipients.push(r);
      } else {
        hasMore = true;
        break;
      }
    }
    if (hasMore || rows.length < PAGE) break;
  }
  return { recipients, hasMore };
}

function isShaftLikeCode(code: string): boolean {
  return ["40010", "40011", "40001", "40012"].includes(code);
}

async function flagAccountForReview(supabaseAdmin: any, accountId: string, reason: string, detail: string) {
  try {
    const { data: acct } = await supabaseAdmin
      .from("accounts").select("email, suspended_at").eq("id", accountId).maybeSingle();
    if (acct?.suspended_at) return;
    await supabaseAdmin.from("accounts")
      .update({ suspended_at: new Date().toISOString(), onboarding_status: "suspended" })
      .eq("id", accountId);
    await supabaseAdmin.from("events").insert({
      type: "account_auto_suspended", account_id: accountId, payload: { reason, detail },
    });
  } catch (e) {
    console.error("[dispatch] flagAccountForReview failed", e);
  }
}

/**
 * A message row stuck at status='sending' is exactly what the dispatch_timeout
 * sweep in claim_campaign_messages later writes off — so every exit path in
 * sendOneMessage that's supposed to move a row OFF 'sending' must actually
 * land, not just be attempted. Plain `.update()` calls here previously never
 * checked the returned error, so a transient write failure (e.g. Postgres
 * connection pressure) was silently treated as success while the row stayed
 * on 'sending'. Retries a few times with backoff before giving up and
 * throwing, so a real failure is at least visible in logs instead of
 * manifesting two minutes later as an unexplained dispatch_timeout.
 */
async function writeWithRetry(
  supabaseAdmin: any,
  table: string,
  patch: Record<string, any>,
  match: Record<string, any>,
  attempts = 4,
): Promise<void> {
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    let q = supabaseAdmin.from(table).update(patch);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    if (!error) return;
    lastError = error;
    console.error(`[dispatch] ${table} update failed (attempt ${i + 1}/${attempts})`, JSON.stringify(match), error.message ?? error);
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  throw new Error(`Failed to update ${table} after ${attempts} attempts: ${lastError?.message ?? lastError}`);
}

async function sendOneMessage(
  supabaseAdmin: any,
  campaign: any,
  sender: Sender,
  m: any,
): Promise<{ ok: boolean; shaft: boolean; debited: number }> {
  const { sendMessage, safeTelnyxCall } = await import("@/lib/telnyx.server");
  try {
    const sendAsMms = !!campaign.media_url && supportsMms(m.country_code);
    const messageBody =
      campaign.media_url && !sendAsMms ? fallbackMediaBody(m.rendered_body, m.id) : m.rendered_body;

    // Sender fallback rules — pick best available sender for this recipient.
    // Priority: US/CA → toll_free > local > sender_id; other countries → sender_id > local > toll_free.
    const cc = (m.country_code ?? "").toUpperCase();
    const isNanp = cc === "US" || cc === "CA";
    const rank = (kind: string | null | undefined) => {
      const k = kind ?? "";
      if (isNanp) return k === "toll_free" ? 0 : k === "local" ? 1 : k === "sender_id" ? 2 : 3;
      return k === "sender_id" ? 0 : k === "local" ? 1 : k === "toll_free" ? 2 : 3;
    };
    const candidates = sender.assets
      .filter((a) => {
        if (!(a.telnyx_messaging_profile_id || a.phone_number)) return false;
        if (a.country_code === m.country_code) return true;
        // Toll-free numbers approved in US or CA work for both (NANP TFV).
        if (
          isNanp &&
          a.sender_kind === "toll_free" &&
          (a.country_code === "US" || a.country_code === "CA")
        ) return true;
        return false;
      })
      .sort((a, b) => rank(a.sender_kind) - rank(b.sender_kind));
    const matched = candidates[0];

    if (!matched) {
      await writeWithRetry(supabaseAdmin, "messages", {
        status: "failed",
        error_code: "sender_not_registered_for_country",
        failure_reason: `No verified sender configured for ${m.country_code ?? "unknown country"}`,
      }, { id: m.id });
      return { ok: false, shaft: false, debited: 0 };
    }
    const messagingProfileId = matched.telnyx_messaging_profile_id ?? sender.messagingProfileId ?? undefined;
    const fromNumber = matched.phone_number ?? sender.fromNumber ?? undefined;
    const senderKindUsed = matched.sender_kind ?? "unknown";
    const senderUsed = fromNumber ?? messagingProfileId ?? "unknown";

    if (!messagingProfileId && !fromNumber) {
      await writeWithRetry(supabaseAdmin, "messages",
        { status: "failed", error_code: "no_sender", failure_reason: "No sender available" },
        { id: m.id });
      return { ok: false, shaft: false, debited: 0 };
    }

    // ── Per-recipient compliance gate (suspension + frequency cap).
    const { fastPerRecipientGate } = await import("@/lib/content-screening.server");
    const gate = await fastPerRecipientGate(campaign.account_id, m.phone_e164);
    if (!gate.ok) {
      await writeWithRetry(supabaseAdmin, "messages",
        { status: "failed", error_code: gate.reason, failure_reason: `Blocked pre-send: ${gate.reason}` },
        { id: m.id });
      return { ok: false, shaft: false, debited: 0 };
    }


    const result = await safeTelnyxCall(
      "send_message",
      { userId: campaign.account_id, messagingProfileId },
      () => sendMessage({
        to: m.phone_e164,
        text: messageBody,
        from: fromNumber ?? undefined,
        messagingProfileId: messagingProfileId ?? undefined,
        mediaUrls: sendAsMms ? [campaign.media_url] : undefined,
      }),
    );

    const providerSegments = Number(result.parts ?? m.segments_count ?? 1);
    // Telnyx has already accepted this message — recording that fact is not
    // optional, so this write gets real retries rather than being fired and
    // forgotten. A failure here is what previously left rows stuck on
    // 'sending' despite a successful send, later misreported as
    // dispatch_timeout.
    await writeWithRetry(supabaseAdmin, "messages", {
      status: "sent",
      provider_message_id: result.id,
      sent_at: new Date().toISOString(),
      segments_count: providerSegments,
      sender_used: senderUsed,
      sender_kind: senderKindUsed,
    }, { id: m.id });
    try {
      await writeWithRetry(supabaseAdmin, "message_send_attempts", {
        provider_message_id: result.id,
        provider_status: "sent",
        sent_at: new Date().toISOString(),
      }, { message_id: m.id, attempt_number: m.attempt_number }, 2);
    } catch (e) {
      // Audit-only table — the messages row above is the source of truth for
      // status, so don't fail the send over this.
      console.error("[dispatch] message_send_attempts update failed", e);
    }

    // If Telnyx billed more segments than we reserved from the tenant's
    // wallet at claim time, the platform absorbed the shortfall — flag it
    // for admin review instead of silently eating the cost.
    if (providerSegments > m.segments_count && m.segments_count > 0) {
      try {
        const shortfallSegments = providerSegments - m.segments_count;
        const perSegmentCost = Number(m.cost) / m.segments_count;
        const shortfallAmount = +(shortfallSegments * perSegmentCost).toFixed(4);
        if (shortfallAmount > 0) {
          const { data: existingCase } = await supabaseAdmin
            .from("financial_recovery_cases")
            .select("id, verified_uncovered_tenant_charge, evidence")
            .eq("account_id", campaign.account_id)
            .contains("campaign_ids", [campaign.id])
            .in("status", ["draft", "pending_provider"])
            .maybeSingle();
          const evidenceEntry = {
            message_id: m.id,
            phone_e164: m.phone_e164,
            reserved_segments: m.segments_count,
            billed_segments: providerSegments,
            shortfall_amount: shortfallAmount,
            detected_at: new Date().toISOString(),
          };
          if (existingCase) {
            const prevShortfalls = Array.isArray((existingCase.evidence as any)?.shortfalls) ? (existingCase.evidence as any).shortfalls : [];
            await supabaseAdmin.from("financial_recovery_cases").update({
              verified_uncovered_tenant_charge: Number(existingCase.verified_uncovered_tenant_charge) + shortfallAmount,
              evidence: { shortfalls: [...prevShortfalls, evidenceEntry] },
            }).eq("id", existingCase.id);
          } else {
            await supabaseAdmin.from("financial_recovery_cases").insert({
              account_id: campaign.account_id,
              title: `Segment undercharge — campaign "${campaign.name ?? campaign.id}"`,
              campaign_ids: [campaign.id],
              status: "draft",
              evidence_quality: "exact",
              verified_uncovered_tenant_charge: shortfallAmount,
              summary: "Telnyx billed more segments than reserved for one or more messages in this campaign. Auto-flagged by the dispatcher — no tenant collection or provider dispute has been initiated yet.",
              evidence: { shortfalls: [evidenceEntry] },
            });
          }
        }
      } catch (e) {
        console.error("[dispatch] recovery case creation failed", e);
      }
    }

    try {
      const { forwardSmsToGorgias } = await import("@/lib/gorgias.server");
      await forwardSmsToGorgias({
        accountId: campaign.account_id,
        phone: m.phone_e164,
        fromNumber: fromNumber ?? null,
        body: messageBody,
        direction: "outbound",
      });
    } catch (e) {
      console.error("[dispatch] gorgias mirror failed", e);
    }

    return { ok: true, shaft: false, debited: Number(m.cost) };
  } catch (e: any) {
    const code = String(e?.telnyxCode ?? "");
    const reason = e?.telnyxMessage ?? e?.message ?? "Send failed";
    try {
      await writeWithRetry(supabaseAdmin, "messages",
        { status: "failed", error_code: code || "exception", failure_reason: String(reason).slice(0, 500) },
        { id: m.id });
    } catch (writeErr) {
      // Last resort — this is the final handler, nothing left to fall back
      // to. Log loudly so it's visible instead of silently becoming a
      // dispatch_timeout two minutes from now with no trace of the real cause.
      console.error("[dispatch] FAILED to record message failure — row will be swept as dispatch_timeout", m.id, writeErr);
    }
    try {
      await writeWithRetry(supabaseAdmin, "message_send_attempts", {
        provider_status: "failed",
        error_code: code || "exception",
        failure_reason: String(reason).slice(0, 500),
        finalized_at: new Date().toISOString(),
      }, { message_id: m.id, attempt_number: m.attempt_number }, 2);
    } catch (writeErr) {
      console.error("[dispatch] message_send_attempts failure-update failed", writeErr);
    }
    return { ok: false, shaft: isShaftLikeCode(code), debited: 0 };
  }
}


async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/**
 * One-time campaign-level setup: keyword prescan + full compliance
 * screening (including the AI review, when the keyword scan is clean) and
 * the "does this campaign have any eligible recipients at all" check. Runs
 * exactly once per campaign — processCampaign() only calls this when no
 * message rows exist yet for the campaign, since messages only start
 * getting inserted after this step passes.
 */
async function beginCampaignIfNeeded(
  supabaseAdmin: any, campaign: any,
): Promise<{ ok: true } | { ok: false; reason?: string }> {
  // ── Legacy fast keyword scan (kept for backwards compat with the badge).
  const preScan = keywordScan(campaign.message_body ?? "");
  if (!preScan.allowed) {
    await supabaseAdmin.from("campaigns")
      .update({ status: "blocked_content", paused_reason: preScan.reason }).eq("id", campaign.id);
    await flagAccountForReview(supabaseAdmin, campaign.account_id, "content_violation_dispatch", preScan.reason ?? "");
    return { ok: false, reason: "blocked_content" };
  }

  const list = await loadEligibleRecipients(supabaseAdmin, campaign.account_id, campaign.audience ?? { include: [], exclude: [] });
  if (list.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
    return { ok: false };
  }

  // ── Full compliance screening once per campaign (all body-scoped checks +
  //    volume anomaly, sized against the TOTAL eligible count, not a batch).
  //    Per-recipient frequency cap runs later in sendOneMessage.
  const { screenMessageContent } = await import("@/lib/content-screening.server");
  const screen = await screenMessageContent(campaign.message_body ?? "", campaign.account_id, {
    campaignId: campaign.id,
    plannedRecipients: list.length,
    context: "campaign_plan",
  });
  if (screen.action === "blocked") {
    await supabaseAdmin.from("campaigns")
      .update({
        status: "blocked_content",
        paused_reason: `Blocked by screening (risk ${screen.riskScore}/100): ${screen.blockedReasons[0] ?? "policy violation"}`,
      }).eq("id", campaign.id);
    return { ok: false, reason: "blocked_by_screening" };
  }
  if (screen.action === "held_for_review") {
    await supabaseAdmin.from("campaigns")
      .update({
        status: "paused",
        paused_reason: `Held for review (risk ${screen.riskScore}/100). ${screen.blockedReasons.slice(0, 2).join(" · ")}`,
        paused_at: new Date().toISOString(),
      }).eq("id", campaign.id);
    return { ok: false, reason: "held_for_review" };
  }

  return { ok: true };
}

/**
 * Enrich and insert ONE bounded batch of recipients as queued (or
 * insufficient-balance-failed) message rows. `recipients` is pre-selected by
 * the caller via loadNextUnplannedBatch, capped to PLAN_BATCH_SIZE — this
 * function never processes an entire campaign's recipient list in one call,
 * so its CPU cost stays bounded regardless of campaign size. `isFirstBatch`
 * gates the one-time side effects (campaign status transition, admin push,
 * the insufficient-balance-for-everyone failure path) that previously ran
 * exactly once per campaign and must still only run once now.
 */
async function planCampaign(
  supabaseAdmin: any, campaign: any, rates: Rate[], recipients: any[], isFirstBatch: boolean,
): Promise<{ planned: number; skipped: number; cost: number; reason?: string }> {
  const dial = rates.map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }));
  const rateByCC: Record<string, Rate> = {};
  for (const r of rates) rateByCC[r.country_code] = r;
  const hasMedia = !!campaign.media_url;

  const enriched = recipients.map((p: any) => {
    const body = render(campaign.message_body, p);
    const seg = calculateSegments(body);
    const cc = p.country_code || countryFromPhone(p.phone_e164, dial);
    const rate = cc ? rateByCC[cc] : undefined;
    const unit = rate ? Number(rate.sell_price) : 0;
    const mult = hasMedia && rate ? Number(rate.mms_multiplier) : 1;
    const cost = +(seg.segments * unit * mult).toFixed(4);
    return { ...p, body, segments: seg.segments, country_code: cc, cost };
  });

  const totalCost = +enriched.reduce((s: number, x: any) => s + x.cost, 0).toFixed(4);

  const { data: acct, error: aErr } = await supabaseAdmin
    .from("accounts").select("credit_balance").eq("id", campaign.account_id).maybeSingle();
  if (aErr || !acct) throw new Error("Account lookup failed");
  const startingBalance = Number(acct.credit_balance);

  enriched.sort((a: any, b: any) => a.cost - b.cost);
  let remaining = startingBalance;
  const queuedRows: any[] = [];
  const failedRows: any[] = [];
  const linkRows: any[] = [];
  const URL_RE = /(https?:\/\/[^\s<>()\[\]"']+)/gi;
  const SHORT_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const shortCode = (len = 8) => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < len; i++) out += SHORT_ALPHABET[bytes[i] % SHORT_ALPHABET.length];
    return out;
  };
  const base = publicBaseUrl();
  const trackLinks = campaign.track_links !== false; // default on
  // Match short URLs we already generated (preview shortlinks from the builder).
  // Escape the base for regex use. Then skip re-shortening those and instead
  // just backfill message_id/campaign_id so they still count toward this send.
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SHORT_RE = new RegExp(`^${escapedBase}/r/([a-zA-Z0-9]{4,16})$`);
  const existingShortsToBind: Array<{ short_code: string; message_id: string }> = [];
  const rewriteBody = (body: string, messageId: string): string => {
    if (!trackLinks) return body;
    return body.replace(URL_RE, (originalUrl) => {
      const m = originalUrl.match(SHORT_RE);
      if (m) {
        // Already a xellvio.com/r/<code> link (preview shortlink). Keep as-is
        // but attach this message to it so per-recipient sends aggregate cleanly.
        existingShortsToBind.push({ short_code: m[1], message_id: messageId });
        return originalUrl;
      }
      const code = shortCode(8);
      linkRows.push({
        short_code: code,
        message_id: messageId,
        campaign_id: campaign.id,
        account_id: campaign.account_id,
        url: originalUrl,
      });
      return `${base}/r/${code}`;
    });
  };


  for (const r of enriched) {
    const messageId = crypto.randomUUID();
    const rewritten = rewriteBody(r.body, messageId);
    // Recompute segments after rewrite in case link length changed the count.
    const segs = calculateSegments(rewritten).segments;
    const rate = rateByCC[r.country_code];
    const unit = rate ? Number(rate.sell_price) : 0;
    const mult = hasMedia && rate ? Number(rate.mms_multiplier) : 1;
    const cost = +(segs * unit * mult).toFixed(4);
    const rowBase = {
      id: messageId,
      campaign_id: campaign.id,
      profile_id: r.profile_id,
      phone_e164: r.phone_e164,
      country_code: r.country_code,
      segments_count: segs,
      is_mms: hasMedia && !!rate && supportsMms(r.country_code),
      cost,
      rendered_body: rewritten,
    };
    if (cost === 0) queuedRows.push({ ...rowBase, status: "queued" });
    else if (cost <= remaining) { remaining -= cost; queuedRows.push({ ...rowBase, status: "queued" }); }
    else failedRows.push({ ...rowBase, status: "failed", error_code: "insufficient_balance" });
  }

  // Upsert with ignoreDuplicates rather than a plain insert: this is the
  // hard backstop against ever double-planning (and therefore double-
  // charging/double-sending) a recipient, regardless of whether the
  // in-memory `planned` exclusion set above is ever wrong for any reason.
  // Relies on the messages_campaign_profile_unique constraint.
  const allRows = [...queuedRows, ...failedRows];
  for (let i = 0; i < allRows.length; i += PLAN_INSERT_CHUNK) {
    const chunk = allRows.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: insErr } = await supabaseAdmin
      .from("messages")
      .upsert(chunk, { onConflict: "campaign_id,profile_id", ignoreDuplicates: true });
    if (insErr) throw new Error(`Failed to insert message batch: ${insErr.message}`);
  }

  // Insert link_clicks rows only for messages that actually got queued (not
  // insufficient_balance failures — those never send, so no click can happen).
  const queuedIds = new Set(queuedRows.map((r) => r.id));
  const linksToInsert = linkRows.filter((l) => queuedIds.has(l.message_id));
  for (let i = 0; i < linksToInsert.length; i += PLAN_INSERT_CHUNK) {
    const chunk = linksToInsert.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: linkErr } = await supabaseAdmin.from("link_clicks").insert(chunk);
    if (linkErr) console.error("[dispatch] link_clicks insert failed", linkErr.message);
  }

  // Backfill preview shortlinks (created in the builder before dispatch) with
  // this campaign so their clicks show up on this campaign's report.
  if (existingShortsToBind.length > 0) {
    const codes = Array.from(new Set(existingShortsToBind.map((x) => x.short_code)));
    await supabaseAdmin
      .from("link_clicks")
      .update({ campaign_id: campaign.id })
      .in("short_code", codes)
      .is("campaign_id", null);
  }

  // Only the FIRST batch can conclude "nothing could be queued for anyone" —
  // a later batch returning zero queued rows (e.g. balance ran out mid-
  // campaign) must not overwrite a campaign that already has earlier
  // messages queued/sent from previous ticks.
  if (queuedRows.length === 0 && isFirstBatch) {
    // Distinguish "nobody was eligible" from "balance couldn't cover anyone":
    // reporting the latter for an empty audience is misleading.
    const reason = failedRows.length > 0 ? "insufficient_balance" : "no_eligible_recipients";
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "failed",
        paused_reason:
          reason === "insufficient_balance"
            ? "Not enough credit to send to any recipient"
            : "No eligible recipients — the selected audience was empty after exclusions",
      })
      .eq("id", campaign.id);
    return { planned: 0, skipped: failedRows.length, cost: totalCost, reason };
  }
  if (isFirstBatch) {
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
    try {
      const { sendAdminPush } = await import("@/lib/admin-push.server");
      const { data: acct } = await supabaseAdmin.from("accounts")
        .select("full_name, email, contact_email").eq("id", campaign.account_id).maybeSingle();
      const who = acct?.full_name || acct?.contact_email || acct?.email || "A tenant";
      await sendAdminPush({
        title: "Campaign started",
        body: `${who} is sending "${campaign.name ?? "Untitled"}".`,
        url: `/admin/messages`,
        tag: `camp-start-${campaign.id}`,
      });
    } catch (e) { console.error("[dispatch] push start failed", e); }
  } else if (queuedRows.length > 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  }
  return { planned: queuedRows.length, skipped: failedRows.length, cost: totalCost };
}

async function deliverPending(
  supabaseAdmin: any, campaign: any, sender: Sender,
): Promise<{ sent: number; failed: number; debited: number; remaining: number; cancelled?: boolean }> {
  const { data: fresh } = await supabaseAdmin
    .from("campaigns").select("status").eq("id", campaign.id).maybeSingle();
  if (fresh?.status === "cancelled") {
    return { sent: 0, failed: 0, debited: 0, remaining: 0, cancelled: true };
  }

  const { data: batch, error: qErr } = await supabaseAdmin.rpc("claim_campaign_messages", {
    _campaign_id: campaign.id,
    _limit: DELIVER_PER_WORKER,
  });
  if (qErr) throw new Error(qErr.message);
  const rows = batch ?? [];
  if (rows.length === 0) {
    const { count: stillPending } = await supabaseAdmin
      .from("messages").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
    if ((stillPending ?? 0) === 0) {
      await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
    }
    return { sent: 0, failed: 0, debited: 0, remaining: stillPending ?? 0 };
  }

  let sent = 0, failed = 0, debited = 0, shaftErrors = 0;
  await runWithConcurrency(rows, DELIVER_CONCURRENCY, async (m: any) => {
    const r = await sendOneMessage(supabaseAdmin, campaign, sender, m);
    if (r.ok) { sent++; debited += r.debited; }
    else { failed++; if (r.shaft) shaftErrors++; }
  });

  if (shaftErrors >= 2) {
    await flagAccountForReview(supabaseAdmin, campaign.account_id, "shaft_carrier_errors",
      `${shaftErrors} messages blocked by carrier for prohibited content. Campaign ${campaign.id}.`);
  }

  const { count: remaining } = await supabaseAdmin
    .from("messages").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
  if ((remaining ?? 0) === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
  } else {
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  }
  return { sent, failed, debited: +debited.toFixed(4), remaining: remaining ?? 0 };
}

async function processCampaign(supabaseAdmin: any, campaign: any, rates: Rate[], sender: Sender): Promise<any> {
  const { count: existing } = await supabaseAdmin
    .from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id);
  const isFirstBatch = (existing ?? 0) === 0;

  if (isFirstBatch) {
    const begin = await beginCampaignIfNeeded(supabaseAdmin, campaign);
    if (!begin.ok) return { planned: 0, skipped: 0, cost: 0, reason: begin.reason };
  }

  const { recipients, hasMore } = await loadNextUnplannedBatch(
    supabaseAdmin, campaign.id, campaign.account_id,
    campaign.audience ?? { include: [], exclude: [] }, PLAN_BATCH_SIZE,
  );

  const planned = recipients.length > 0
    ? await planCampaign(supabaseAdmin, campaign, rates, recipients, isFirstBatch)
    : { planned: 0, skipped: 0, cost: 0 };

  // If a full batch of still-unplanned recipients remains, defer delivery to
  // the next tick — this keeps one invocation's total work (a planning
  // batch, or a planning batch plus delivery) bounded, instead of planning
  // an entire large campaign's recipient list in a single request.
  if (hasMore) {
    return { ...planned, deferred_delivery: true };
  }

  if (planned.planned === 0 && isFirstBatch && recipients.length > 0) {
    // Nothing could be queued at all (e.g. insufficient balance for every
    // recipient) — planCampaign already marked the campaign failed.
    return planned;
  }

  const delivered = await deliverPending(supabaseAdmin, campaign, sender);
  return { ...planned, delivered_now: delivered.sent, failed_now: delivered.failed, remaining: delivered.remaining };
}

async function reconcileStaleCarrierReceipts(supabaseAdmin: any): Promise<{ checked: number; updated: number; stillAwaiting: number; expired: number }> {
  // Some carriers (mostly EU/UK) never return a final delivery receipt. After 24h
  // there is nothing more to wait for — close those out so reports stop showing
  // them as "awaiting carrier" forever.
  const giveUpCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: expiredRows } = await supabaseAdmin
    .from("messages")
    .update({
      status: "delivery_unconfirmed",
      failure_reason: "No delivery receipt returned by the carrier within 24 hours.",
    })
    .eq("status", "sent")
    .lt("sent_at", giveUpCutoff)
    .select("id");
  const expired = (expiredRows ?? []).length;

  const checkedRecentlyCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const sentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const maxPerRun = 100;
  const toCheck: Array<{ id: string; provider_message_id: string; status: string }> = [];
  const pageSize = 500;
  for (let from = 0; from < 5_000 && toCheck.length < maxPerRun; from += pageSize) {
    const { data: candidates } = await supabaseAdmin
      .from("messages")
      .select("id, provider_message_id, status")
      .eq("status", "sent")
      .lt("sent_at", sentCutoff)
      .not("provider_message_id", "is", null)
      .filter("provider_message_id", "not.ilike", "SM%")
      .order("sent_at", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1);

    const rows = (candidates ?? []) as Array<{ id: string; provider_message_id: string; status: string }>;
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.id);
    const { data: recentChecks } = await supabaseAdmin
      .from("events")
      .select("message_id")
      .in("message_id", ids)
      .eq("type", "reconcile:checked:sent")
      .gte("created_at", checkedRecentlyCutoff);
    const recentlyChecked = new Set((recentChecks ?? []).map((e: any) => e.message_id));
    toCheck.push(...rows.filter((r) => !recentlyChecked.has(r.id)).slice(0, maxPerRun - toCheck.length));
    if (rows.length < pageSize) break;
  }
  if (toCheck.length === 0) return { checked: 0, updated: 0, stillAwaiting: 0, expired };


  const { getMessage, mapTelnyxStatus } = await import("@/lib/telnyx.server");
  let updated = 0;
  let stillAwaiting = 0;
  await runWithConcurrency(toCheck, 20, async (m) => {
    try {
      const j = await getMessage(m.provider_message_id);
      const first = Array.isArray(j?.to) ? j.to[0] : null;
      const rawStatus = first?.status ?? j?.status ?? "";
      const errCode = first?.errors?.[0]?.code ?? j?.errors?.[0]?.code ?? null;
      const errDetail = first?.errors?.[0]?.detail ?? first?.errors?.[0]?.title ?? j?.errors?.[0]?.detail ?? j?.errors?.[0]?.title ?? null;
      let newStatus = mapTelnyxStatus(rawStatus);
      if (newStatus === "sent" && errCode) newStatus = "undelivered";
      if (newStatus === "sent") {
        stillAwaiting += 1;
        await supabaseAdmin.from("events").insert({
          message_id: m.id,
          type: "reconcile:checked:sent",
          payload: { provider_status: rawStatus || null },
        });
        return;
      }
      const update: any = { status: newStatus };
      if (newStatus === "delivered") update.delivered_at = new Date().toISOString();
      if (errCode) update.error_code = String(errCode);
      if (errDetail) update.failure_reason = String(errDetail).slice(0, 500);
      if (newStatus === "delivery_unconfirmed" && !errDetail) {
        update.failure_reason = "Carrier finalized the message without a delivery confirmation.";
      }
      await supabaseAdmin.from("messages").update(update).eq("id", m.id);
      await supabaseAdmin.from("events").insert({ message_id: m.id, type: `reconcile:${newStatus}`, payload: j });
      updated += 1;
    } catch (e) {
      await supabaseAdmin.from("events").insert({
        message_id: m.id,
        type: "reconcile:error",
        payload: { error: String(e) },
      });
    }
  });
  return { checked: toCheck.length, updated, stillAwaiting, expired };
}

export const Route = createFileRoute("/api/public/dispatch-campaign")({

  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!process.env.TELNYX_API_KEY) {
          return Response.json({ error: "Telnyx not configured" }, { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Guard against overlapping invocations: if pg_cron fires a new tick
        // while a previous one is still mid-flight, two concurrent calls to
        // claim_campaign_messages for the same campaign can each claim (and
        // charge) different rows, and if one of those invocations doesn't
        // finish cleanly, its claimed rows are left stranded in `sending`.
        // Self-heals after 90s if a prior run crashed without releasing.
        const { data: gotLock } = await (supabaseAdmin as any).rpc("try_acquire_dispatch_lock");
        if (!gotLock) {
          return Response.json({ skipped: "dispatch_already_running" });
        }

        try {
          return await runDispatchTick(supabaseAdmin);
        } finally {
          await (supabaseAdmin as any).rpc("release_dispatch_lock");
        }
      },
    },
  },
});

async function runDispatchTick(supabaseAdmin: any): Promise<Response> {
        const { data: ratesRows } = await supabaseAdmin
          .from("country_rates")
          .select("country_code,dial_prefix,sell_price,mms_multiplier,active")
          .eq("active", true);
        const rates = (ratesRows ?? []) as Rate[];

        const nowIso = new Date().toISOString();

        // ── Auto-approve expired review-queue entries and requeue their campaigns.
        const nowExpiry = new Date().toISOString();
        const { data: expiredReviews } = await supabaseAdmin
          .from("review_queue")
          .select("id, campaign_id")
          .eq("status", "pending")
          .lte("auto_approve_at", nowExpiry);
        for (const r of expiredReviews ?? []) {
          await supabaseAdmin.from("review_queue")
            .update({ status: "auto_approved", resolved_at: nowExpiry })
            .eq("id", r.id);
          if (r.campaign_id) {
            await supabaseAdmin.from("campaigns")
              .update({ status: "queued", paused_reason: null })
              .eq("id", r.campaign_id).eq("status", "paused");
          }
        }


        const { data: due, error } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .or(`status.eq.queued,status.eq.sending,and(status.eq.scheduled,schedule_at.lte.${nowIso})`)
          .limit(10);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const startedAt = Date.now();
        const budgetLeft = () => RUN_BUDGET_MS - (Date.now() - startedAt);

        const results: any[] = [];
        let deferred = 0;
        for (const c of due ?? []) {
          if (budgetLeft() < 5_000) { deferred += 1; continue; }
          try {

            const { data: acct } = await supabaseAdmin
              .from("accounts")
              .select("telnyx_messaging_profile_id, telnyx_phone_number, onboarding_status, sending_suspended_at, tos_current_version_accepted")
              .eq("id", c.account_id).maybeSingle();
            if (acct?.onboarding_status === "suspended" || acct?.sending_suspended_at) {
              await supabaseAdmin.from("campaigns")
                .update({ status: "paused", paused_reason: "Tenant sending suspended", paused_at: new Date().toISOString() })
                .eq("id", c.id);
              results.push({ id: c.id, error: "tenant_sending_suspended" });
              continue;
            }
            // ── ToS gate: tenant must have accepted the current version.
            const { TOS_CURRENT_VERSION } = await import("@/lib/tos");
            if (acct?.tos_current_version_accepted !== TOS_CURRENT_VERSION) {
              await supabaseAdmin.from("campaigns")
                .update({ status: "paused", paused_reason: "Tenant must accept updated Terms of Service before sending.", paused_at: new Date().toISOString() })
                .eq("id", c.id);
              results.push({ id: c.id, error: "tos_acceptance_required" });
              continue;
            }
            // ── Per-campaign compliance re-confirmation must exist.
            const { count: campTos } = await supabaseAdmin
              .from("campaign_tos_acceptances")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", c.id)
              .eq("tos_version", TOS_CURRENT_VERSION);
            if ((campTos ?? 0) === 0) {
              await supabaseAdmin.from("campaigns")
                .update({ status: "paused", paused_reason: "Missing per-campaign compliance confirmation.", paused_at: new Date().toISOString() })
                .eq("id", c.id);
              results.push({ id: c.id, error: "campaign_acceptance_required" });
              continue;
            }

            const { data: senderAssets } = await supabaseAdmin
              .from("sender_assets")
              .select("verification_status,country_code,sender_kind,phone_number,telnyx_messaging_profile_id")
              .eq("account_id", c.account_id);
            const verifiedSender = (senderAssets ?? []).find(
              (s: any) => s.verification_status === "verified" && (s.telnyx_messaging_profile_id || s.phone_number),
            );
            if ((senderAssets ?? []).length > 0 && !verifiedSender) {
              results.push({ id: c.id, skipped: "sender_pending_verification" });
              continue;
            }
            const { isValidTelnyxUuid, ensureMessagingProfileForAccount } = await import("@/lib/telnyx.server");
            // Auto-provision the Telnyx Messaging Profile if none valid on this account.
            let profileId: string | null = isValidTelnyxUuid(acct?.telnyx_messaging_profile_id)
              ? (acct!.telnyx_messaging_profile_id as string)
              : null;
            if (!profileId) {
              try {
                profileId = await ensureMessagingProfileForAccount(c.account_id);
              } catch (e: any) {
                await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
                results.push({ id: c.id, error: `profile_provision_failed: ${e?.message ?? e}` });
                continue;
              }
            }
            const assetProfileId = isValidTelnyxUuid(verifiedSender?.telnyx_messaging_profile_id)
              ? (verifiedSender!.telnyx_messaging_profile_id as string)
              : null;
            const sender: Sender = {
              messagingProfileId: assetProfileId ?? profileId,
              fromNumber: verifiedSender?.phone_number ?? acct?.telnyx_phone_number ?? null,
              assets: (senderAssets ?? []).filter((s: any) => s.verification_status === "verified"),
            };
            const r = await processCampaign(supabaseAdmin, c, rates, sender);
            results.push({ id: c.id, ...r });
          } catch (e: any) {
            await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
            results.push({ id: c.id, error: e.message });
          }
        }
        // Reconciliation is best-effort housekeeping — never let it eat the
        // budget that live sending needs.
        const reconciled = budgetLeft() > 12_000
          ? await reconcileStaleCarrierReceipts(supabaseAdmin)
          : { checked: 0, updated: 0, stillAwaiting: 0, expired: 0, skipped: true };
        return Response.json({ processed: results.length, deferred, reconciled, results });
}
