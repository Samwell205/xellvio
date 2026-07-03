import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function basicAuth(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

/** List distinct conversations (one per customer phone) with last message preview. */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Only conversations where the contact has actually replied (has an inbound message).
    const { data: inbound } = await supabase
      .from("sms_thread_messages")
      .select("phone_e164")
      .eq("account_id", userId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1000);

    const phones = Array.from(new Set((inbound ?? []).map((r) => r.phone_e164)));
    if (phones.length === 0) return [];

    // Pull the full thread (inbound + outbound replies) for those phones only.
    const { data: thread } = await supabase
      .from("sms_thread_messages")
      .select("phone_e164,direction,body,created_at")
      .eq("account_id", userId)
      .in("phone_e164", phones)
      .order("created_at", { ascending: false })
      .limit(2000);

    // Include recent campaign-outbound messages to those phones for last-message preview.
    const { data: campaignMsgs } = await supabase
      .from("messages")
      .select("phone_e164,rendered_body,created_at,campaigns!inner(account_id)")
      .eq("campaigns.account_id", userId)
      .in("phone_e164", phones)
      .order("created_at", { ascending: false })
      .limit(2000);

    const map = new Map<string, { phone: string; lastBody: string; lastAt: string; lastDirection: "inbound" | "outbound" }>();
    for (const r of thread ?? []) {
      const existing = map.get(r.phone_e164);
      if (!existing || new Date(r.created_at) > new Date(existing.lastAt)) {
        map.set(r.phone_e164, {
          phone: r.phone_e164,
          lastBody: r.body,
          lastAt: r.created_at,
          lastDirection: r.direction as "inbound" | "outbound",
        });
      }
    }
    for (const r of (campaignMsgs ?? []) as any[]) {
      const existing = map.get(r.phone_e164);
      if (!existing || new Date(r.created_at) > new Date(existing.lastAt)) {
        map.set(r.phone_e164, {
          phone: r.phone_e164,
          lastBody: r.rendered_body,
          lastAt: r.created_at,
          lastDirection: "outbound",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  });


/** Get the full merged conversation (inbound + outbound + campaign sends) for a phone. */
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: thread } = await supabase
      .from("sms_thread_messages")
      .select("id,direction,body,from_number,to_number,created_at")
      .eq("account_id", userId)
      .eq("phone_e164", data.phone)
      .order("created_at", { ascending: true });

    const { data: campaignMsgs } = await supabase
      .from("messages")
      .select("id,rendered_body,created_at,sent_at,status,campaigns!inner(account_id)")
      .eq("campaigns.account_id", userId)
      .eq("phone_e164", data.phone)
      .order("created_at", { ascending: true });

    const merged = [
      ...(thread ?? []).map((m) => ({
        id: m.id,
        direction: m.direction as "inbound" | "outbound",
        body: m.body,
        created_at: m.created_at,
        status: null as string | null,
      })),
      ...((campaignMsgs ?? []) as any[]).map((m) => ({
        id: m.id,
        direction: "outbound" as const,
        body: m.rendered_body,
        created_at: m.sent_at ?? m.created_at,
        status: m.status as string | null,
      })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return { phone: data.phone, messages: merged };
  });

const ReplySchema = z.object({
  phone: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Phone must be E.164"),
  body: z.string().trim().min(1).max(1600),
});

export const sendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReplySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { decryptToken } = await import("./tenant-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pick the sender: prefer the number the customer last texted us on.
    const { data: lastInbound } = await supabase
      .from("sms_thread_messages")
      .select("to_number")
      .eq("account_id", userId)
      .eq("phone_e164", data.phone)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: assets } = await supabase
      .from("sender_assets")
      .select("messaging_service_sid,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", userId);

    const eligible = (assets ?? []).filter(
      (a) => a.verification_status === "verified" && (a.messaging_service_sid || a.phone_number),
    );
    if (eligible.length === 0) {
      throw new Error("No verified sender is available. Finish SMS setup before replying.");
    }
    const matchByLast = lastInbound?.to_number
      ? eligible.find((a) => a.phone_number === lastInbound.to_number)
      : null;
    const asset = matchByLast ?? eligible[0];

    const { data: acct } = await supabase
      .from("accounts")
      .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
      .eq("id", userId)
      .maybeSingle();

    let sid = process.env.TWILIO_ACCOUNT_SID!;
    let token = process.env.TWILIO_AUTH_TOKEN!;
    if (acct?.twilio_subaccount_sid && acct.twilio_subaccount_auth_token_enc) {
      try {
        sid = acct.twilio_subaccount_sid;
        token = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);
      } catch { /* fall back to platform creds */ }
    }
    if (!sid || !token) throw new Error("SMS provider credentials are not configured.");

    const body = new URLSearchParams({ To: data.phone, Body: data.body });
    if (asset.messaging_service_sid) {
      body.set("MessagingServiceSid", asset.messaging_service_sid);
    } else if (asset.phone_number) {
      body.set("From", asset.phone_number);
    }

    const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(sid, token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message ?? `Twilio error ${res.status}`);
    }

    await supabaseAdmin.from("sms_thread_messages").insert({
      account_id: userId,
      phone_e164: data.phone,
      direction: "outbound",
      body: data.body,
      from_number: asset.phone_number ?? null,
      to_number: data.phone,
      provider_sid: json.sid ?? null,
      status: json.status ?? "sent",
    });

    // Mirror to Gorgias if connected (no-op otherwise).
    try {
      const { forwardSmsToGorgias } = await import("./gorgias.server");
      await forwardSmsToGorgias({
        accountId: userId,
        phone: data.phone,
        fromNumber: asset.phone_number ?? null,
        body: data.body,
        direction: "outbound",
      });
    } catch { /* ignore */ }

    return { ok: true, sid: json.sid as string };
  });
