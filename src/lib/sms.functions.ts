import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const sendSchema = z.object({
  to: z.string().min(6).max(20),
  body: z.string().min(1).max(1600),
  sender_id: z.string().min(1).max(20),
  country: z.string().max(4).optional(),
  campaign_id: z.string().uuid().optional(),
});

/**
 * A user may only send from a sender identity they own and that is verified:
 *  - a toll_free or personal phone_number with status='active'
 *  - an alphanumeric sender_id with status='approved'
 * Returns the resolved From value, or null if not verified.
 */
async function resolveVerifiedSender(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  sender: string,
): Promise<string | null> {
  const isE164 = /^\+[1-9]\d{6,14}$/.test(sender);
  if (isE164) {
    const { data } = await supabase
      .from("phone_numbers").select("e164")
      .eq("user_id", userId).eq("e164", sender).eq("status", "active")
      .in("type", ["toll_free", "personal"]).maybeSingle();
    return data?.e164 ?? null;
  }
  const { data } = await supabase
    .from("sender_ids").select("sender_id")
    .eq("user_id", userId).eq("sender_id", sender).eq("status", "approved").maybeSingle();
  return data?.sender_id ?? null;
}

const CREDIT_PER_SEGMENT = 1;

function calcSegments(body: string): number {
  // GSM 7-bit assumed; rough estimate
  if (body.length <= 160) return 1;
  return Math.ceil(body.length / 153);
}

async function sendViaTwilio(to: string, body: string, from: string) {
  const lovKey = process.env.LOVABLE_API_KEY;
  const twKey = process.env.TWILIO_API_KEY;
  if (!lovKey || !twKey) return { ok: false as const, error: "Twilio not configured" };
  if (!from) return { ok: false as const, error: "No verified sender configured" };

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovKey}`,
        "X-Connection-Api-Key": twKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: data?.message || `Twilio ${res.status}` };
    return { ok: true as const, sid: data.sid as string };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Network error" };
  }
}

export const sendSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const segments = calcSegments(data.body);
    const cost = segments * CREDIT_PER_SEGMENT;

    // Check wallet balance
    const { data: wallet, error: wErr } = await supabase
      .from("wallets").select("balance_credits").eq("user_id", userId).single();
    if (wErr) throw new Error("Wallet not found");
    if (Number(wallet.balance_credits) < cost) throw new Error("Insufficient credits. Top up to continue.");

    // Insert message as queued
    const { data: msg, error: mErr } = await supabase.from("messages").insert({
      user_id: userId,
      to_phone: data.to,
      body: data.body,
      sender_id: data.sender_id,
      country: data.country,
      campaign_id: data.campaign_id,
      segments,
      cost,
      provider: "twilio",
      status: "queued",
    }).select("id").single();
    if (mErr) throw mErr;

    // Try delivery
    const result = await sendViaTwilio(data.to, data.body, data.sender_id);

    if (result.ok) {
      await supabase.from("messages").update({
        status: "sent", provider_sid: result.sid, delivered_at: new Date().toISOString(),
      }).eq("id", msg.id);
      // Deduct credits via admin (RLS prevents user write to wallet)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("wallets").update({
        balance_credits: Number(wallet.balance_credits) - cost,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      await supabaseAdmin.from("transactions").insert({
        user_id: userId, kind: "charge", amount: -cost, description: `SMS to ${data.to}`, reference: result.sid,
      });
      return { ok: true, id: msg.id, segments, cost, sid: result.sid };
    } else {
      await supabase.from("messages").update({ status: "failed", error: result.error }).eq("id", msg.id);
      return { ok: false, id: msg.id, error: result.error };
    }
  });

const bulkSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(1600),
  sender_id: z.string().max(20).optional(),
  recipients: z.array(z.object({
    to: z.string().min(6).max(20),
    country: z.string().max(4).optional(),
  })).min(1).max(10000),
  schedule_at: z.string().datetime().optional(),
});

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const status = data.schedule_at ? "scheduled" : "draft";
    const { data: camp, error } = await supabase.from("campaigns").insert({
      user_id: userId,
      name: data.name,
      message: data.body,
      sender_id: data.sender_id,
      status,
      scheduled_at: data.schedule_at,
      total_recipients: data.recipients.length,
    }).select("id").single();
    if (error) throw error;
    return { ok: true, id: camp.id };
  });

const runSchema = z.object({ campaign_id: z.string().uuid(), recipients: z.array(z.object({ to: z.string(), country: z.string().optional() })).min(1) });
export const runCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: camp, error: cErr } = await supabase.from("campaigns").select("*").eq("id", data.campaign_id).eq("user_id", userId).single();
    if (cErr || !camp) throw new Error("Campaign not found");

    await supabase.from("campaigns").update({ status: "running" }).eq("id", data.campaign_id);
    let sent = 0, failed = 0;
    const segments = calcSegments(camp.message);

    // Check balance
    const { data: wallet } = await supabase.from("wallets").select("balance_credits").eq("user_id", userId).single();
    const totalCost = data.recipients.length * segments;
    if (!wallet || Number(wallet.balance_credits) < totalCost) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", data.campaign_id);
      throw new Error(`Need ${totalCost} credits, only ${wallet?.balance_credits ?? 0} available.`);
    }

    for (const r of data.recipients) {
      const { data: msg } = await supabase.from("messages").insert({
        user_id: userId, campaign_id: data.campaign_id, to_phone: r.to, country: r.country,
        body: camp.message, sender_id: camp.sender_id, segments, cost: segments, provider: "twilio", status: "queued",
      }).select("id").single();
      const result = await sendViaTwilio(r.to, camp.message, camp.sender_id ?? undefined);
      if (result.ok) {
        sent++;
        await supabase.from("messages").update({ status: "sent", provider_sid: result.sid, delivered_at: new Date().toISOString() }).eq("id", msg!.id);
      } else {
        failed++;
        await supabase.from("messages").update({ status: "failed", error: result.error }).eq("id", msg!.id);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wallets").update({
      balance_credits: Number(wallet.balance_credits) - sent * segments,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    await supabaseAdmin.from("transactions").insert({
      user_id: userId, kind: "charge", amount: -sent * segments, description: `Campaign "${camp.name}"`, reference: data.campaign_id,
    });
    await supabase.from("campaigns").update({
      status: "completed", sent_count: sent, delivered_count: sent, failed_count: failed,
    }).eq("id", data.campaign_id);

    return { ok: true, sent, failed };
  });

const topupSchema = z.object({ amount: z.number().int().min(10).max(100000) });
export const addCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => topupSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: w } = await supabaseAdmin.from("wallets").select("balance_credits").eq("user_id", userId).single();
    await supabaseAdmin.from("wallets").update({
      balance_credits: Number(w?.balance_credits ?? 0) + data.amount,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    await supabaseAdmin.from("transactions").insert({
      user_id: userId, kind: "topup", amount: data.amount, description: `Top-up ${data.amount} credits (demo)`,
    });
    return { ok: true, added: data.amount };
  });
