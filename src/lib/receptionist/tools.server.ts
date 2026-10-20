import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { receptionistConfigSchema } from "./shared";

function tokenForCall(callId: string) {
  const secret = process.env['APP_USER_CONNECTION_KEY_SECRET'];
  if (!secret) throw new Error("Call action authentication is not configured.");
  return createHmac("sha256",secret).update(`xellvio-voice-call:${callId}`).digest("hex");
}
export function verifyCallToolToken(callId: string, token: string | null) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  try { return timingSafeEqual(Buffer.from(token),Buffer.from(tokenForCall(callId))); }
  catch { return false; }
}
export function buildCallTools(callId: string, origin: string, rawConfig: unknown) {
  const config = receptionistConfigSchema.parse(rawConfig);
  const tool = (name: string, description: string, properties: Record<string,unknown>, required: string[]) => ({ type:"webhook",timeout_ms:15000,webhook:{name,description,url:`${origin}/api/public/voice/tools/${callId}/${name}`,method:"POST",headers:[{name:"X-Xellvio-Call-Token",value:tokenForCall(callId)}],body_parameters:{type:"object",properties,required}} });
  const tools: Record<string,unknown>[] = [
    tool("capture_lead","Save the caller's name and request. Record SMS permission only if the caller explicitly agreed to this specific follow-up. Evidence must be the exact affirmative caller words; never infer consent.",{name:{type:"string"},email:{type:"string"},request:{type:"string"},smsConsent:{type:"boolean"},consentEvidence:{type:"string"}},["name","email","request","smsConsent","consentEvidence"]),
    {type:"hangup",hangup:{description:"End the call when the caller has finished or asks to hang up."}},
  ];
  if (config.calendarId) {
    tools.push(tool("check_availability","Check a requested appointment start time in ISO 8601 with timezone offset. Never invent an available time.",{startsAt:{type:"string"}},["startsAt"]));
    tools.push(tool("book_appointment","Book only after the caller explicitly confirms the exact date, time, name and phone details. Say booked only when the tool returns status confirmed.",{name:{type:"string"},email:{type:"string"},startsAt:{type:"string"},confirmed:{type:"boolean"}},["name","email","startsAt","confirmed"]));
  }
  return tools;
}
const leadSchema = z.object({ name:z.string().trim().max(120),email:z.union([z.literal(""),z.string().email().max(254)]),request:z.string().trim().min(1).max(12000),smsConsent:z.boolean(),consentEvidence:z.string().trim().max(2000) });
export async function runCallTool(callId: string, action: string, raw: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: call,error } = await supabaseAdmin.from("receptionist_calls").select("id,account_id,from_number,ended_at,started_at").eq("id",callId).single();
  if (error || !call || call.ended_at || Date.now()-Date.parse(call.started_at)>3600000) throw new Error("This call is no longer active.");
  const { data: settings } = await supabaseAdmin.from("receptionist_settings").select("enabled,configuration").eq("account_id",call.account_id).single();
  if (!settings?.enabled) throw new Error("The receptionist is paused.");
  const [{data:account,error:accountError},{data:platform,error:platformError}] = await Promise.all([
    supabaseAdmin.from("accounts").select("suspended_at,sending_suspended_at,onboarding_status").eq("id",call.account_id).single(),
    supabaseAdmin.from("receptionist_platform_settings").select("configuration").eq("id",true).maybeSingle(),
  ]);
  if (accountError || platformError || !account || account.suspended_at || account.sending_suspended_at || account.onboarding_status === "suspended" || (platform?.configuration as Record<string,unknown> | null)?.pricingApproved !== true) throw new Error("Call actions are unavailable for this workspace.");
  if (action==="capture_lead") {
    const input = leadSchema.parse(raw);
    const evidence = input.smsConsent && input.consentEvidence ? input.consentEvidence : null;
    const { data: lead,error: saveError } = await supabaseAdmin.from("receptionist_leads").upsert({account_id:call.account_id,call_id:call.id,phone_e164:call.from_number,name:input.name || null,email:input.email || null,request:input.request,sms_consent:Boolean(evidence),consent_evidence:evidence,raw_payload:{source:"authenticated_call_tool"}},{onConflict:"call_id"}).select("id").single();
    if (saveError || !lead) throw new Error("Caller request could not be saved.");
    const { captureCallRequest } = await import("./leads.server");
    await captureCallRequest({id:call.id,accountId:call.account_id,phone:call.from_number},[{role:"user",content:input.request}]);
    const { queueReceptionistFollowUp } = await import("./followups.server");
    let smsStatus="not_requested";
    if (evidence) { try { smsStatus=(await queueReceptionistFollowUp(call.account_id,lead.id)).status; } catch { smsStatus="blocked"; } }
    return {status:"saved",smsStatus};
  }
  if (action==="check_availability") {
    const input=z.object({startsAt:z.string().datetime({offset:true})}).parse(raw),config=receptionistConfigSchema.parse(settings.configuration);
    const end=new Date(Date.parse(input.startsAt)+config.appointmentMinutes*60000).toISOString();
    const { isWithinBusinessHours } = await import("./shared");
    if (!config.calendarId || Date.parse(input.startsAt)<=Date.now() || !isWithinBusinessHours(input.startsAt,end,config)) return {available:false};
    const { calendarBusy } = await import("./calendar.server");
    const startBuffer=new Date(Date.parse(input.startsAt)-config.bufferMinutes*60000).toISOString(),endBuffer=new Date(Date.parse(end)+config.bufferMinutes*60000).toISOString();
    const {data:reservations,error:reservationError}=await supabaseAdmin.from("receptionist_appointments").select("id").eq("account_id",call.account_id).in("status",["pending","confirmed","uncertain"]).lt("starts_at",endBuffer).gt("ends_at",startBuffer).limit(1);
    if (reservationError) throw reservationError;
    return {available:!reservations?.length && !(await calendarBusy(call.account_id,config.calendarId,startBuffer,endBuffer)),startsAt:input.startsAt,endsAt:end};
  }
  if (action==="book_appointment") {
    const input=z.object({name:z.string().min(1).max(120),email:z.union([z.literal(""),z.string().email().max(254)]),startsAt:z.string().datetime({offset:true}),confirmed:z.literal(true)}).parse(raw);
    const { bookAppointment } = await import("./calendar.server");
    return bookAppointment(call.account_id,{...input,phone:call.from_number,idempotencyKey:call.id},call.id);
  }
  throw new Error("Unsupported call action.");
}