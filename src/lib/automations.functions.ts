import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  const a = await resolveActingAccount(userId);
  return a.accountId;
}

const StatusEnum = z.enum(["draft", "active", "paused", "archived"]);

const NodeSchema = z.object({
  node_key: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  label: z.string().max(160).default(""),
  position: z.object({ x: z.number(), y: z.number() }),
  configuration: z.record(z.string(), z.any()).default({}),
  disabled: z.boolean().default(false),
});

const EdgeSchema = z.object({
  edge_key: z.string().min(1).max(96),
  source_node_key: z.string().min(1).max(64),
  target_node_key: z.string().min(1).max(64),
  source_handle: z.string().max(64).nullable().optional(),
  target_handle: z.string().max(64).nullable().optional(),
});

export type AutomationRecord = {
  id: string;
  name: string;
  status: z.infer<typeof StatusEnum>;
  viewport: { x: number; y: number; zoom: number };
  updated_at: string;
  created_at: string;
  nodes: {
    node_key: string;
    type: string;
    label: string;
    position: { x: number; y: number };
    configuration: Record<string, any>;
    disabled: boolean;
  }[];
  connections: {
    edge_key: string;
    source_node_key: string;
    target_node_key: string;
    source_handle: string | null;
    target_handle: string | null;
  }[];
};

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("automations")
      .select("id,name,status,created_at,updated_at")
      .eq("account_id", accountId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    const { data: nodes } = ids.length
      ? await supabaseAdmin.from("automation_nodes").select("automation_id,type").in("automation_id", ids)
      : { data: [] as { automation_id: string; type: string }[] };
    return (rows ?? []).map((r) => {
      const mine = (nodes ?? []).filter((n) => n.automation_id === r.id);
      return {
        ...r,
        step_count: mine.length,
        trigger: mine.find((n) => n.type.startsWith("trigger."))?.type ?? null,
      };
    });
  });

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: created, error } = await supabaseAdmin
      .from("automations")
      .insert({ account_id: accountId, name: data.name, status: "draft" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const getAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AutomationRecord> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("automations")
      .select("id,name,status,viewport,created_at,updated_at")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Automation not found");
    const [{ data: nodes }, { data: conns }] = await Promise.all([
      supabaseAdmin
        .from("automation_nodes")
        .select("node_key,type,label,position,configuration,disabled")
        .eq("automation_id", data.id),
      supabaseAdmin
        .from("automation_connections")
        .select("edge_key,source_node_key,target_node_key,source_handle,target_handle")
        .eq("automation_id", data.id),
    ]);
    return {
      id: row.id,
      name: row.name,
      status: row.status as AutomationRecord["status"],
      viewport: (row.viewport as AutomationRecord["viewport"]) ?? { x: 0, y: 0, zoom: 1 },
      created_at: row.created_at,
      updated_at: row.updated_at,
      nodes: (nodes ?? []) as AutomationRecord["nodes"],
      connections: (conns ?? []) as AutomationRecord["connections"],
    };
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
        nodes: z.array(NodeSchema).max(400),
        connections: z.array(EdgeSchema).max(800),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: owned } = await supabaseAdmin
      .from("automations")
      .select("id")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!owned) throw new Error("Automation not found");

    const { error: ue } = await supabaseAdmin
      .from("automations")
      .update({
        name: data.name,
        ...(data.viewport ? { viewport: data.viewport } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (ue) throw new Error(ue.message);

    // Replace the graph wholesale — it is small and keeps positions/config exact.
    await supabaseAdmin.from("automation_connections").delete().eq("automation_id", data.id);
    await supabaseAdmin.from("automation_nodes").delete().eq("automation_id", data.id);
    if (data.nodes.length) {
      const { error } = await supabaseAdmin.from("automation_nodes").insert(
        data.nodes.map((n) => ({
          automation_id: data.id,
          account_id: accountId,
          node_key: n.node_key,
          type: n.type,
          label: n.label,
          position: n.position,
          configuration: n.configuration,
          disabled: n.disabled,
        })),
      );
      if (error) throw new Error(error.message);
    }
    if (data.connections.length) {
      const { error } = await supabaseAdmin.from("automation_connections").insert(
        data.connections.map((c) => ({
          automation_id: data.id,
          account_id: accountId,
          edge_key: c.edge_key,
          source_node_key: c.source_node_key,
          target_node_key: c.target_node_key,
          source_handle: c.source_handle ?? null,
          target_handle: c.target_handle ?? null,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true, saved_at: new Date().toISOString() };
  });

export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), status: StatusEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin
      .from("automations")
      .update({
        status: data.status,
        ...(data.status === "active" ? { activated_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin
      .from("automations")
      .update({ name: data.name, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin.from("automations").delete().eq("id", data.id).eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: src } = await supabaseAdmin
      .from("automations")
      .select("name,viewport")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!src) throw new Error("Automation not found");
    const { data: created, error } = await supabaseAdmin
      .from("automations")
      .insert({ account_id: accountId, name: `${src.name} (copy)`, status: "draft", viewport: src.viewport })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const [{ data: nodes }, { data: conns }] = await Promise.all([
      supabaseAdmin.from("automation_nodes").select("node_key,type,label,position,configuration,disabled").eq("automation_id", data.id),
      supabaseAdmin
        .from("automation_connections")
        .select("edge_key,source_node_key,target_node_key,source_handle,target_handle")
        .eq("automation_id", data.id),
    ]);
    if (nodes?.length) {
      await supabaseAdmin
        .from("automation_nodes")
        .insert(nodes.map((n) => ({ ...n, automation_id: created.id, account_id: accountId })));
    }
    if (conns?.length) {
      await supabaseAdmin
        .from("automation_connections")
        .insert(conns.map((c) => ({ ...c, automation_id: created.id, account_id: accountId })));
    }
    return { id: created.id as string };
  });

/** Live journey activity: who is in this automation and what has happened. */
export const getAutomationActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: automation } = await supabaseAdmin
      .from("automations")
      .select("id")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!automation) throw new Error("Automation not found");

    const [{ data: runs }, { data: events }] = await Promise.all([
      supabaseAdmin
        .from("automation_runs")
        .select("id,phone_e164,status,current_node_key,wait_until,waiting_for,steps_run,last_error,entered_at,updated_at")
        .eq("automation_id", data.id)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("automation_run_events")
        .select("id,run_id,node_key,node_type,outcome,detail,created_at")
        .eq("automation_id", data.id)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    const counts = { active: 0, waiting: 0, completed: 0, exited: 0, failed: 0 } as Record<string, number>;
    for (const r of runs ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;

    return { runs: runs ?? [], events: events ?? [], counts };
  });

/** Walk one real contact through the automation without sending anything. */
export const testRunAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), phone: z.string().trim().min(5).max(20), node_key: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: automation } = await supabaseAdmin
      .from("automations")
      .select("id")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!automation) throw new Error("Automation not found");

    const { startRun } = await import("./automation-engine.server");
    const run = await startRun({
      accountId,
      automationId: data.id,
      phone: data.phone,
      startNodeKey: data.node_key,
      test: true,
    });
    if (!run) return { ok: false, message: "That contact is already in this automation." };

    const { data: events } = await supabaseAdmin
      .from("automation_run_events")
      .select("node_key,node_type,outcome,detail,created_at")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true });
    return { ok: true, run_id: run.id, events: events ?? [] };
  });
