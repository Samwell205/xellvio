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
    messaging_service_sid?: string | null; // now stores telnyx messaging_profile_id
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

    const matched = sender.assets.find(
      (a) => a.country_code === m.country_code && (a.messaging_service_sid || a.phone_number),
    );
    const messagingProfileId = matched?.messaging_service_sid ?? sender.messagingProfileId ?? undefined;
    const fromNumber = matched?.phone_number ?? sender.fromNumber ?? undefined;

    if (!messagingProfileId && !fromNumber) {
      await supabaseAdmin.from("messages")
        .update({ status: "failed", error_code: "no_sender" }).eq("id", m.id);
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
    await supabaseAdmin.from("messages")
      .update({ status: "failed", error_code: code || "exception" }).eq("id", m.id);
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
  for (const r of enriched) {
    const base = {
      campaign_id: campaign.id,
      profile_id: r.profile_id,
      phone_e164: r.phone_e164,
      country_code: r.country_code,
      segments_count: r.segments,
      cost: r.cost,
      rendered_body: r.body,
    };
    if (r.cost === 0) queuedRows.push({ ...base, status: "queued" });
    else if (r.cost <= remaining) { remaining -= r.cost; queuedRows.push({ ...base, status: "queued" }); }
    else failedRows.push({ ...base, status: "failed", error_code: "insufficient_balance" });
  }

  const allRows = [...queuedRows, ...failedRows];
  for (let i = 0; i < allRows.length; i += PLAN_INSERT_CHUNK) {
    const chunk = allRows.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: insErr } = await supabaseAdmin.from("messages").insert(chunk);
    if (insErr) throw new Error(`Failed to insert message batch: ${insErr.message}`);
  }
  if (queuedRows.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return { planned: 0, skipped: failedRows.length, cost: totalCost, reason: "insufficient_balance" };
  }
  await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
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
              .select("telnyx_messaging_profile_id, twilio_subaccount_sid, subaccount_phone_number, onboarding_status")
              .eq("id", c.account_id).maybeSingle();
            if (acct?.onboarding_status === "suspended") {
              await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
              results.push({ id: c.id, error: "account_suspended" });
              continue;
            }
            const { data: senderAssets } = await supabaseAdmin
              .from("sender_assets")
              .select("verification_status,country_code,sender_kind,phone_number,messaging_service_sid")
              .eq("account_id", c.account_id);
            const verifiedSender = (senderAssets ?? []).find(
              (s: any) => s.verification_status === "verified" && (s.messaging_service_sid || s.phone_number),
            );
            if ((senderAssets ?? []).length > 0 && !verifiedSender) {
              results.push({ id: c.id, skipped: "sender_pending_verification" });
              continue;
            }
            // Auto-provision the Telnyx Messaging Profile if this account has none yet.
            let profileId: string | null =
              acct?.telnyx_messaging_profile_id ?? acct?.twilio_subaccount_sid ?? null;
            if (!profileId) {
              try {
                const { ensureMessagingProfileForAccount } = await import("@/lib/telnyx.server");
                profileId = await ensureMessagingProfileForAccount(c.account_id);
              } catch (e: any) {
                await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
                results.push({ id: c.id, error: `profile_provision_failed: ${e?.message ?? e}` });
                continue;
              }
            }
            const sender: Sender = {
              messagingProfileId: verifiedSender?.messaging_service_sid ?? profileId,
              fromNumber: verifiedSender?.phone_number ?? acct?.subaccount_phone_number ?? null,
              assets: (senderAssets ?? []).filter((s: any) => s.verification_status === "verified"),
            };
            const r = await processCampaign(supabaseAdmin, c, rates, sender);
            results.push({ id: c.id, ...r });
          } catch (e: any) {
            await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
            results.push({ id: c.id, error: e.message });
          }
        }
        return Response.json({ processed: results.length, results });
      },
    },
  },
});
