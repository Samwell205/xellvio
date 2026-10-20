import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { receptionistConfigSchema } from "./shared";
import {assistantEditSchema} from "./assistant-controls";

async function access(userId: string, owner = false) {
  const { resolveActingAccount, assertPermission, assertOwner } = await import("../acting-account.server");
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "settings");
  if (owner) assertOwner(acting);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { acting, db: supabaseAdmin };
}
export const listAssistants = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { acting, db } = await access(context.userId);
  const [rows, settings] = await Promise.all([
    db.from("receptionist_assistants").select("id,name,configuration,sync_status,archived_at,created_at").eq("account_id",acting.accountId).order("created_at", {ascending:false}).limit(200),
    db.from("receptionist_settings").select("selected_assistant_id,enabled,voice_number").eq("account_id",acting.accountId).maybeSingle(),
  ]);
  if (rows.error || settings.error) throw new Error("Assistants could not be loaded.");
  return { rows: rows.data ?? [], selectedId: settings.data?.selected_assistant_id ?? null, enabled: settings.data?.enabled ?? false, number: settings.data?.voice_number ?? null };
});
export const createAssistant = createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=> z.object({name:z.string().trim().min(1).max(120),copyId:z.string().uuid().optional()}).parse(input)).handler(async({context,data})=>{
  const { acting, db } = await access(context.userId,true);
  let raw: unknown = {};
  if (data.copyId) {
    const source = await db.from("receptionist_assistants").select("configuration").eq("account_id",acting.accountId).eq("id",data.copyId).is("archived_at",null).single();
    if (source.error) throw new Error("Assistant not found.");
    raw=source.data.configuration;
  } else {
    const settings=await db.from("receptionist_settings").select("configuration").eq("account_id",acting.accountId).maybeSingle();
    if(settings.error) throw new Error("Business settings could not be loaded.");
    const current=receptionistConfigSchema.parse(settings.data?.configuration ?? {});
    raw={businessName:current.businessName,businessInformation:current.businessInformation,timezone:current.timezone};
  }
  const config=receptionistConfigSchema.parse({...receptionistConfigSchema.parse(raw),assistantName:data.name});
  const result=await db.from("receptionist_assistants").insert({account_id:acting.accountId,name:data.name,configuration:config}).select("id").single();
  if(result.error) throw new Error("Assistant could not be created.");
  return result.data;
});
export const selectAssistant=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid()}).parse(input)).handler(async({context,data})=>{
  const {acting,db}=await access(context.userId,true);
  const result=await db.rpc("select_receptionist_assistant",{_account_id:acting.accountId,_assistant_id:data.id});
  if(result.error) throw new Error("Pause calling and wait for current calls to end before selecting an available assistant.");
  return {ok:true};
});
export const archiveAssistant=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid(),archived:z.boolean()}).parse(input)).handler(async({context,data})=>{
  const {acting,db}=await access(context.userId,true);
  const settings=await db.from("receptionist_settings").select("selected_assistant_id").eq("account_id",acting.accountId).maybeSingle();
  if(settings.error) throw new Error("Phone assignment could not be checked.");
  if(settings.data?.selected_assistant_id===data.id) throw new Error("Select a different assistant before archiving this one.");
  const result=await db.from("receptionist_assistants").update({archived_at:data.archived?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",data.id).eq("account_id",acting.accountId).select("id").single();
  if(result.error) throw new Error("Assistant could not be updated.");
  return {ok:true};
});
export const editAssistant=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>assistantEditSchema.parse(input)).handler(async({context,data})=>{
  const {acting,db}=await access(context.userId,true);
  const {error}=await db.rpc("edit_receptionist_assistant",{_account_id:acting.accountId,_assistant_id:data.id,_configuration:data.configuration});
  if(error) throw new Error("Settings could not be saved. Pause calling and wait for active calls to end before editing the selected assistant.");
  return {ok:true};
});
export const deleteAssistant=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid()}).parse(input)).handler(async({context,data})=>{
  const {acting,db}=await access(context.userId,true);
  const {error}=await db.rpc("delete_receptionist_assistant",{_account_id:acting.accountId,_assistant_id:data.id});
  if(error) throw new Error("Archive an unselected assistant before deleting it.");
  return {ok:true};
});