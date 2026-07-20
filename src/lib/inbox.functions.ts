import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActingAccount, assertPermission } from "@/lib/acting-account.server";

/** List distinct conversations (one per customer phone) with last message preview. */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "inbox");
    const { supabase } = context;
    const accountId = acting.accountId;
    const { data: inbound } = await supabase
      .from("sms_thread_messages")
      .select("phone_e164")
      .eq("account_id", accountId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1000);
    const phones = Array.from(new Set((inbound ?? []).map((r) => r.phone_e164)));
    if (phones.length === 0) return [];
    const { data: thread } = await supabase
      .from("sms_thread_messages")
      .select("phone_e164,direction,body,created_at")
      .eq("account_id", accountId).in("phone_e164", phones)
      .order("created_at", { ascending: false }).limit(2000);
    const { data: campaignMsgs } = await supabase
      .from("messages")
      .select("phone_e164,rendered_body,created_at,campaigns!inner(account_id)")
      .eq("campaigns.account_id", accountId).in("phone_e164", phones)
      .order("created_at", { ascending: false }).limit(2000);
    const map = new Map<string, { phone: string; lastBody: string; lastAt: string; lastDirection: "inbound" | "outbound" }>();
    for (const r of thread ?? []) {
      const existing = map.get(r.phone_e164);
      if (!existing || new Date(r.created_at) > new Date(existing.lastAt)) {
        map.set(r.phone_e164, {
          phone: r.phone_e164, lastBody: r.body, lastAt: r.created_at,
          lastDirection: r.direction as "inbound" | "outbound",
        });
      }
    }
    for (const r of (campaignMsgs ?? []) as any[]) {
      const existing = map.get(r.phone_e164);
      if (!existing || new Date(r.created_at) > new Date(existing.lastAt)) {
        map.set(r.phone_e164, { phone: r.phone_e164, lastBody: r.rendered_body, lastAt: r.created_at, lastDirection: "outbound" });
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "inbox");
    const { supabase } = context;
    const accountId = acting.accountId;
    const { data: thread } = await supabase
      .from("sms_thread_messages")
      .select("id,direction,body,from_number,to_number,created_at")
      .eq("account_id", accountId).eq("phone_e164", data.phone)
      .order("created_at", { ascending: true });
    const { data: campaignMsgs } = await supabase
      .from("messages")
      .select("id,rendered_body,created_at,sent_at,status,campaigns!inner(account_id)")
      .eq("campaigns.account_id", accountId).eq("phone_e164", data.phone)
      .order("created_at", { ascending: true });
    const merged = [
      ...(thread ?? []).map((m) => ({
        id: m.id, direction: m.direction as "inbound" | "outbound",
        body: m.body, created_at: m.created_at, status: null as string | null,
      })),
      ...((campaignMsgs ?? []) as any[]).map((m) => ({
        id: m.id, direction: "outbound" as const,
        body: m.rendered_body, created_at: m.sent_at ?? m.created_at,
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
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "inbox");
    const { supabase } = context;
    const accountId = acting.accountId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lastInbound } = await supabase
      .from("sms_thread_messages")
      .select("to_number").eq("account_id", accountId).eq("phone_e164", data.phone)
      .eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: assets } = await supabaseAdmin
      .from("sender_assets")
      .select("telnyx_messaging_profile_id,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", accountId);
    const eligible = (assets ?? []).filter(
      (a) => a.verification_status === "verified" && (a.telnyx_messaging_profile_id || a.phone_number),
    );
    if (eligible.length === 0) throw new Error("No verified sender is available. Finish SMS setup before replying.");
    const matchByLast = lastInbound?.to_number
      ? eligible.find((a) => a.phone_number === lastInbound.to_number)
      : null;
    const asset = matchByLast ?? eligible[0];

    // ── Compliance firewall on inbox replies (1:1 conversation).
    const { screenMessageContent } = await import("./content-screening.server");
    const { TOS_CURRENT_VERSION } = await import("./tos");
    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("tos_current_version_accepted, sending_suspended_at")
      .eq("id", accountId)
      .maybeSingle();
    if (acct?.sending_suspended_at) throw new Error("Sending suspended. Contact support.");
    if (acct?.tos_current_version_accepted !== TOS_CURRENT_VERSION) {
      throw new Error("Please accept the updated Terms of Service before replying.");
    }
    const screen = await screenMessageContent(data.body, accountId, {
      phoneE164: data.phone,
      context: "inbox_reply",
      skipReviewQueue: true,
    });
    if (!screen.passed) {
      const top = screen.blockedReasons.slice(0, 2).join(" · ") || "content policy";
      throw new Error(
        `Reply blocked. Reason: ${top}. Rephrase and try again (avoid restricted keywords, shortened links, or missing opt-out language). Risk score ${screen.riskScore}/100.`,
      );
    }

    const { sendMessage, safeTelnyxCall } = await import("./telnyx.server");
    const result = await safeTelnyxCall(
      "send_reply",
      { userId: accountId, messagingProfileId: asset.telnyx_messaging_profile_id ?? null },
      () => sendMessage({
        to: data.phone,
        text: data.body,
        from: asset.phone_number ?? undefined,
        messagingProfileId: asset.telnyx_messaging_profile_id ?? undefined,
      }),
    );

    await supabaseAdmin.from("sms_thread_messages").insert({
      account_id: accountId,
      phone_e164: data.phone,
      direction: "outbound",
      body: data.body,
      from_number: asset.phone_number ?? null,
      to_number: data.phone,
      provider_sid: result.id ?? null,
      status: result.to?.[0]?.status ?? "sent",
    });
    try {
      const { forwardSmsToGorgias } = await import("./gorgias.server");
      await forwardSmsToGorgias({
        accountId, phone: data.phone,
        fromNumber: asset.phone_number ?? null, body: data.body, direction: "outbound",
      });
    } catch { /* ignore */ }
    return { ok: true, sid: result.id as string };
  });
