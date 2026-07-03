import { createFileRoute } from "@tanstack/react-router";
import { calculateSegments } from "@/lib/sms-segments";
import { countryFromPhone } from "@/lib/country-from-phone";
import { keywordScan } from "@/lib/content-scanner";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
// How many messages to insert per DB batch during the "plan" phase.
const PLAN_INSERT_CHUNK = 500;
// How many messages to actually send to the SMS provider per cron invocation.
// Keeps each Worker invocation well within CPU / subrequest limits so large
// campaigns (thousands of recipients) drain safely over multiple ticks.
const DELIVER_PER_TICK = 600;
// Max parallel HTTP calls to the SMS provider inside one invocation.
const DELIVER_CONCURRENCY = 50;

function render(body: string, p: { first_name?: string | null; last_name?: string | null }) {
  return body
    .replaceAll("{{first_name}}", p.first_name ?? "")
    .replaceAll("{{last_name}}", p.last_name ?? "");
}

async function statusCallbackUrl(): Promise<string> {
  const base = process.env.PUBLIC_BASE_URL ?? "https://xellvio.com";
  return `${base}/api/public/twilio-status`;
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

type Sender =
  | { kind: "platform"; lovableKey: string; twilioKey: string; messagingService: string }
  | {
      kind: "tenant";
      subaccountSid: string;
      subaccountToken: string;
      messagingService?: string;
      fromNumber?: string;
      assets?: Array<{
        country_code: string;
        sender_kind?: string | null;
        messaging_service_sid?: string | null;
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

function mainSmsAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("SMS provider credentials are not configured");
  return { sid, token };
}

// SHAFT-related Twilio error codes that indicate prohibited content
function isShaftError(twilioCode: string): boolean {
  return [
    "30007", // Message filtered (carrier violation / SHAFT)
    "21610", // Message to recipient blocked
    "30034", // Content filtering (T-Mobile)
    "30004", // Message blocked
  ].includes(twilioCode);
}

async function flagAccountForReview(
  supabaseAdmin: any,
  accountId: string,
  reason: string,
  detail: string,
) {
  try {
    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("email, suspended_at")
      .eq("id", accountId)
      .maybeSingle();
    if (acct?.suspended_at) return; // already suspended

    await supabaseAdmin
      .from("accounts")
      .update({ suspended_at: new Date().toISOString(), onboarding_status: "suspended" })
      .eq("id", accountId);

    // Log event for audit trail
    await supabaseAdmin.from("events").insert({
      type: "account_auto_suspended",
      account_id: accountId,
      payload: { reason, detail },
    });

    // Best-effort admin alert via email queue
    try {
      const { data: settings } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "twilio_alert_emails")
        .maybeSingle();
      const emailsRaw = String(settings?.value ?? "admin@xellvio.com");
      const emails = emailsRaw.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
      for (const to of emails) {
        await supabaseAdmin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to,
            subject: `🚨 Account auto-suspended: prohibited content`,
            html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;"><h1 style="color:#b91c1c;">Account Suspended</h1><p>Account ${accountId} (${acct?.email ?? "no email"}) was auto-suspended.</p><p><b>Reason:</b> ${reason}</p><p><b>Detail:</b> ${detail}</p></div>`,
            text: `Account ${accountId} auto-suspended. Reason: ${reason}. Detail: ${detail}.`,
            template_name: "account_suspended_alert",
            message_id: `acct-susp-${accountId}-${Date.now()}`,
          } as any,
        });
      }
    } catch {
      // alert best-effort
    }
  } catch (e) {
    console.error("[dispatch] flagAccountForReview failed", e);
  }
}

// Send a single already-queued message row through the SMS provider.
async function sendOneMessage(
  supabaseAdmin: any,
  campaign: any,
  sender: Sender,
  m: any,
  callback: string,
): Promise<{ ok: boolean; shaft: boolean; debited: number }> {
  try {
    const sendAsMms = !!campaign.media_url && supportsMms(m.country_code);
    const messageBody =
      campaign.media_url && !sendAsMms ? fallbackMediaBody(m.rendered_body, m.id) : m.rendered_body;
    const body = new URLSearchParams({
      To: m.phone_e164,
      Body: messageBody,
      StatusCallback: callback,
    });
    if (sender.kind === "tenant") {
      const matchedSender = sender.assets?.find(
        (asset) =>
          asset.country_code === m.country_code &&
          (asset.messaging_service_sid || asset.phone_number),
      );
      const messagingService = matchedSender?.messaging_service_sid ?? sender.messagingService;
      const fromNumber = matchedSender?.phone_number ?? sender.fromNumber;
      if (messagingService) body.append("MessagingServiceSid", messagingService);
      else body.append("From", fromNumber!);
    } else {
      body.append("MessagingServiceSid", sender.messagingService);
    }
    if (sendAsMms) body.append("MediaUrl", campaign.media_url);

    const fetchInit: RequestInit =
      sender.kind === "tenant"
        ? {
            method: "POST",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(`${sender.subaccountSid}:${sender.subaccountToken}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          }
        : {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sender.lovableKey}`,
              "X-Connection-Api-Key": sender.twilioKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          };

    const url =
      sender.kind === "tenant"
        ? `https://api.twilio.com/2010-04-01/Accounts/${sender.subaccountSid}/Messages.json`
        : `${GATEWAY_URL}/Messages.json`;
    const res = await fetch(url, fetchInit);
    const json: any = await res.json().catch(() => ({}));
    const twilioCode = String(json?.code ?? "");
    if (!res.ok) {
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed", error_code: twilioCode || String(res.status) })
        .eq("id", m.id);
      return { ok: false, shaft: isShaftError(twilioCode), debited: 0 };
    }
    const providerSegments = Number(json.num_segments ?? m.segments_count ?? 1);
    await supabaseAdmin
      .from("messages")
      .update({
        status: "sent",
        provider_message_id: json.sid,
        sent_at: new Date().toISOString(),
        segments_count: providerSegments,
      })
      .eq("id", m.id);

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
        message_id: m.id,
        type: "debit_failed",
        payload: { error: String(e) },
      });
    }

    // Mirror to Gorgias (best effort).
    try {
      const { forwardSmsToGorgias } = await import("@/lib/gorgias.server");
      const ourNumber =
        sender.kind === "tenant"
          ? (sender.assets?.find((a: any) => a.country_code === m.country_code)?.phone_number ??
              sender.fromNumber ??
              null)
          : null;
      await forwardSmsToGorgias({
        accountId: campaign.account_id,
        phone: m.phone_e164,
        fromNumber: ourNumber,
        body: messageBody,
        direction: "outbound",
      });
    } catch (e) {
      console.error("[dispatch] gorgias mirror failed", e);
    }

    return { ok: true, shaft: false, debited };
  } catch (e) {
    await supabaseAdmin
      .from("messages")
      .update({ status: "failed", error_code: "exception" })
      .eq("id", m.id);
    return { ok: false, shaft: false, debited: 0 };
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

// Plan phase: compute recipients, run balance preflight, and bulk-insert all
// message rows (as "queued" or "failed"). Does NOT call the SMS provider — that
// happens on subsequent cron ticks in the deliver phase. This ensures large
// campaigns don't exceed a single Worker invocation's CPU/subrequest limits.
async function planCampaign(
  supabaseAdmin: any,
  campaign: any,
  rates: Rate[],
): Promise<{ planned: number; skipped: number; cost: number; paused?: boolean; reason?: string }> {
  const preScan = keywordScan(campaign.message_body ?? "");
  if (!preScan.allowed) {
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "blocked_content", paused_reason: preScan.reason })
      .eq("id", campaign.id);
    await flagAccountForReview(
      supabaseAdmin,
      campaign.account_id,
      "content_violation_dispatch",
      preScan.reason ?? "Keyword hit at dispatch",
    );
    return { planned: 0, skipped: 0, cost: 0, reason: "blocked_content" };
  }

  const list = await loadEligibleRecipients(
    supabaseAdmin,
    campaign.account_id,
    campaign.audience ?? { include: [], exclude: [] },
  );
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

  try {
    const { getMasterTwilioBalance, getBalanceBuffer, fireCapacityAlert } = await import(
      "@/lib/twilio-alerts.server"
    );
    const [{ balance: twBal, currency, ok }, buffer] = await Promise.all([
      getMasterTwilioBalance(),
      getBalanceBuffer(),
    ]);
    const availableToSend = Math.max(0, twBal - buffer);
    if (ok && totalCost > 0 && availableToSend <= 0) {
      const { data: pausedAcct } = await supabaseAdmin
        .from("accounts")
        .select("email")
        .eq("id", campaign.account_id)
        .maybeSingle();
      await supabaseAdmin
        .from("campaigns")
        .update({
          status: "paused_low_balance",
          paused_reason:
            "Platform is temporarily at capacity. Your campaign will resume automatically within a few minutes.",
          paused_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);
      const { count: pausedCount } = await supabaseAdmin
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "paused_low_balance");
      await fireCapacityAlert({
        kind: "campaign_paused",
        campaignId: campaign.id,
        campaignName: campaign.name,
        tenantEmail: (pausedAcct as any)?.email ?? null,
        twilioBalance: twBal,
        currency,
        campaignCost: totalCost,
        shortfall: +(buffer - twBal).toFixed(4),
        pausedCampaignCount: pausedCount ?? undefined,
      });
      return { planned: 0, skipped: 0, cost: totalCost, paused: true };
    }
    if (ok && totalCost > 0 && availableToSend < totalCost) {
      console.warn("[dispatch] provider balance cannot cover the full campaign yet; sending what is safely available", {
        campaignId: campaign.id,
        balance: twBal,
        cost: totalCost,
        reserve: buffer,
        availableToSend,
      });
    }
  } catch (e) {
    console.error("[dispatch] balance preflight failed (continuing)", e);
  }

  const { data: acct, error: aErr } = await supabaseAdmin
    .from("accounts")
    .select("credit_balance")
    .eq("id", campaign.account_id)
    .maybeSingle();
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
    if (r.cost === 0) {
      queuedRows.push({ ...base, status: "queued" });
    } else if (r.cost <= remaining) {
      remaining -= r.cost;
      queuedRows.push({ ...base, status: "queued" });
    } else {
      failedRows.push({ ...base, status: "failed", error_code: "insufficient_balance" });
    }
  }

  const allRows = [...queuedRows, ...failedRows];
  for (let i = 0; i < allRows.length; i += PLAN_INSERT_CHUNK) {
    const chunk = allRows.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: insErr } = await supabaseAdmin.from("messages").insert(chunk);
    if (insErr) throw new Error(`Failed to insert message batch: ${insErr.message}`);
  }

  if (queuedRows.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return {
      planned: 0,
      skipped: failedRows.length,
      cost: totalCost,
      reason: "insufficient_balance",
    };
  }

  await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  return { planned: queuedRows.length, skipped: failedRows.length, cost: totalCost };
}

// Deliver phase: send a bounded batch of queued messages for a campaign.
async function deliverPending(
  supabaseAdmin: any,
  campaign: any,
  sender: Sender,
): Promise<{ sent: number; failed: number; debited: number; remaining: number; cancelled?: boolean }> {
  const callback = await statusCallbackUrl();

  // Re-read the campaign status just before delivery so a user Cancel that
  // landed between the picker and here stops us cleanly.
  const { data: fresh } = await supabaseAdmin
    .from("campaigns")
    .select("status")
    .eq("id", campaign.id)
    .maybeSingle();
  if (fresh?.status === "cancelled") {
    return { sent: 0, failed: 0, debited: 0, remaining: 0, cancelled: true };
  }

  let providerBudget = Number.POSITIVE_INFINITY;
  try {
    const { getMasterTwilioBalance, getBalanceBuffer, fireCapacityAlert } = await import(
      "@/lib/twilio-alerts.server"
    );
    const [{ balance, currency, ok }, buffer] = await Promise.all([
      getMasterTwilioBalance(),
      getBalanceBuffer(),
    ]);
    if (ok) {
      providerBudget = Math.max(0, balance - buffer);
      if (providerBudget <= 0) {
        const { count: remainingQueued } = await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "queued");
        await supabaseAdmin
          .from("campaigns")
          .update({
            status: "paused_low_balance",
            paused_reason:
              "SMS sending is temporarily paused while provider capacity is topped up. It will resume automatically.",
            paused_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
        await fireCapacityAlert({
          kind: "mid_campaign_exhausted",
          campaignId: campaign.id,
          campaignName: campaign.name,
          tenantEmail: null,
          twilioBalance: balance,
          currency,
          campaignCost: 0,
          shortfall: +(buffer - balance).toFixed(4),
        });
        return { sent: 0, failed: 0, debited: 0, remaining: remainingQueued ?? 0 };
      }
    }
  } catch (e) {
    console.error("[dispatch] provider budget check failed (continuing)", e);
  }

  const { data: batch, error: qErr } = await supabaseAdmin
    .from("messages")
    .select("id, phone_e164, rendered_body, country_code, segments_count, cost")
    .eq("campaign_id", campaign.id)
    .eq("status", "queued")
    .order("cost", { ascending: true })
    .limit(DELIVER_PER_TICK);
  if (qErr) throw new Error(qErr.message);

  const rows = batch ?? [];
  if (rows.length === 0) {
    const { count: stillPending } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["queued", "sending"]);
    if ((stillPending ?? 0) === 0) {
      await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
    }
    return { sent: 0, failed: 0, debited: 0, remaining: stillPending ?? 0 };
  }

  let runningCost = 0;
  const affordableRows = rows.filter((r: any) => {
    const next = runningCost + Number(r.cost ?? 0);
    if (next > providerBudget) return false;
    runningCost = next;
    return true;
  });

  if (affordableRows.length === 0) {
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "paused_low_balance",
        paused_reason:
          "SMS sending is temporarily paused while provider capacity is topped up. It will resume automatically.",
        paused_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
    return { sent: 0, failed: 0, debited: 0, remaining: rows.length };
  }

  const ids = affordableRows.map((r: any) => r.id);
  // Claim rows so a concurrent tick can't double-send them.
  await supabaseAdmin.from("messages").update({ status: "sending" }).in("id", ids);

  let sent = 0;
  let failed = 0;
  let debited = 0;
  let shaftErrors = 0;

  await runWithConcurrency(affordableRows, DELIVER_CONCURRENCY, async (m: any) => {
    const r = await sendOneMessage(supabaseAdmin, campaign, sender, m, callback);
    if (r.ok) {
      sent++;
      debited += r.debited;
    } else {
      failed++;
      if (r.shaft) shaftErrors++;
    }
  });

  if (shaftErrors >= 2) {
    await flagAccountForReview(
      supabaseAdmin,
      campaign.account_id,
      "shaft_carrier_errors",
      `${shaftErrors} messages blocked by carrier for prohibited content (SHAFT). Campaign ${campaign.id}.`,
    );
  }

  const { count: remaining } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "queued");

  if ((remaining ?? 0) === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
  } else if (Number.isFinite(providerBudget) && runningCost >= providerBudget) {
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "paused_low_balance",
        paused_reason:
          "Some messages were sent. The remaining queued messages will resume automatically when provider capacity is topped up.",
        paused_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
  } else {
    // Bump updated_at so the stall-recovery watchdog doesn't reset us.
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  }

  return { sent, failed, debited: +debited.toFixed(4), remaining: remaining ?? 0 };
}

// Route entry point per campaign: decides whether to plan or deliver.
async function processCampaign(
  supabaseAdmin: any,
  campaign: any,
  rates: Rate[],
  sender: Sender,
): Promise<any> {
  const { count: existing } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id);

  if ((existing ?? 0) === 0) {
    const planned = await planCampaign(supabaseAdmin, campaign, rates);
    if (planned.planned > 0 && !planned.paused) {
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

        const lovableKey = process.env.LOVABLE_API_KEY;
        const twilioKey = process.env.TWILIO_API_KEY;
        const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID;
        if (!lovableKey || !twilioKey || !messagingService) {
          return Response.json({ error: "Twilio not configured" }, { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: ratesRows } = await supabaseAdmin
          .from("country_rates")
          .select("country_code,dial_prefix,sell_price,mms_multiplier,active")
          .eq("active", true);
        const rates = (ratesRows ?? []) as Rate[];

        const nowIso = new Date().toISOString();

        // Recovery: campaigns flipped to "sending" but stalled (worker crash or
        // timeout) for more than 5 minutes are reset to "queued" so the next
        // tick re-processes them. Without this they sit in "sending" forever.
        const stalledCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from("campaigns")
          .update({ status: "queued" })
          .eq("status", "sending")
          .lt("updated_at", stalledCutoff);

        // Pick campaigns that are queued, scheduled and due, OR already sending
        // (so we continue draining their queued messages across ticks).
        const { data: due, error } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .or(
            `status.eq.queued,status.eq.sending,and(status.eq.scheduled,schedule_at.lte.${nowIso})`,
          )
          .limit(10);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: any[] = [];
        for (const c of due ?? []) {
          try {
            const { data: acct } = await supabaseAdmin
              .from("accounts")
              .select(
                "twilio_subaccount_sid,twilio_subaccount_auth_token_enc,subaccount_phone_number,onboarding_status",
              )
              .eq("id", c.account_id)
              .maybeSingle();

            if (acct?.onboarding_status === "suspended") {
              await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
              results.push({ id: c.id, error: "account_suspended" });
              continue;
            }

            // If tenant has sender_assets, require at least one verified before sending.
            const { data: senderAssets } = await supabaseAdmin
              .from("sender_assets")
              .select(
                "verification_status,country_code,sender_kind,phone_number,messaging_service_sid",
              )
              .eq("account_id", c.account_id);

            const verifiedSender = (senderAssets ?? []).find(
              (s: any) =>
                s.verification_status === "verified" && (s.messaging_service_sid || s.phone_number),
            );
            if (senderAssets && senderAssets.length > 0) {
              if (!verifiedSender) {
                // Keep campaign queued — do NOT fail; it will retry once verification completes.
                results.push({ id: c.id, skipped: "sender_pending_verification" });
                continue;
              }
            }

            let sender: Sender;
            if (
              acct?.twilio_subaccount_sid &&
              acct.twilio_subaccount_auth_token_enc &&
              (verifiedSender || acct.subaccount_phone_number)
            ) {
              const { decryptToken } = await import("@/lib/tenant-crypto.server");
              try {
                const token = decryptToken(
                  acct.twilio_subaccount_auth_token_enc as unknown as string,
                );
                sender = {
                  kind: "tenant",
                  subaccountSid: acct.twilio_subaccount_sid,
                  subaccountToken: token,
                  messagingService: verifiedSender?.messaging_service_sid ?? undefined,
                  fromNumber:
                    verifiedSender?.phone_number ?? acct.subaccount_phone_number ?? undefined,
                  assets: (senderAssets ?? []).filter(
                    (s: any) => s.verification_status === "verified",
                  ),
                };
              } catch {
                const main = mainSmsAuth();
                sender = {
                  kind: "tenant",
                  subaccountSid: main.sid,
                  subaccountToken: main.token,
                  messagingService: verifiedSender?.messaging_service_sid ?? undefined,
                  fromNumber:
                    verifiedSender?.phone_number ?? acct.subaccount_phone_number ?? undefined,
                  assets: (senderAssets ?? []).filter(
                    (s: any) => s.verification_status === "verified",
                  ),
                };
              }
            } else if (verifiedSender || acct?.subaccount_phone_number) {
              const main = mainSmsAuth();
              sender = {
                kind: "tenant",
                subaccountSid: main.sid,
                subaccountToken: main.token,
                messagingService: verifiedSender?.messaging_service_sid ?? undefined,
                fromNumber:
                  verifiedSender?.phone_number ?? acct?.subaccount_phone_number ?? undefined,
                assets: (senderAssets ?? []).filter(
                  (s: any) => s.verification_status === "verified",
                ),
              };
            } else {
              sender = { kind: "platform", lovableKey, twilioKey, messagingService };
            }

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
