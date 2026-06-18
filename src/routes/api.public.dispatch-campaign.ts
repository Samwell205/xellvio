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
  const base = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";
  return `${base}/api/public/twilio-status`;
}

type Rate = { country_code: string; dial_prefix: string; sell_price: number; mms_multiplier: number; active: boolean };

type Sender =
  | { kind: "platform"; lovableKey: string; twilioKey: string; messagingService: string }
  | { kind: "tenant"; subaccountSid: string; subaccountToken: string; messagingService?: string; fromNumber?: string };

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
): Promise<{ queued: number; failed: number; debited: number; cost: number; skipped?: string }> {
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

  // Balance check up front
  const { data: acct, error: aErr } = await supabaseAdmin
    .from("accounts").select("credit_balance").eq("id", campaign.account_id).maybeSingle();
  if (aErr || !acct) throw new Error("Account lookup failed");
  if (Number(acct.credit_balance) < totalCost) {
    await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return { queued: 0, failed: list.length, debited: 0, cost: totalCost, skipped: "insufficient_balance" };
  }

  const callback = await statusCallbackUrl();
  let queued = 0;
  let failed = 0;
  let debited = 0;

  for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
    const batch = enriched.slice(i, i + BATCH_SIZE);

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
      .from("messages").insert(rows).select("id, phone_e164, rendered_body, country_code, segments_count, cost");
    if (insErr) { failed += rows.length; continue; }

    await Promise.all((inserted ?? []).map(async (m: any) => {
      try {
        const body = new URLSearchParams({
          To: m.phone_e164,
          Body: m.rendered_body,
          StatusCallback: callback,
        });
        if (sender.kind === "tenant") {
          if (sender.messagingService) body.append("MessagingServiceSid", sender.messagingService);
          else body.append("From", sender.fromNumber!);
        } else {
          body.append("MessagingServiceSid", sender.messagingService);
        }
        if (campaign.media_url) body.append("MediaUrl", campaign.media_url);

        const fetchInit: RequestInit = sender.kind === "tenant"
          ? {
              method: "POST",
              headers: {
                Authorization: "Basic " + Buffer.from(`${sender.subaccountSid}:${sender.subaccountToken}`).toString("base64"),
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

        const url = sender.kind === "tenant"
          ? `https://api.twilio.com/2010-04-01/Accounts/${sender.subaccountSid}/Messages.json`
          : `${GATEWAY_URL}/Messages.json`;
        const res = await fetch(url, fetchInit);
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          await supabaseAdmin.from("messages").update({
            status: "failed", error_code: String(json?.code ?? res.status),
          }).eq("id", m.id);
          failed++;
        } else {
          const providerSegments = Number(json.num_segments ?? m.segments_count ?? 1);
          await supabaseAdmin.from("messages").update({
            status: "sent",
            provider_message_id: json.sid,
            sent_at: new Date().toISOString(),
            segments_count: providerSegments,
          }).eq("id", m.id);

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
              message_id: m.id, type: "debit_failed", payload: { error: String(e) },
            });
          }
          queued++;
        }
      } catch (e) {
        await supabaseAdmin.from("messages").update({ status: "failed", error_code: "exception" }).eq("id", m.id);
        failed++;
      }
    }));
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
          .from("country_rates").select("country_code,dial_prefix,sell_price,mms_multiplier,active").eq("active", true);
        const rates = (ratesRows ?? []) as Rate[];

        const nowIso = new Date().toISOString();
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
              .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc,subaccount_phone_number,onboarding_status")
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
              .select("verification_status,phone_number,messaging_service_sid")
              .eq("account_id", c.account_id);

            const verifiedSender = (senderAssets ?? []).find((s: any) =>
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
            if (acct?.twilio_subaccount_sid && acct.twilio_subaccount_auth_token_enc && (verifiedSender || acct.subaccount_phone_number)) {
              const { decryptToken } = await import("@/lib/tenant-crypto.server");
              const token = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);
              sender = {
                kind: "tenant",
                subaccountSid: acct.twilio_subaccount_sid,
                subaccountToken: token,
                messagingService: verifiedSender?.messaging_service_sid ?? undefined,
                fromNumber: verifiedSender?.phone_number ?? acct.subaccount_phone_number ?? undefined,
              };
            } else if (verifiedSender || acct?.subaccount_phone_number) {
              const main = mainSmsAuth();
              sender = {
                kind: "tenant",
                subaccountSid: main.sid,
                subaccountToken: main.token,
                messagingService: verifiedSender?.messaging_service_sid ?? undefined,
                fromNumber: verifiedSender?.phone_number ?? acct?.subaccount_phone_number ?? undefined,
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
