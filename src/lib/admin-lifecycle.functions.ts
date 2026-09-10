import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LIFECYCLE_STAGES, CHECKLIST_STEPS } from "@/lib/lifecycle/taxonomy";

/**
 * Admin-side customer success reporting and controls.
 * Everything here reports real workspace activity — no estimated or sample data.
 */

async function assertAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type LifecycleOverview = {
  stages: Array<{ stage: string; count: number }>;
  steps: Array<{ key: string; label: string; completed: number }>;
  totals: {
    workspaces: number;
    activated: number;
    onboarding_completed: number;
    avg_progress: number;
  };
  messages: Array<{ template_key: string; sent: number; seen: number; clicked: number }>;
  at_risk: Array<{
    account_id: string;
    label: string | null;
    stage: string;
    progress_pct: number;
    last_activity_at: string | null;
  }>;
};

/** Aggregate onboarding and lifecycle health across every workspace. */
export const getLifecycleOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LifecycleOverview> => {
    await assertAdmin(context);
    const sb = await db();

    const { data: rows } = await sb
      .from("tenant_lifecycle")
      .select("*")
      .order("last_activity_at", { ascending: false })
      .limit(2000);
    const list = (rows ?? []) as any[];

    const stages = LIFECYCLE_STAGES.map((stage) => ({
      stage,
      count: list.filter((r) => r.stage === stage).length,
    }));

    const steps = CHECKLIST_STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      completed: list.filter((r) => Boolean(r[s.field])).length,
    }));

    const activated = list.filter((r) => Boolean(r.first_campaign_sent_at)).length;
    const onboardingCompleted = list.filter((r) => Boolean(r.onboarding_completed_at)).length;
    const avgProgress = list.length
      ? Math.round(list.reduce((a, r) => a + Number(r.progress_pct ?? 0), 0) / list.length)
      : 0;

    const { data: msgs } = await sb
      .from("lifecycle_messages")
      .select("template_key,seen_at,clicked_at")
      .limit(5000);
    const byTemplate = new Map<string, { sent: number; seen: number; clicked: number }>();
    for (const m of (msgs ?? []) as any[]) {
      const e = byTemplate.get(m.template_key) ?? { sent: 0, seen: 0, clicked: 0 };
      e.sent += 1;
      if (m.seen_at) e.seen += 1;
      if (m.clicked_at) e.clicked += 1;
      byTemplate.set(m.template_key, e);
    }

    const riskRows = list
      .filter((r) => ["at_risk", "inactive", "churned"].includes(r.stage))
      .slice(0, 25);
    const accountIds = riskRows.map((r) => r.account_id);
    const labels = new Map<string, string | null>();
    if (accountIds.length) {
      const { data: accounts } = await sb
        .from("accounts")
        .select("id,legal_business_name,email")
        .in("id", accountIds);
      for (const a of (accounts ?? []) as any[])
        labels.set(a.id, a.legal_business_name || a.email || null);
    }

    return {
      stages,
      steps,
      totals: {
        workspaces: list.length,
        activated,
        onboarding_completed: onboardingCompleted,
        avg_progress: avgProgress,
      },
      messages: [...byTemplate.entries()]
        .map(([template_key, v]) => ({ template_key, ...v }))
        .sort((a, b) => b.sent - a.sent),
      at_risk: riskRows.map((r) => ({
        account_id: r.account_id,
        label: labels.get(r.account_id) ?? null,
        stage: r.stage,
        progress_pct: Number(r.progress_pct ?? 0),
        last_activity_at: r.last_activity_at,
      })),
    };
  });

/** The editable message templates that drive lifecycle communication. */
export const listLifecycleTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = await db();
    const { data } = await sb
      .from("lifecycle_templates")
      .select("key,category,channels,enabled,subject,title,body,cta_label,cta_path")
      .order("category", { ascending: true })
      .order("key", { ascending: true });
    return (data ?? []) as any[];
  });

const TemplateSchema = z.object({
  key: z.string().min(1).max(80),
  enabled: z.boolean().optional(),
  subject: z.string().max(200).nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(4000).optional(),
  cta_label: z.string().max(80).nullable().optional(),
  cta_path: z.string().max(200).nullable().optional(),
});

/** Edits one template. Wording stays fully under human control. */
export const saveLifecycleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TemplateSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await db();
    const { key, ...patch } = data;
    await sb.from("lifecycle_templates").update(patch).eq("key", key);
    return { ok: true };
  });

/** One workspace's real activity timeline, for support conversations. */
export const getTenantTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accountId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await db();
    const [{ data: events }, { data: life }, { data: messages }] = await Promise.all([
      sb
        .from("tenant_events")
        .select("event,metadata,created_at")
        .eq("account_id", data.accountId)
        .order("created_at", { ascending: false })
        .limit(100),
      sb.from("tenant_lifecycle").select("*").eq("account_id", data.accountId).maybeSingle(),
      sb
        .from("lifecycle_messages")
        .select("template_key,category,channel,sent_at,seen_at,clicked_at")
        .eq("account_id", data.accountId)
        .order("sent_at", { ascending: false })
        .limit(50),
    ]);
    return {
      lifecycle: life ?? null,
      events: (events ?? []) as any[],
      messages: (messages ?? []) as any[],
    };
  });

const AnnouncementSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(3).max(2000),
  kind: z.enum(["info", "feature", "maintenance"]).default("info"),
  cta_label: z.string().max(80).optional().nullable(),
  cta_path: z.string().max(200).optional().nullable(),
  target_stages: z.array(z.enum(LIFECYCLE_STAGES)).optional(),
  publish: z.boolean().default(false),
});

/** Creates a product announcement, published only when explicitly chosen. */
export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AnnouncementSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await db();
    const { publish, ...rest } = data;
    const { data: row } = await sb
      .from("lifecycle_announcements")
      .insert({
        ...rest,
        target_stages: data.target_stages ?? [],
        published_at: publish ? new Date().toISOString() : null,
      })
      .select("id")
      .maybeSingle();
    return { id: row?.id ?? null };
  });

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = await db();
    const { data } = await sb
      .from("lifecycle_announcements")
      .select("id,title,body,kind,cta_label,cta_path,target_stages,published_at,expires_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []) as any[];
  });

/** Publishes or unpublishes an existing announcement. */
export const setAnnouncementPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await db();
    await sb
      .from("lifecycle_announcements")
      .update({ published_at: data.published ? new Date().toISOString() : null })
      .eq("id", data.id);
    return { ok: true };
  });

/** Runs the scheduled lifecycle checks immediately (admin-triggered). */
export const runLifecycleChecksNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runLifecycleChecks } = await import("@/lib/lifecycle/scheduler.server");
    return await runLifecycleChecks(200);
  });
