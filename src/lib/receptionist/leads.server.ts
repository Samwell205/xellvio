import { receptionistConfigSchema } from "./shared";

/** Capture only caller words. Never infer marketing permission from a phone call or assistant speech. */
export async function captureCallRequest(call: { id: string; accountId: string; phone: string }, messages: Array<{ role: string; content?: string | null }>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const request = messages.filter(m => m.role === "user").map(m => m.content?.trim() ?? "").filter(Boolean).join("\n").slice(0,12000);
  if (!request) return;
  const { data: settings, error: readError } = await supabaseAdmin.from("receptionist_settings").select("configuration").eq("account_id",call.accountId).maybeSingle();
  if (readError) throw readError;
  const config = receptionistConfigSchema.parse(settings?.configuration ?? {});
  const { data: lead, error } = await supabaseAdmin.from("receptionist_leads").upsert({ account_id:call.accountId,call_id:call.id,phone_e164:call.phone,request,raw_payload:{ source:"verified_call_conversation" } },{ onConflict:"call_id",ignoreDuplicates:true }).select("id").maybeSingle();
  if (error) throw error;
  let leadId = lead?.id;
  if (!leadId) {
    const { data: existing, error: existingError } = await supabaseAdmin.from("receptionist_leads").select("id").eq("account_id",call.accountId).eq("call_id",call.id).single();
    if (existingError) throw existingError;
    leadId = existing?.id;
  }
  if (!leadId) throw new Error("Captured lead could not be read back.");
  // A contact record is not an SMS subscription; do not create or change a consent here.
  const { error: contactError } = await supabaseAdmin.from("profiles").upsert({ account_id:call.accountId,phone_e164:call.phone },{ onConflict:"account_id,phone_e164",ignoreDuplicates:true });
  if (contactError) throw contactError;
  if (config.notifyEmail) {
    const { data: job, error: jobError } = await supabaseAdmin.from("receptionist_jobs").upsert({ account_id:call.accountId,lead_id:leadId,kind:"email" },{onConflict:"lead_id,kind",ignoreDuplicates:true}).select("id").maybeSingle();
    if (jobError) throw jobError;
    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
    const result = await sendBrandedEmail({ templateName:"generic",recipientEmail:config.notifyEmail,idempotencyKey:`receptionist-lead-${leadId}`,templateData:{ heading:`New call for ${config.businessName || "your business"}`,subject:"New caller request — Xellvio",body:`Caller: ${call.phone}\n\n${request}`,ctaText:"View captured leads",ctaUrl:"https://xellvio.com/app/receptionist/leads" },includeUnsubscribe:false });
    const query = supabaseAdmin.from("receptionist_jobs").update({ status:result.success ? "queued" : "failed",outcome:result,error:result.success ? null : result.reason ?? "Notification could not be queued",updated_at:new Date().toISOString() }).eq("lead_id",leadId).eq("kind","email");
    const { error: finishError } = await query;
    if (finishError) throw finishError;
    if (!result.success && result.reason !== "suppressed") throw new Error("Team notification could not be queued.");
    void job;
  }
}