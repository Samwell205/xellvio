import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function basicAuth(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

/**
 * Reconciles message statuses for a campaign by directly polling Twilio.
 * Useful when Twilio delivery-receipt (DLR) callbacks are missed or delayed —
 * common for international SMS where carriers don't always return DLRs.
 */
export const reconcileCampaignMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("./tenant-crypto.server");

    // Verify caller owns the campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, account_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr || !campaign) throw new Error("Campaign not found");
    if (campaign.account_id !== userId) throw new Error("Forbidden");

    // Resolve Twilio credentials — prefer tenant subaccount, fall back to platform.
    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("twilio_subaccount_sid, twilio_subaccount_auth_token_enc")
      .eq("id", campaign.account_id)
      .maybeSingle();

    let sid = process.env.TWILIO_ACCOUNT_SID!;
    let token = process.env.TWILIO_AUTH_TOKEN!;
    if (acct?.twilio_subaccount_sid && acct.twilio_subaccount_auth_token_enc) {
      try {
        sid = acct.twilio_subaccount_sid;
        token = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);
      } catch {
        /* fall back to platform creds */
      }
    }
    if (!sid || !token) throw new Error("SMS provider credentials are not configured.");

    // Fetch messages stuck in a non-terminal state that still have a provider SID.
    // Terminal Twilio statuses: delivered, undelivered, failed, canceled.
    const nonTerminal = ["queued", "accepted", "sending", "sent", "receiving"];
    const { data: stuck } = await supabaseAdmin
      .from("messages")
      .select("id, provider_message_id, status")
      .eq("campaign_id", data.campaignId)
      .in("status", nonTerminal)
      .not("provider_message_id", "is", null)
      .limit(500);

    if (!stuck || stuck.length === 0) {
      return { checked: 0, updated: 0 };
    }

    let updated = 0;
    await Promise.all(
      stuck.map(async (m: any) => {
        try {
          const res = await fetch(
            `${TWILIO_API}/Accounts/${sid}/Messages/${m.provider_message_id}.json`,
            { headers: { Authorization: basicAuth(sid, token) } },
          );
          if (!res.ok) return;
          const json: any = await res.json();
          const newStatus = String(json?.status ?? "").toLowerCase();
          if (!newStatus || newStatus === m.status) return;

          const update: { status: string; delivered_at?: string; error_code?: string } = {
            status: newStatus,
          };
          if (newStatus === "delivered") update.delivered_at = new Date().toISOString();
          if (json?.error_code) update.error_code = String(json.error_code);

          await supabaseAdmin.from("messages").update(update).eq("id", m.id);
          await supabaseAdmin.from("events").insert({
            message_id: m.id,
            type: `reconcile:${newStatus}`,
            payload: json,
          });
          updated += 1;
        } catch {
          /* ignore individual failures */
        }
      }),
    );

    return { checked: stuck.length, updated };
  });
