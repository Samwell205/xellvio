import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, validateUIMessages, stepCountIs } from "ai";
import { z } from "zod";
import { accountAssistantTools, ACCOUNT_ASSISTANT_PROMPT } from "./account-assistant.server";
import { createLovableAiGatewayRunIdFetch, withLovableAiGatewayRunIdHeader } from "./account-ai-run-id.server";
export async function handleAccountAssistantChat(request:Request) {
  try {
    if(Number(request.headers.get("content-length") ?? 0)>300000) return Response.json({message:"Conversation is too large."},{status:413});
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
    if(!token) return Response.json({message:"Sign in to use your account assistant."},{status:401});
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
    const auth=await db.auth.getUser(token);
    if(auth.error || !auth.data.user) return Response.json({message:"Sign in again to continue."},{status:401});
    const userId=auth.data.user.id;
    const raw=await request.text(); if(raw.length>300000) return Response.json({message:"Conversation is too large."},{status:413});
    const input=z.object({threadId:z.string().uuid(),messages:z.array(z.unknown()).max(150)}).parse(JSON.parse(raw));
    const thread=await db.from("account_assistant_threads").select("id,messages").eq("id",input.threadId).eq("user_id",userId).single();
    if(thread.error) return Response.json({message:"Conversation not found."},{status:404});
    const tools=accountAssistantTools(userId);
    const messages=await validateUIMessages({messages:input.messages,tools});
    // Store the optimistic user turn before generating, so cancellation cannot lose it.
    const save=await db.from("account_assistant_threads").update({messages:messages as never,title:messages.find(m=>m.role==="user")?.parts.filter(p=>p.type==="text").map(p=>p.text).join(" ").slice(0,80)||"New conversation",updated_at:new Date().toISOString()}).eq("id",input.threadId).eq("user_id",userId);
    if(save.error) throw new Error("Your message could not be saved.");
    const key=process.env["LOVABLE_API_KEY"]; if(!key) return Response.json({message:"AI is not configured."},{status:401});
    const gateway=createLovableAiGatewayRunIdFetch();
    const provider=createOpenAI({baseURL:"https://ai.gateway.lovable.dev/v1",apiKey:key,headers:{"Lovable-API-Key":key,"X-Lovable-AIG-SDK":"vercel-ai-sdk"},fetch:gateway.fetch});
    const result=streamText({model:provider.responses("openai/gpt-6-astra"),system:ACCOUNT_ASSISTANT_PROMPT,messages:await convertToModelMessages(messages),tools,stopWhen:stepCountIs(50),maxRetries:0,abortSignal:request.signal,providerOptions:{openai:{forceReasoning:true,reasoningEffort:"low",reasoningSummary:"auto",store:false,include:["reasoning.encrypted_content"]}}});
    return withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({originalMessages:messages,sendReasoning:true,onFinish:async({messages:completed,isAborted})=>{
      if(isAborted) return;
      const update=await db.from("account_assistant_threads").update({messages:completed as never,updated_at:new Date().toISOString()}).eq("id",input.threadId).eq("user_id",userId);
      if(update.error) throw new Error("The answer could not be saved.");
    },onError:error=>error instanceof Error?error.message:"The assistant could not complete this request."}),gateway,{"Cache-Control":"no-store"});
  } catch(error) {
    if(request.signal.aborted) return new Response(null,{status:499});
    return Response.json({message:error instanceof Error?error.message:"Invalid assistant request."},{status:error instanceof z.ZodError?400:500});
  }
}