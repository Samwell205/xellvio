import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assistedRequestSchema, canCompleteAssistedRequest } from "./receptionist/assisted";

export const listMyAssistedNumbers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { resolveActingAccount } = await import("./acting-account.server");
  const acting = await resolveActingAccount(context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("assisted_number_requests").select("id,country,number_type,requested_number,status,fee_usd,charged_at,target_at,ticket_id,admin_notes,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error("Number requests could not be loaded.");
  return data ?? [];
});

export const submitAssistedNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => assistedRequestSchema.parse(input)).handler(async ({ context, data }) => {
  const { resolveActingAccount, assertOwner } = await import("./acting-account.server");
  const acting = await resolveActingAccount(context.userId); assertOwner(acting);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: id, error } = await supabaseAdmin.rpc("submit_assisted_number_request", { _account_id: acting.accountId, _requested_by: context.userId, _country: data.country, _number_type: data.numberType, _requested_number: data.phoneNumber, _purpose: data.purpose });
  if (error) throw new Error(error.message.includes("Insufficient balance") ? "You need $100 in credits to request assisted verification." : "Your request could not be submitted. No assistance fee was taken.");
  const { data: row } = await supabaseAdmin.from("assisted_number_requests").select("ticket_id").eq("id", id).single();
  return { id, ticketId: row?.ticket_id };
});

async function admin(client: { rpc: Function }) {
  const { data, error } = await client.rpc("has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden");
}
export const adminListAssistedNumbers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await admin(context.supabase);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("assisted_number_requests").select("*, accounts:account_id(email,full_name,contact_email), receptionist:account_id(configuration,voice_number,provision_status,requirement_group_id,assistant_id,number_billing_status)").order("created_at", { ascending: false }).limit(100);
  // Receptionist settings are not a direct foreign-key relation; load bounded account rows separately.
  if (error) {
    const result = await supabaseAdmin.from("assisted_number_requests").select("*, accounts:account_id(email,full_name,contact_email)").order("created_at", { ascending: false }).limit(100);
    if (result.error) throw new Error("Assisted requests could not be loaded.");
    return result.data ?? [];
  }
  return data ?? [];
});

export const adminUpdateAssistedNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["pending","in_review","documents_needed","carrier_pending","completed","rejected"]), notes: z.string().trim().max(2000) }).parse(input)).handler(async ({ context, data }) => {
  await admin(context.supabase);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: request, error: readError } = await supabaseAdmin.from("assisted_number_requests").select("account_id,requested_number,status").eq("id", data.id).single();
  if (readError || !request) throw new Error("Request not found.");
  if (request.status === "completed" || request.status === "rejected") throw new Error("This request is closed.");
  if (data.status === "completed") {
    const { refreshNumberOrder } = await import("./receptionist/provision.server");
    await refreshNumberOrder(request.account_id);
    const { data: settings } = await supabaseAdmin.from("receptionist_settings").select("voice_number,provision_status").eq("account_id", request.account_id).maybeSingle();
    if (!canCompleteAssistedRequest(request.requested_number, settings?.voice_number ?? null, settings?.provision_status ?? "")) throw new Error("The exact requested number must be ordered and pass carrier checks before completion. SMS and pilot-call approval remain separate.");
  }
  const { error } = await supabaseAdmin.from("assisted_number_requests").update({ status: data.status, admin_notes: data.notes || null, reviewed_by: context.userId, updated_at: new Date().toISOString() }).eq("id", data.id).eq("status", request.status);
  if (error) throw new Error("Request could not be updated.");
  return { ok: true };
});