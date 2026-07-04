import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden");
  return userId;
}

export const listAllSenders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: senders, error } = await supabaseAdmin
      .from("sender_assets")
      .select("id, account_id, country_code, sender_kind, phone_number, verification_status, telnyx_verification_id, rejection_reason, friendly_rejection_reason, submitted_at, verified_at, rejected_at, last_synced_at, telnyx_phone_number_id, telnyx_messaging_profile_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const acctIds = Array.from(new Set((senders ?? []).map((s: any) => s.account_id)));
    const { data: accts } = acctIds.length
      ? await supabaseAdmin.from("accounts").select("id, email, legal_business_name").in("id", acctIds)
      : { data: [] as any[] };
    const byId = new Map((accts ?? []).map((a: any) => [a.id, a]));
    return (senders ?? []).map((s: any) => ({
      ...s,
      tenant_email: byId.get(s.account_id)?.email ?? null,
      tenant_business: byId.get(s.account_id)?.legal_business_name ?? null,
    }));
  });

export const adminRefreshSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { senderId: string }) => z.object({ senderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("sender_assets")
      .select("id, telnyx_verification_id, sender_kind").eq("id", data.senderId).maybeSingle();
    if (!row?.telnyx_verification_id || row.sender_kind !== "toll_free") {
      return { ok: false, reason: "Only submitted toll-free rows can be refreshed." };
    }
    const { fetchTwilioTollfreeVerification } = await import("./tollfree-submit.server");
    const res = await fetchTwilioTollfreeVerification({
      verificationSid: row.telnyx_verification_id, accountSid: "", authToken: "",
    });
    await supabaseAdmin.from("sender_assets").update({
      verification_status: res.status,
      rejection_reason: res.rejectionReason,
      last_synced_at: new Date().toISOString(),
    }).eq("id", data.senderId);
    return { ok: true, status: res.status };
  });

export const adminMarkSenderVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { senderId: string }) => z.object({ senderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sender_assets").update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      rejection_reason: null,
      friendly_rejection_reason: null,
    }).eq("id", data.senderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { senderId: string }) => z.object({ senderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sender_assets").delete().eq("id", data.senderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
