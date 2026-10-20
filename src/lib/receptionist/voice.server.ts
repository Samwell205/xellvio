import { z } from "zod";
import { receptionistConfigSchema } from "./shared";
export async function voiceRequest(path: string, body: Record<string,unknown>) {
  const key = process.env['TELNYX_API_KEY'];
  if (!key) throw new Error("Calling is not configured.");
  const response = await fetch(`https://api.telnyx.com/v2${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!response.ok) { console.error(`Voice request failed [${response.status}]: ${await response.text()}`); throw new Error("The calling service could not complete this action."); }
  return response.json();
}
export const voiceEventSchema = z.object({ data: z.object({ id: z.string().min(1).max(200), event_type: z.string().min(1).max(120), occurred_at: z.string().datetime({ offset: true }), payload: z.object({ call_control_id: z.string().min(1).max(1000), call_session_id: z.string().max(200).optional(), from: z.string().max(32).optional(), to: z.string().max(32).optional(), direction: z.string().max(30).optional(), connection_id: z.string().max(200).optional(), messages: z.array(z.object({ role: z.string().max(30), content: z.union([z.string().max(20000),z.null()]).optional() }).passthrough()).max(1000).optional() }).passthrough() }) });
export async function handleVoiceEvent(raw: unknown) {
  const event = voiceEventSchema.parse(raw).data;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: insertError } = await supabaseAdmin.from("receptionist_events").insert({ event_id: event.id, call_control_id: event.payload.call_control_id, event_type: event.event_type, payload: { occurred_at: event.occurred_at }, status: "processing", attempts: 1 });
  if (insertError) {
    if (insertError.code !== "23505") throw insertError;
    const { data: claimed, error } = await supabaseAdmin.from("receptionist_events").update({ status: "processing", error: null }).eq("event_id", event.id).eq("status", "failed").select("event_id").maybeSingle();
    if (error) throw error;
    if (!claimed) return;
  }
  try {
    const callId = event.payload.call_control_id;
    if (event.event_type === "call.initiated" && event.payload.direction === "incoming") {
      const p = event.payload;
      if (!p.to || !p.from || !/^\+[1-9]\d{6,14}$/.test(p.from) || !p.connection_id) throw new Error("Invalid inbound call mapping");
      const { data: settings, error } = await supabaseAdmin.from("receptionist_settings").select("account_id,enabled,assistant_id,voice_application_id,configuration,provision_status,test_verified_at").eq("voice_number",p.to).eq("voice_application_id",p.connection_id).maybeSingle();
      if (error) throw error;
      if (!settings?.enabled || !settings.assistant_id || settings.provision_status !== "verified" || !settings.test_verified_at) {
        await voiceRequest(`/calls/${encodeURIComponent(callId)}/actions/hangup`, { command_id: `${event.id}-inactive` });
      } else {
        const { data: account } = await supabaseAdmin.from("accounts").select("suspended_at,onboarding_status,sending_suspended_at").eq("id",settings.account_id).single();
        const { data: platform } = await supabaseAdmin.from("receptionist_platform_settings").select("configuration").eq("id",true).maybeSingle();
        if (!account || account.suspended_at || account.onboarding_status === "suspended" || account.sending_suspended_at || (platform?.configuration as Record<string,unknown> | null)?.pricingApproved !== true) {
          await voiceRequest(`/calls/${encodeURIComponent(callId)}/actions/hangup`, { command_id: `${event.id}-blocked` });
        } else {
          const { error: callError } = await supabaseAdmin.from("receptionist_calls").upsert({ account_id: settings.account_id, call_control_id: callId, call_session_id: p.call_session_id ?? null, from_number:p.from, to_number:p.to, status:"ringing", started_at:event.occurred_at }, { onConflict:"call_control_id", ignoreDuplicates:true });
          if (callError) throw callError;
          await voiceRequest(`/calls/${encodeURIComponent(callId)}/actions/answer`, { command_id: `${event.id}-answer`, assistant: { id:settings.assistant_id } });
        }
      }
    } else {
      const { data: call, error } = await supabaseAdmin.from("receptionist_calls").select("id,account_id,from_number,started_at,ended_at,status").eq("call_control_id",callId).maybeSingle();
      if (error) throw error;
      if (call) {
        if (event.event_type === "call.answered" && !call.ended_at) {
          const { error: updateError } = await supabaseAdmin.from("receptionist_calls").update({ status:"answered",answered_at:event.occurred_at }).eq("id",call.id).is("ended_at",null);
          if (updateError) throw updateError;
        }
        if (event.event_type === "call.hangup") {
          const duration = Math.max(0,Math.round((Date.parse(event.occurred_at)-Date.parse(call.started_at))/1000));
          const { error: updateError } = await supabaseAdmin.from("receptionist_calls").update({ status:"ended",ended_at:event.occurred_at,duration_seconds:duration }).eq("id",call.id);
          if (updateError) throw updateError;
        }
        if (event.event_type === "call.conversation.ended") {
          // Stop the call leg as well as the assistant to prevent silence accumulating billable minutes.
          if (!call.ended_at) await voiceRequest(`/calls/${encodeURIComponent(callId)}/actions/hangup`, { command_id:`${event.id}-finish` });
          const { data: settings } = await supabaseAdmin.from("receptionist_settings").select("configuration").eq("account_id",call.account_id).maybeSingle();
          const config = receptionistConfigSchema.parse(settings?.configuration ?? {});
          const messages = event.payload.messages ?? [];
          const { error: updateError } = await supabaseAdmin.from("receptionist_calls").update({ transcript:config.retainTranscript ? messages.map(m=>({ role:m.role,content:m.content ?? "" })) : null, summary: "Call completed. Review captured lead details for the caller’s request." }).eq("id",call.id);
          if (updateError) throw updateError;
          const { captureCallRequest } = await import("./leads.server");
          await captureCallRequest({id:call.id,accountId:call.account_id,phone:call.from_number},messages);
        }
      }
    }
    const { error: finishError } = await supabaseAdmin.from("receptionist_events").update({ status:"processed",processed_at:new Date().toISOString() }).eq("event_id",event.id);
    if (finishError) throw finishError;
  } catch (err) {
    await supabaseAdmin.from("receptionist_events").update({ status:"failed",error:"Voice event processing failed" }).eq("event_id",event.id);
    throw err;
  }
}