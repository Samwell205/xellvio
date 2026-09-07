import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CHECKLIST_STEPS,
  CONTEXTUAL_TIPS,
  STAGE_LABELS,
  type LifecycleStage,
} from "@/lib/lifecycle/taxonomy";

/**
 * Tenant-facing lifecycle surface: the onboarding checklist, the in-app
 * messages the engine produced, contextual tips, celebrations, recommendations
 * and communication preferences. Everything reflects real workspace activity.
 */

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return (await resolveActingAccount(userId)).accountId;
}

export type ChecklistItem = { key: string; label: string; href: string; done: boolean };
export type LifecycleMessage = {
  id: string;
  title: string | null;
  body: string | null;
  cta_label: string | null;
  cta_path: string | null;
  sent_at: string;
  seen_at: string | null;
};
export type Recommendation = { key: string; title: string; body: string; cta: string; href: string };

export type LifecycleState = {
  stage: LifecycleStage;
  stage_label: string;
  progress: number;
  completed: number;
  total: number;
  checklist: ChecklistItem[];
  next: ChecklistItem | null;
  show_welcome: boolean;
  celebrate_first_send: boolean;
  checklist_hidden: boolean;
  messages: LifecycleMessage[];
  recommendations: Recommendation[];
};

/**
 * The workspace's live onboarding state. Called on dashboard load: it refreshes
 * the lifecycle profile from real rows, so completing an action anywhere in the
 * product immediately updates progress and cancels the matching reminder.
 */
export const getLifecycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LifecycleState> => {
    const accountId = await acct(context.userId);
    const { refreshLifecycle } = await import("./lifecycle/engine.server");
    const row = await refreshLifecycle(accountId, { login: true, userId: context.userId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const checklist: ChecklistItem[] = CHECKLIST_STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      href: s.href,
      done: Boolean((row as any)[s.field]),
    }));
    const completed = checklist.filter((c) => c.done).length;
    const next = checklist.find((c) => !c.done) ?? null;

    const { data: messages } = await db
      .from("lifecycle_messages")
      .select("id,title,body,cta_label,cta_path,sent_at,seen_at")
      .eq("account_id", accountId)
      .is("dismissed_at", null)
      .order("sent_at", { ascending: false })
      .limit(5);

    // Recommendations: only ever about something the workspace has not done yet,
    // and only when an earlier step makes the suggestion sensible.
    const recommendations: Recommendation[] = [];
    if (row.first_campaign_at && !row.first_campaign_sent_at) {
      recommendations.push({
        key: "send_campaign",
        title: "Your campaign is ready but hasn't been sent",
        body: "Review the message and audience, then send or schedule it.",
        cta: "Continue campaign",
        href: "/app/campaigns",
      });
    }
    if (row.first_campaign_sent_at && !row.first_automation_at) {
      recommendations.push({
        key: "try_automations",
        title: "Ready to save time?",
        body: "Automate follow-ups and customer journeys with Xellvio Automations.",
        cta: "Explore automations",
        href: "/app/automations",
      });
    }
    if (row.first_campaign_sent_at && !row.first_form_at) {
      recommendations.push({
        key: "grow_list",
        title: "Keep your list growing",
        body: "A sign-up form collects consented contacts while you focus on sending.",
        cta: "Create a form",
        href: "/app/signup-forms",
      });
    }
    if (row.first_contacts_at && !row.first_campaign_at) {
      recommendations.push({
        key: "first_campaign",
        title: "Your contacts are ready",
        body: "Turn them into your first SMS campaign.",
        cta: "Create campaign",
        href: "/app/campaigns/new",
      });
    }

    const celebrate = Boolean(row.first_campaign_sent_at && !row.celebrated_first_send_at);
    const hidden =
      Boolean(row.checklist_dismissed_until) &&
      new Date(row.checklist_dismissed_until as string).getTime() > Date.now();

    return {
      stage: row.stage,
      stage_label: STAGE_LABELS[row.stage] ?? row.stage,
      progress: row.progress_pct,
      completed,
      total: checklist.length,
      checklist,
      next,
      show_welcome: !row.welcome_seen_at,
      celebrate_first_send: celebrate,
      checklist_hidden: hidden,
      messages: (messages ?? []) as LifecycleMessage[],
      recommendations: recommendations.slice(0, 3),
    };
  });

const AckSchema = z.object({
  welcome_seen: z.boolean().optional(),
  celebrated: z.boolean().optional(),
  snooze_hours: z.number().int().min(0).max(720).optional(),
});

/** Records that the welcome or celebration was seen, or snoozes the checklist. */
export const acknowledgeLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AckSchema.parse(i))
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const patch: Record<string, unknown> = {};
    const now = new Date().toISOString();
    if (data.welcome_seen) patch.welcome_seen_at = now;
    if (data.celebrated) patch.celebrated_first_send_at = now;
    if (typeof data.snooze_hours === "number")
      patch.checklist_dismissed_until = new Date(
        Date.now() + data.snooze_hours * 3_600_000,
      ).toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };
    await db.from("tenant_lifecycle").update(patch).eq("account_id", accountId);
    return { ok: true };
  });

const TipSchema = z.object({
  tip: z.enum(Object.keys(CONTEXTUAL_TIPS) as [string, ...string[]]),
  dismissed: z.boolean().optional(),
});

/** Which contextual tips this workspace has already been shown. */
export const getSeenTips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("tenant_tips")
      .select("tip_key")
      .eq("account_id", accountId);
    return (data ?? []).map((r: { tip_key: string }) => r.tip_key);
  });

export const markTipSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TipSchema.parse(i))
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("tenant_tips").upsert(
      {
        account_id: accountId,
        tip_key: data.tip,
        dismissed_at: data.dismissed ? new Date().toISOString() : null,
      },
      { onConflict: "account_id,tip_key" },
    );
    const { recordTenantEvent } = await import("./lifecycle/engine.server");
    await recordTenantEvent({
      accountId,
      event: "TIP_SEEN",
      metadata: { tip: data.tip },
      userId: context.userId,
    });
    return { ok: true };
  });

const MessageAckSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["seen", "clicked", "dismissed"]),
});

export const acknowledgeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MessageAckSchema.parse(i))
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const field =
      data.action === "seen" ? "seen_at" : data.action === "clicked" ? "clicked_at" : "dismissed_at";
    await (supabaseAdmin as any)
      .from("lifecycle_messages")
      .update({ [field]: new Date().toISOString() })
      .eq("id", data.id)
      .eq("account_id", accountId);
    return { ok: true };
  });

/** Communication preferences (optional marketing/education only). */
export const getCommPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("tenant_comm_prefs")
      .select("product_updates,educational,promotional,announcements")
      .eq("account_id", accountId)
      .maybeSingle();
    return (
      data ?? { product_updates: true, educational: true, promotional: true, announcements: true }
    );
  });

const PrefsSchema = z.object({
  product_updates: z.boolean(),
  educational: z.boolean(),
  promotional: z.boolean(),
  announcements: z.boolean(),
});

export const saveCommPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PrefsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("tenant_comm_prefs")
      .upsert({ account_id: accountId, ...data }, { onConflict: "account_id" });
    return { ok: true };
  });

/** Announcements that apply to this workspace, newest first. */
export const getAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: prefs } = await db
      .from("tenant_comm_prefs")
      .select("announcements")
      .eq("account_id", accountId)
      .maybeSingle();
    if (prefs && prefs.announcements === false) return [];
    const { data: life } = await db
      .from("tenant_lifecycle")
      .select("stage")
      .eq("account_id", accountId)
      .maybeSingle();
    const nowIso = new Date().toISOString();
    const { data: rows } = await db
      .from("lifecycle_announcements")
      .select("id,title,body,kind,cta_label,cta_path,target_stages,published_at")
      .not("published_at", "is", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("published_at", { ascending: false })
      .limit(5);
    const stage = life?.stage ?? "new";
    const matching = (rows ?? []).filter(
      (r: any) => !r.target_stages?.length || r.target_stages.includes(stage),
    );
    if (matching.length === 0) return [];
    const { data: receipts } = await db
      .from("announcement_receipts")
      .select("announcement_id,dismissed_at")
      .eq("account_id", accountId);
    const dismissed = new Set(
      (receipts ?? []).filter((r: any) => r.dismissed_at).map((r: any) => r.announcement_id),
    );
    return matching.filter((r: any) => !dismissed.has(r.id));
  });

const AnnouncementAckSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["seen", "clicked", "dismissed"]),
});

export const acknowledgeAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AnnouncementAckSchema.parse(i))
  .handler(async ({ data, context }) => {
    const accountId = await acct(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { announcement_id: data.id, account_id: accountId };
    if (data.action === "clicked") patch.clicked_at = now;
    if (data.action === "dismissed") patch.dismissed_at = now;
    await (supabaseAdmin as any)
      .from("announcement_receipts")
      .upsert(patch, { onConflict: "announcement_id,account_id" });
    return { ok: true };
  });
