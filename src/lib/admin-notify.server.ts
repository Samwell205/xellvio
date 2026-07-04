// Server-only admin SMS notification via Telnyx.

export const ADMIN_NOTIFY_PHONE = "+2347056089052";
export const ADMIN_NOTIFY_EMAIL = "admin@xellvio.com";

export async function sendAdminSms(body: string): Promise<void> {
  if (!process.env.TELNYX_API_KEY) {
    console.warn("[admin-notify] TELNYX_API_KEY not configured; skipping SMS");
    return;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminAcct } = await supabaseAdmin
      .from("accounts")
      .select("telnyx_messaging_profile_id, telnyx_phone_number")
      .not("telnyx_messaging_profile_id", "is", null)
      .limit(1)
      .maybeSingle();
    const { sendMessage } = await import("./telnyx.server");
    await sendMessage({
      to: ADMIN_NOTIFY_PHONE,
      text: body.slice(0, 1500),
      messagingProfileId: adminAcct?.telnyx_messaging_profile_id ?? undefined,
      from: adminAcct?.telnyx_phone_number ?? undefined,
    });
  } catch (e) {
    console.error("[admin-notify] Telnyx SMS failed", e);
  }
}
