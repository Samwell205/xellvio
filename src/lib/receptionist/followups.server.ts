import { canFollowUp, receptionistConfigSchema } from "./shared";

/** Called only after a verified, call-bound lead operation has stored explicit permission evidence. */
export async function queueReceptionistFollowUp(accountId: string, leadId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [leadResult, settingsResult, accountResult] = await Promise.all([
    supabaseAdmin.from("receptionist_leads").select("phone_e164,sms_consent,consent_evidence").eq("account_id",accountId).eq("id",leadId).single(),
    supabaseAdmin.from("receptionist_settings").select("configuration,enabled").eq("account_id",accountId).single(),
    supabaseAdmin.from("accounts").select("suspended_at,sending_suspended_at,credit_balance,tos_current_version_accepted").eq("id",accountId).single(),
  ]);
  if (leadResult.error || settingsResult.error || accountResult.error) throw new Error("Follow-up prerequisites could not be checked.");
  const lead = leadResult.data, account = accountResult.data, config = receptionistConfigSchema.parse(settingsResult.data.configuration);
  const { data: suppression, error: suppressionError } = await supabaseAdmin.from("suppressions").select("phone_e164").eq("account_id",accountId).eq("phone_e164",lead.phone_e164).maybeSingle();
  if (suppressionError) throw suppressionError;
  if (!canFollowUp({ enabled:settingsResult.data.enabled && config.smsFollowUp,consent:lead.sms_consent,consentEvidence:lead.consent_evidence,suppressed:Boolean(suppression) })) return { status:"skipped" };
  if (!config.smsText || !account || account.suspended_at || account.sending_suspended_at || account.credit_balance <= 0 || !account.tos_current_version_accepted) throw new Error("This business is not eligible for an SMS follow-up.");
  const { screenMessageContent } = await import("@/lib/content-screening.server");
  const body = `${config.smsText}\nReply STOP to opt out.`;
  const result = await screenMessageContent(body,accountId,{context:"campaign",plannedRecipients:1,skipReviewQueue:true});
  if (!result.passed) throw new Error("The SMS follow-up was blocked by content screening.");
  // Stable campaign ID makes retries return the same queued campaign rather than sending twice.
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("id").eq("account_id",accountId).eq("phone_e164",lead.phone_e164).single();
  if (profileError || !profile) throw new Error("Contact not found.");
  const { data: consent, error: consentError } = await supabaseAdmin.from("consents").select("status").eq("profile_id",profile.id).eq("channel","sms").maybeSingle();
  if (consentError) throw consentError;
  // Never convert a service call into a marketing subscription or overwrite a previous unsubscribe.
  if (consent?.status !== "subscribed") return { status:"skipped" };
  const { error } = await supabaseAdmin.from("campaigns").upsert({ id:leadId,account_id:accountId,name:"Receptionist follow-up",status:"queued",message_body:body,audience:{ include:[],exclude:[],profile_ids:[profile.id] },send_mode:"immediate",schedule_at:null },{onConflict:"id",ignoreDuplicates:true});
  if (error) throw error;
  const { error: jobError } = await supabaseAdmin.from("receptionist_jobs").upsert({ account_id:accountId,lead_id:leadId,kind:"sms",status:"queued",outcome:{campaignId:leadId},updated_at:new Date().toISOString() },{onConflict:"lead_id,kind"});
  if (jobError) throw jobError;
  return {status:"queued",campaignId:leadId};
}