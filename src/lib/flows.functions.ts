import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  const a = await resolveActingAccount(userId);
  return a.accountId;
}

const StepSchema = z.object({
  delay_minutes: z.number().int().min(0).max(43200),
  body: z.string().trim().min(1).max(1200),
});

const FlowSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  trigger_type: z.enum(["new_contact", "list_join", "keyword_reply"]),
  trigger_keyword: z.string().trim().max(40).nullable().optional(),
  trigger_list_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "live", "paused"]).default("draft"),
  steps: z.array(StepSchema).min(1).max(10),
});

export const listFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: flows } = await supabaseAdmin
      .from("sms_flows")
      .select("id,name,status,trigger_type,trigger_keyword,trigger_list_id,created_at,updated_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    const ids = (flows ?? []).map((f) => f.id);
    const [{ data: steps }, { data: runs }] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("sms_flow_steps").select("id,flow_id,position,delay_minutes,body").in("flow_id", ids).order("position")
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabaseAdmin.from("sms_flow_runs").select("flow_id,status").in("flow_id", ids)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    return (flows ?? []).map((f) => {
      const r = (runs ?? []).filter((x: any) => x.flow_id === f.id);
      return {
        ...f,
        steps: (steps ?? []).filter((s: any) => s.flow_id === f.id),
        stats: {
          scheduled: r.filter((x: any) => x.status === "scheduled").length,
          sent: r.filter((x: any) => x.status === "sent").length,
          failed: r.filter((x: any) => x.status === "failed").length,
        },
      };
    });
  });

export const saveFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FlowSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    if (data.trigger_type === "keyword_reply" && !data.trigger_keyword?.trim()) {
      throw new Error("Add the keyword contacts should text in.");
    }
    const payload = {
      account_id: accountId,
      name: data.name,
      status: data.status,
      trigger_type: data.trigger_type,
      trigger_keyword: data.trigger_type === "keyword_reply" ? (data.trigger_keyword ?? "").trim().toUpperCase() : null,
      trigger_list_id: data.trigger_type === "list_join" ? data.trigger_list_id ?? null : null,
      updated_at: new Date().toISOString(),
    };
    let flowId = data.id ?? null;
    if (flowId) {
      const { error } = await supabaseAdmin.from("sms_flows").update(payload).eq("id", flowId).eq("account_id", accountId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("sms_flow_steps").delete().eq("flow_id", flowId);
    } else {
      const { data: created, error } = await supabaseAdmin.from("sms_flows").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      flowId = created.id;
    }
    const { error: se } = await supabaseAdmin.from("sms_flow_steps").insert(
      data.steps.map((s, i) => ({
        flow_id: flowId,
        account_id: accountId,
        position: i + 1,
        delay_minutes: s.delay_minutes,
        body: s.body,
      })),
    );
    if (se) throw new Error(se.message);
    return { id: flowId };
  });

export const setFlowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "live", "paused"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin
      .from("sms_flows")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin.from("sms_flows").delete().eq("id", data.id).eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends the first step of a flow to one number right away, for testing. */
export const sendFlowTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ body: z.string().trim().min(1).max(1200), phone: z.string().trim().min(8).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { sendAutomationSms } = await import("./flows.server");
    const phone = data.phone.startsWith("+") ? data.phone : `+${data.phone.replace(/\D/g, "")}`;
    await sendAutomationSms(accountId, phone, data.body);
    return { ok: true };
  });

export const listFlowRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data } = await supabaseAdmin
      .from("sms_flow_runs")
      .select("id,flow_id,phone_e164,step_position,status,run_at,sent_at,error")
      .eq("account_id", accountId)
      .order("run_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
