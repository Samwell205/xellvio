import { createFileRoute } from "@tanstack/react-router";
import { calculateSegments } from "@/lib/sms-segments";
import { countryFromPhone } from "@/lib/country-from-phone";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const BATCH_SIZE = 500;

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

function mainSmsAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("SMS provider credentials are not configured");
  return { sid, token };
}

async function dispatchOne(
  supabaseAdmin: any,
  campaign: any,
  rates: Rate[],
  sender: Sender,
): Promise<{ queued: number; failed: number; debited: number; cost: number; skipped?: string; paused?: boolean }> {
  await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);

  const { data: recipients, error } = await supabaseAdmin.rpc("eligible_profile_ids", {
    _account_id: campaign.account_id,
    _audience: campaign.audience ?? { include: [], exclude: [] },
  });
  if (error) throw error;

  const list = (recipients ?? []) as any[];
  if (list.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
    return { queued: 0, failed: 0, debited: 0, cost: 0 };
  }

  // Compute segments once per recipient (after personalization)
  const dial = rates.map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }));
  const rateByCC: Record<string, Rate> = {};
  for (const r of rates) rateByCC[r.country_code] = r;
  const hasMedia = !!campaign.media_url;

  const enriched = list.map((p) => {
    const body = render(campaign.message_body, p);
    const seg = calculateSegments(body);
    const cc = p.country_code || countryFromPhone(p.phone_e164, dial);
    const rate = cc ? rateByCC[cc] : undefined;
    const unit = rate ? Number(rate.sell_price) : 0;
    const mult = hasMedia && rate ? Number(rate.mms_multiplier) : 1;
    const cost = +(seg.segments * unit * mult).toFixed(4);
    return { ...p, body, segments: seg.segments, country_code: cc, cost };
  });

  const totalCost = +enriched.reduce((s, x) => s + x.cost, 0).toFixed(4);

  // Master Twilio balance pre-flight: if not enough to cover this campaign,
  // pause it (don't fail) and fire urgent admin alert. Auto-resume cron picks
  // it up once admin funds Twilio.
  try {
    const { getMasterTwilioBalance, getBalanceBuffer, fireCapacityAlert } = await import(
      "@/lib/twilio-alerts.server"
    );
    const [{ balance: twBal, currency, ok }, buffer] = await Promise.all([
      getMasterTwilioBalance(),
      getBalanceBuffer(),
    ]);
    if (ok && totalCost > 0 && twBal < totalCost) {
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
          shortfall: +(totalCost - twBal).toFixed(4),
        pausedCampaignCount: pausedCount ?? undefined,
      });
      return { queued: 0, failed: 0, debited: 0, cost: totalCost, paused: true };
    }
      if (ok && totalCost > 0 && twBal < totalCost + buffer) {
        console.warn("[dispatch] provider balance is below reserve but can cover campaign", {
          campaignId: campaign.id,
          balance: twBal,
          cost: totalCost,
          reserve: buffer,
        });
      }
  } catch (e) {
    console.error("[dispatch] balance preflight failed (continuing)", e);
  }


  // Balance check up front — never charge more than the user has on file.
  const { data: acct, error: aErr } = await supabaseAdmin
    .from("accounts")
    .select("credit_balance")
    .eq("id", campaign.account_id)
    .maybeSingle();
  if (aErr || !acct) throw new Error("Account lookup failed");
  const startingBalance = Number(acct.credit_balance);

  // Sort cheapest-first so a low balance still reaches as many people as possible.
  enriched.sort((a, b) => a.cost - b.cost);

  // Pre-mark recipients we can't afford as skipped (no debit, no Twilio call).
  let remaining = startingBalance;
  const affordable: typeof enriched = [];
  const skippedRows: any[] = [];
  for (const r of enriched) {
    if (r.cost > 0 && r.cost <= remaining) {
      remaining -= r.cost;
      affordable.push(r);
    } else if (r.cost === 0) {
      // Free routes (no rate row) — still send, no debit.
      affordable.push(r);
    } else {
      skippedRows.push({
        campaign_id: campaign.id,
        profile_id: r.profile_id,
        phone_e164: r.phone_e164,
        country_code: r.country_code,
        segments_count: r.segments,
        cost: r.cost,
        rendered_body: r.body,
        status: "failed",
        error_code: "insufficient_balance",
      });
    }
  }
  if (skippedRows.length > 0) {
    await supabaseAdmin.from("messages").insert(skippedRows);
  }
  if (affordable.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return {
      queued: 0,
      failed: skippedRows.length,
      debited: 0,
      cost: totalCost,
      skipped: "insufficient_balance",
    };
  }

  let queued = 0;
  let failed = skippedRows.length;
  let debited = 0;
  const callback = await statusCallbackUrl();
  // From here on, dispatch only affordable recipients.
  const dispatchList = affordable;


  for (let i = 0; i < dispatchList.length; i += BATCH_SIZE) {
    const batch = dispatchList.slice(i, i + BATCH_SIZE);


    const rows = batch.map((p) => ({
      campaign_id: campaign.id,
      profile_id: p.profile_id,
      phone_e164: p.phone_e164,
      country_code: p.country_code,
      segments_count: p.segments,
      cost: p.cost,
      rendered_body: p.body,
      status: "queued",
    }));
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("messages")
      .insert(rows)
      .select("id, phone_e164, rendered_body, country_code, segments_count, cost");
    if (insErr) {
      failed += rows.length;
      continue;
    }

    await Promise.all(
      (inserted ?? []).map(async (m: any) => {
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
                      Buffer.from(`${sender.subaccountSid}:${sender.subaccountToken}`).toString(
                        "base64",
                      ),
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
          if (!res.ok) {
            await supabaseAdmin
              .from("messages")
              .update({
                status: "failed",
                error_code: String(json?.code ?? res.status),
              })
              .eq("id", m.id);
            failed++;
          } else {
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

            // Debit the account for this message
            try {
              await supabaseAdmin.rpc("debit_account", {
                _account_id: campaign.account_id,
                _amount: Number(m.cost),
                _campaign_id: campaign.id,
                _description: `SMS → ${m.phone_e164} (${m.country_code ?? "??"}) × ${m.segments_count}`,
              });
              debited += Number(m.cost);
            } catch (e) {
              // balance was pre-checked; log via events table
              await supabaseAdmin.from("events").insert({
                message_id: m.id,
                type: "debit_failed",
                payload: { error: String(e) },
              });
            }
            queued++;
          }
        } catch (e) {
          await supabaseAdmin
            .from("messages")
            .update({ status: "failed", error_code: "exception" })
            .eq("id", m.id);
          failed++;
        }
      }),
    );
  }

  await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
  return { queued, failed, debited: +debited.toFixed(4), cost: totalCost };
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

        const { data: due, error } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .or(`status.eq.queued,and(status.eq.scheduled,schedule_at.lte.${nowIso})`)
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

            const r = await dispatchOne(supabaseAdmin, c, rates, sender);
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
