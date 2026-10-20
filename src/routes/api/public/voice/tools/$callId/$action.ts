import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
export const Route = createFileRoute("/api/public/voice/tools/$callId/$action")({server:{handlers:{POST:async({request,params})=>{
  if (!z.string().uuid().safeParse(params.callId).success || !["capture_lead","check_availability","book_appointment"].includes(params.action)) return new Response("Not found",{status:404});
  const { verifyCallToolToken,runCallTool }=await import("@/lib/receptionist/tools.server");
  if (!verifyCallToolToken(params.callId,request.headers.get("X-Xellvio-Call-Token"))) return new Response("Unauthorized",{status:401});
  const raw=await request.text();
  if (raw.length>20000) return new Response("Payload too large",{status:413});
  try { const result=await runCallTool(params.callId,params.action,JSON.parse(raw));return Response.json(result,{headers:{"Cache-Control":"no-store"}}); }
  catch(err) { console.error("Call action failed",err instanceof Error ? err.message : "Unknown error");return Response.json({status:"not_confirmed",message:"This action could not be confirmed. Offer a team callback; do not claim a booking or text delivery."},{status:422,headers:{"Cache-Control":"no-store"}}); }
}}}});