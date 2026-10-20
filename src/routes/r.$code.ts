// Indexed short-link destination lookup; click work never blocks the hosted redirect.
import { createFileRoute } from "@tanstack/react-router";
import { redirectTrackedLink, type TrackedLink } from "@/lib/short-link.server";

function notFoundResponse(): Response {
  const site=(process.env["PUBLIC_BASE_URL"] || process.env["SITE_URL"] || "https://xellvio.com").replace(/\/+$/, "");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Link unavailable — Xellvio</title></head><body><main><h1>This link is no longer available</h1><p>If someone sent it to you, ask them for a fresh link.</p><a href="${site}">Go to homepage</a></main></body></html>`,{status:404,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
}

async function trackAndRedirect(code:string,request:Request):Promise<Response> {
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  return redirectTrackedLink(code,request,{
    unavailable:notFoundResponse,
    lookup:async (code,signal)=>{
      const {data,error}=await supabaseAdmin.from("link_clicks").select("url,message_id,campaign_id").eq("short_code",code).abortSignal(signal).maybeSingle();
      if(error) throw new Error(error.message);
      return data as TrackedLink | null;
    },
    record:async(code,link,request,signal)=>{
      const {error}=await supabaseAdmin.rpc("record_link_click",{_code:code}).abortSignal(signal);
      if(error) throw new Error(error.message);
      if(!link.message_id) return;
      const {error:auditError}=await supabaseAdmin.from("events").insert({message_id:link.message_id,type:"clicked",payload:{short_code:code,url:link.url,ua:request.headers.get("user-agent"),ip:request.headers.get("cf-connecting-ip")??request.headers.get("x-forwarded-for"),campaign_id:link.campaign_id}}).abortSignal(signal);
      if(auditError) console.error("[shortlink] audit failed",auditError.message);
      const {data:msg}=await supabaseAdmin.from("messages").select("account_id,phone_e164").eq("id",link.message_id).abortSignal(signal).maybeSingle();
      if(msg?.account_id && msg.phone_e164 && !signal.aborted){
        const {fireAutomationTrigger}=await import("@/lib/automation-engine.server");
        await fireAutomationTrigger({accountId:msg.account_id,phone:msg.phone_e164,type:"trigger.link_clicked",payload:{url:link.url}});
      }
    },
  });
}
export const Route=createFileRoute("/r/$code")({server:{handlers:{GET:async({params,request})=>trackAndRedirect(params.code,request),HEAD:async({params,request})=>trackAndRedirect(params.code,request)}}});
