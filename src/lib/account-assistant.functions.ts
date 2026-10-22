import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { inspectFileSchema } from "./account-assistant.schemas";
export const listAssistantThreads = createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const r=await context.supabase.from("account_assistant_threads").select("id,title,updated_at").eq("user_id",context.userId).order("updated_at",{ascending:false}).limit(100); if(r.error) throw new Error("Conversations could not be loaded."); return r.data;
});
export const newAssistantThread = createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const r=await context.supabase.from("account_assistant_threads").insert({user_id:context.userId}).select("id").single(); if(r.error) throw new Error("Conversation could not be created."); return r.data;
});
export const getAssistantThread=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({context,data})=>{
  const r=await context.supabase.from("account_assistant_threads").select("id,title,messages").eq("user_id",context.userId).eq("id",data.id).single(); if(r.error) throw new Error("Conversation not found."); return r.data;
});
export const inspectAssistantFile=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>inspectFileSchema.parse(d)).handler(async({context,data})=>{
  const {inspectContacts}=await import("./account-assistant.server"); return inspectContacts(context.userId,data);
});
export const listAssistantOperations=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {assistantAccess}=await import("./account-assistant.server"); const {acting,db}=await assistantAccess(context.userId);
  const r=await db.from("assistant_operations").select("id,kind,arguments,status,outcome,expires_at").eq("account_id",acting.accountId).eq("user_id",context.userId).order("created_at",{ascending:false}).limit(20); if(r.error) throw new Error("Actions could not be loaded."); return r.data.map(op=>{const args=op.arguments as Record<string,Json>;if(op.kind!=="contact_import")return op;const {rows,...summary}=args;void rows;return {...op,arguments:summary};});
});
export const confirmAssistantAction=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid(),consent:z.boolean()}).parse(d)).handler(async({context,data})=>{
  const {confirmOperation}=await import("./account-assistant.server"); return confirmOperation(context.userId,data.id,data.consent);
});
export const cancelAssistantAction=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({context,data})=>{
  const {assistantAccess}=await import("./account-assistant.server"); const {acting,db}=await assistantAccess(context.userId);
  const r=await db.from("assistant_operations").update({status:"cancelled"}).eq("id",data.id).eq("user_id",context.userId).eq("account_id",acting.accountId).eq("status","pending").select("id").single(); if(r.error) throw new Error("Action cannot be cancelled."); return {ok:true};
});
export const saveStoppedAssistantMessage=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({threadId:z.string().uuid(),message:z.object({id:z.string().max(200),role:z.literal("assistant"),parts:z.array(z.unknown()).max(200)})}).parse(d)).handler(async({context,data})=>{
  const r=await context.supabase.from("account_assistant_threads").select("messages").eq("id",data.threadId).eq("user_id",context.userId).single(); if(r.error) throw new Error("Conversation not found.");
  const messages=Array.isArray(r.data.messages)?r.data.messages:[];
  if(messages.some(m=>m && typeof m==="object" && "id" in m && m.id===data.message.id)) return {ok:true};
  const update=await context.supabase.from("account_assistant_threads").update({messages:[...messages,data.message] as never,updated_at:new Date().toISOString()}).eq("id",data.threadId).eq("user_id",context.userId); if(update.error) throw new Error("Stopped answer could not be saved."); return {ok:true};
});