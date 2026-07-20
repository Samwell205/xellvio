// Telnyx-backed campaign dispatcher. Sends via Telnyx Messages API scoped to
// each tenant's Messaging Profile. Twilio has been removed entirely.

import { createFileRoute } from "@tanstack/react-router";
import { calculateSegments } from "@/lib/sms-segments";
import { countryFromPhone } from "@/lib/country-from-phone";
import { keywordScan } from "@/lib/content-scanner";

const PLAN_INSERT_CHUNK = 500;
const DELIVER_PER_WORKER = 500;
const DELIVER_CONCURRENCY = 100;

function render(body: string, p: { first_name?: string | null; last_name?: string | null }) {
  return body
    .replaceAll("{{first_name}}", p.first_name ?? "")
    .replaceAll("{{last_name}}", p.last_name ?? "");
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
      .filter((a) => a.country_code === m.country_code && (a.telnyx_messaging_profile_id || a.phone_number))
      .sort((a, b) => rank(a.sender_kind) - rank(b.sender_kind));
    const matched = candidates[0];

    if (!matched) {
      await supabaseAdmin.from("messages")
        .update({
          status: "failed",
          error_code: "sender_not_registered_for_country",
          failure_reason: `No verified sender configured for ${m.country_code ?? "unknown country"}`,
        }).eq("id", m.id);
      return { ok: false, shaft: false, debited: 0 };
    }
    const messagingProfileId = matched.telnyx_messaging_profile_id ?? sender.messagingProfileId ?? undefined;
    const fromNumber = matched.phone_number ?? sender.fromNumber ?? undefined;
    const senderKindUsed = matched.sender_kind ?? "unknown";
    const senderUsed = fromNumber ?? messagingProfileId ?? "unknown";

    if (!messagingProfileId && !fromNumber) {
      await supabaseAdmin.from("messages")
        .update({ status: "failed", error_code: "no_sender", failure_reason: "No sender available" })
        .eq("id", m.id);
      return { ok: false, shaft: false, debited: 0 };
    }

    // ── Per-recipient compliance gate (suspension + frequency cap).
    const { fastPerRecipientGate } = await import("@/lib/content-screening.server");
    const gate = await fastPerRecipientGate(campaign.account_id, m.phone_e164);
    if (!gate.ok) {
      await supabaseAdmin.from("messages")
        .update({ status: "failed", error_code: gate.reason, failure_reason: `Blocked pre-send: ${gate.reason}` })
        .eq("id", m.id);
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
    await supabaseAdmin.from("messages").update({
      status: "sent",
      provider_message_id: result.id,
      sent_at: new Date().toISOString(),
      segments_count: providerSegments,
      sender_used: senderUsed,
      sender_kind: senderKindUsed,
    }).eq("id", m.id);

    let debited = 0;
    try {
      await supabaseAdmin.rpc("debit_account", {
        _account_id: campaign.account_id,
        _amount: Number(m.cost),
        _campaign_id: campaign.id,
        _description: `SMS → ${m.phone_e164} (${m.country_code ?? "??"}) × ${m.segments_count}`,
      });
      debited = Number(m.cost);
    } catch (e) {
      await supabaseAdmin.from("events").insert({
        message_id: m.id, type: "debit_failed", payload: { error: String(e) },
      });
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

    return { ok: true, shaft: false, debited };
  } catch (e: any) {
    const code = String(e?.telnyxCode ?? "");
    const reason = e?.telnyxMessage ?? e?.message ?? "Send failed";
    await supabaseAdmin.from("messages")
      .update({ status: "failed", error_code: code || "exception", failure_reason: String(reason).slice(0, 500) })
      .eq("id", m.id);
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

async function planCampaign(
  supabaseAdmin: any, campaign: any, rates: Rate[],
): Promise<{ planned: number; skipped: number; cost: number; reason?: string }> {
  // ── Legacy fast keyword scan (kept for backwards compat with the badge).
  const preScan = keywordScan(campaign.message_body ?? "");
  if (!preScan.allowed) {
    await supabaseAdmin.from("campaigns")
      .update({ status: "blocked_content", paused_reason: preScan.reason }).eq("id", campaign.id);
    await flagAccountForReview(supabaseAdmin, campaign.account_id, "content_violation_dispatch", preScan.reason ?? "");
    return { planned: 0, skipped: 0, cost: 0, reason: "blocked_content" };
  }


  const list = await loadEligibleRecipients(supabaseAdmin, campaign.account_id, campaign.audience ?? { include: [], exclude: [] });
  if (list.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
    return { planned: 0, skipped: 0, cost: 0 };
  }

  // ── Full compliance screening once per campaign (all body-scoped checks +
  //    volume anomaly). Per-recipient frequency cap runs later in sendOneMessage.
  {
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
      return { planned: 0, skipped: 0, cost: 0, reason: "blocked_by_screening" };
    }
    if (screen.action === "held_for_review") {
      await supabaseAdmin.from("campaigns")
        .update({
          status: "paused",
          paused_reason: `Held for review (risk ${screen.riskScore}/100). ${screen.blockedReasons.slice(0, 2).join(" · ")}`,
          paused_at: new Date().toISOString(),
        }).eq("id", campaign.id);
      return { planned: 0, skipped: 0, cost: 0, reason: "held_for_review" };
    }
  }


  const dial = rates.map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }));
  const rateByCC: Record<string, Rate> = {};
  for (const r of rates) rateByCC[r.country_code] = r;
  const hasMedia = !!campaign.media_url;

  const enriched = list.map((p: any) => {
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
  const rewriteBody = (body: string, messageId: string): string => {
    return body.replace(URL_RE, (originalUrl) => {
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
      cost,
      rendered_body: rewritten,
    };
    if (cost === 0) queuedRows.push({ ...rowBase, status: "queued" });
    else if (cost <= remaining) { remaining -= cost; queuedRows.push({ ...rowBase, status: "queued" }); }
    else failedRows.push({ ...rowBase, status: "failed", error_code: "insufficient_balance" });
  }

  const allRows = [...queuedRows, ...failedRows];
  for (let i = 0; i < allRows.length; i += PLAN_INSERT_CHUNK) {
    const chunk = allRows.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: insErr } = await supabaseAdmin.from("messages").insert(chunk);
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

  if (queuedRows.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return { planned: 0, skipped: failedRows.length, cost: totalCost, reason: "insufficient_balance" };
  }
  await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  try {
    const { sendAdminPush } = await import("@/lib/admin-push.server");
    const { data: acct } = await supabaseAdmin.from("accounts")
      .select("full_name, email, contact_email").eq("id", campaign.account_id).maybeSingle();
    const who = acct?.full_name || acct?.contact_email || acct?.email || "A tenant";
    await sendAdminPush({
      title: "Campaign started",
      body: `${who} is sending "${campaign.name ?? "Untitled"}" — ${queuedRows.length} messages queued.`,
      url: `/admin/messages`,
      tag: `camp-start-${campaign.id}`,
    });
  } catch (e) { console.error("[dispatch] push start failed", e); }
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
  if ((existing ?? 0) === 0) {
    const planned = await planCampaign(supabaseAdmin, campaign, rates);
    if (planned.planned > 0) {
      const delivered = await deliverPending(supabaseAdmin, campaign, sender);
      return { ...planned, delivered_now: delivered.sent, failed_now: delivered.failed, remaining: delivered.remaining };
    }
    return planned;
  }
  return await deliverPending(supabaseAdmin, campaign, sender);
}

async function reconcileStaleCarrierReceipts(supabaseAdmin: any): Promise<{ checked: number; updated: number; stillAwaiting: number }> {
  const checkedRecentlyCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const sentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const toCheck: Array<{ id: string; provider_message_id: string; status: string }> = [];
  const pageSize = 500;
  for (let from = 0; from < 5_000 && toCheck.length < 100; from += pageSize) {
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
    toCheck.push(...rows.filter((r) => !recentlyChecked.has(r.id)).slice(0, 100 - toCheck.length));
    if (rows.length < pageSize) break;
  }
  if (toCheck.length === 0) return { checked: 0, updated: 0, stillAwaiting: 0 };

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
  return { checked: toCheck.length, updated, stillAwaiting };
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

        const { data: ratesRows } = await supabaseAdmin
          .from("country_rates")
          .select("country_code,dial_prefix,sell_price,mms_multiplier,active")
          .eq("active", true);
        const rates = (ratesRows ?? []) as Rate[];

        const nowIso = new Date().toISOString();
        const stalledCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await supabaseAdmin.from("campaigns")
          .update({ status: "queued" }).eq("status", "sending").lt("updated_at", stalledCutoff);

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

        const results: any[] = [];
        for (const c of due ?? []) {
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
        const reconciled = await reconcileStaleCarrierReceipts(supabaseAdmin);
        return Response.json({ processed: results.length, reconciled, results });
      },
    },
  },
});
