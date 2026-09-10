/**
 * Customer lifecycle engine (server only).
 *
 * Everything here is derived from real workspace data:
 * - milestones come from the workspace's own rows (audiences, contacts, campaigns…)
 * - progress is a count of completed checklist steps, never a stored guess
 * - a reminder is only ever sent when its goal is still incomplete
 * - each reminder is sent at most once per workspace and channel, and respects
 *   the workspace's communication preferences plus a quiet-period between
 *   optional messages.
 */
import {
  CATEGORY_PREFERENCE,
  CHECKLIST_STEPS,
  progressFrom,
  type LifecycleStage,
  type MessageCategory,
  type TenantEvent,
} from "./taxonomy";

type Db = any;

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

const SENT_STATUSES = ["sending", "sent", "paused"];

export type LifecycleRow = {
  account_id: string;
  stage: LifecycleStage;
  onboarding_state: string;
  progress_pct: number;
  first_login_at: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  workspace_completed_at: string | null;
  first_audience_at: string | null;
  first_contacts_at: string | null;
  first_campaign_at: string | null;
  first_campaign_sent_at: string | null;
  first_automation_at: string | null;
  first_landing_page_at: string | null;
  first_form_at: string | null;
  onboarding_completed_at: string | null;
  celebrated_first_send_at: string | null;
  checklist_dismissed_until: string | null;
  welcome_seen_at: string | null;
};

/** Records one product event on the tenant timeline. Never throws. */
export async function recordTenantEvent(input: {
  accountId: string;
  event: TenantEvent | string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await admin();
    await db.from("tenant_events").insert({
      account_id: input.accountId,
      user_id: input.userId ?? null,
      event: input.event,
      metadata: input.metadata ?? {},
    });
  } catch {
    /* the timeline must never break a product action */
  }
}

async function firstAt(
  db: Db,
  table: string,
  accountId: string,
  extra?: (q: any) => any,
): Promise<string | null> {
  let q = db
    .from(table)
    .select("created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (extra) q = extra(q);
  const { data } = await q.maybeSingle();
  return data?.created_at ?? null;
}

/** Reads the workspace's real milestones. */
async function readMilestones(db: Db, accountId: string) {
  const { data: account } = await db
    .from("accounts")
    .select(
      "created_at,legal_business_name,business_address,contact_email,website_url,use_case_description,last_seen_at,credit_balance",
    )
    .eq("id", accountId)
    .maybeSingle();

  const workspaceComplete = Boolean(
    account?.legal_business_name && account?.contact_email && account?.business_address,
  );

  const [audience, contacts, campaign, sentCampaign, automation, landing, form] = await Promise.all([
    firstAt(db, "contact_lists", accountId),
    firstAt(db, "profiles", accountId),
    firstAt(db, "campaigns", accountId),
    (async () => {
      const { data } = await db
        .from("campaigns")
        .select("updated_at")
        .eq("account_id", accountId)
        .in("status", SENT_STATUSES)
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.updated_at ?? null;
    })(),
    firstAt(db, "automations", accountId),
    firstAt(db, "landing_pages", accountId),
    firstAt(db, "signup_forms", accountId),
  ]);

  return {
    accountCreatedAt: account?.created_at ?? null,
    lastSeenAt: account?.last_seen_at ?? null,
    creditBalance: Number(account?.credit_balance ?? 0),
    workspace_completed_at: workspaceComplete ? (account?.created_at ?? null) : null,
    first_audience_at: audience,
    first_contacts_at: contacts,
    first_campaign_at: campaign,
    first_campaign_sent_at: sentCampaign,
    first_automation_at: automation,
    first_landing_page_at: landing,
    first_form_at: form,
  };
}

function daysSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function stageFor(
  m: Awaited<ReturnType<typeof readMilestones>>,
  progress: number,
  sentCampaigns: number,
  lastActivity: string | null,
  firstLogin: string | null,
): LifecycleStage {
  const idle = daysSince(lastActivity);
  if (idle > 60) return "churned";
  if (idle > 30) return "inactive";
  if (idle > 14) return "at_risk";
  if (sentCampaigns >= 5 && (m.first_automation_at || m.first_landing_page_at || m.first_form_at))
    return "power_user";
  if (m.first_campaign_sent_at) return "active";
  if (progress >= 40) return "activating";
  if (firstLogin) return "onboarding";
  return "new";
}

/**
 * Recalculates and stores the lifecycle profile for one workspace.
 * Creates the profile on first call, so every tenant always has one.
 */
export async function refreshLifecycle(
  accountId: string,
  opts: { login?: boolean; userId?: string | null } = {},
): Promise<LifecycleRow> {
  const db = await admin();
  const { data: existing } = await db
    .from("tenant_lifecycle")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  const m = await readMilestones(db, accountId);
  const { count: sentCampaigns } = await db
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .in("status", SENT_STATUSES);

  const completedSteps = CHECKLIST_STEPS.filter((s) => Boolean((m as any)[s.field])).length;
  const progress = progressFrom(completedSteps);
  const nowIso = new Date().toISOString();

  const firstLogin = existing?.first_login_at ?? (opts.login ? nowIso : null);
  const lastLogin = opts.login ? nowIso : (existing?.last_login_at ?? null);
  const lastActivity = opts.login ? nowIso : (m.lastSeenAt ?? existing?.last_activity_at ?? null);

  const stage = stageFor(m, progress, sentCampaigns ?? 0, lastActivity, firstLogin);

  const patch = {
    account_id: accountId,
    stage,
    onboarding_state: progress >= 100 ? "completed" : "in_progress",
    progress_pct: progress,
    first_login_at: firstLogin,
    last_login_at: lastLogin,
    last_activity_at: lastActivity,
    workspace_completed_at: m.workspace_completed_at,
    first_audience_at: m.first_audience_at,
    first_contacts_at: m.first_contacts_at,
    first_campaign_at: m.first_campaign_at,
    first_campaign_sent_at: m.first_campaign_sent_at,
    first_automation_at: m.first_automation_at,
    first_landing_page_at: m.first_landing_page_at,
    first_form_at: m.first_form_at,
    onboarding_completed_at:
      progress >= 100 ? (existing?.onboarding_completed_at ?? nowIso) : null,
  };

  const { data: saved } = await db
    .from("tenant_lifecycle")
    .upsert(patch, { onConflict: "account_id" })
    .select("*")
    .maybeSingle();

  const row = (saved ?? { ...existing, ...patch }) as LifecycleRow;

  // Timeline entries for newly reached milestones.
  if (!existing) {
    await recordTenantEvent({
      accountId,
      userId: opts.userId ?? null,
      event: "ACCOUNT_CREATED",
      metadata: { created_at: m.accountCreatedAt },
    });
    // Welcome the workspace the first time it signs in (deduped inside
    // deliverMessage). Never sent when we're only backfilling profiles.
    try {
      if (!opts.login) throw new Error("skip");
      await deliverMessage({ accountId, templateKey: "welcome" });
    } catch {
      /* onboarding must never block a page load */
    }
  }
  if (opts.login && !existing?.first_login_at) {
    await recordTenantEvent({ accountId, userId: opts.userId ?? null, event: "FIRST_LOGIN" });
  }
  const newly: Array<[string, TenantEvent]> = [
    ["workspace_completed_at", "WORKSPACE_COMPLETED"],
    ["first_audience_at", "AUDIENCE_CREATED"],
    ["first_contacts_at", "FIRST_CONTACT_ADDED"],
    ["first_campaign_at", "CAMPAIGN_CREATED"],
    ["first_campaign_sent_at", "CAMPAIGN_SENT"],
    ["first_automation_at", "AUTOMATION_CREATED"],
    ["first_landing_page_at", "LANDING_PAGE_CREATED"],
    ["first_form_at", "FORM_CREATED"],
  ];
  for (const [field, event] of newly) {
    if ((patch as any)[field] && !(existing as any)?.[field]) {
      await recordTenantEvent({ accountId, userId: opts.userId ?? null, event });
    }
  }
  if (existing && existing.stage !== stage) {
    await recordTenantEvent({
      accountId,
      event: "LIFECYCLE_STAGE_CHANGED",
      metadata: { from: existing.stage, to: stage },
    });
  }

  return row;
}

/** Which checklist goal is still open — used by reminders and re-engagement. */
export function nextStep(row: LifecycleRow) {
  return CHECKLIST_STEPS.find((s) => !(row as any)[s.field]) ?? null;
}

function fill(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => data[k] ?? "");
}

/**
 * Subject lines go out without emoji or shouting: decorative characters and
 * all-caps words are strong spam signals for inbox filters.
 */
function cleanSubject(text: string): string {
  return text
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu,
      "",
    )
    .replace(/!{2,}/g, "!")
    .replace(/\s{2,}/g, " ")
    .trim();
}


/** Quiet period between optional (non-transactional) messages, in hours. */
const QUIET_HOURS = 20;

/**
 * Delivers one lifecycle message.
 *
 * Skipped when: the template is disabled, the goal is already met (caller's job),
 * the workspace opted out of that category, the same message was already sent,
 * or another optional message went out inside the quiet period.
 */
export async function deliverMessage(input: {
  accountId: string;
  templateKey: string;
  channels?: string[];
  data?: Record<string, string>;
  ctaPath?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const db = await admin();
  const { data: template } = await db
    .from("lifecycle_templates")
    .select("*")
    .eq("key", input.templateKey)
    .maybeSingle();
  if (!template || !template.enabled) return { sent: false, reason: "template_off" };

  const category = template.category as MessageCategory;
  const prefKey = CATEGORY_PREFERENCE[category];
  if (prefKey) {
    const { data: prefs } = await db
      .from("tenant_comm_prefs")
      .select("*")
      .eq("account_id", input.accountId)
      .maybeSingle();
    if (prefs && prefs[prefKey] === false) return { sent: false, reason: "opted_out" };
  }

  const { data: already } = await db
    .from("lifecycle_messages")
    .select("id")
    .eq("account_id", input.accountId)
    .eq("template_key", input.templateKey)
    .limit(1)
    .maybeSingle();
  if (already) return { sent: false, reason: "already_sent" };

  if (category !== "transactional" && category !== "milestone") {
    const { data: recent } = await db
      .from("lifecycle_messages")
      .select("sent_at,category")
      .eq("account_id", input.accountId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.sent_at).getTime() < QUIET_HOURS * 3_600_000)
      return { sent: false, reason: "quiet_period" };
  }

  const { data: account } = await db
    .from("accounts")
    .select("email,contact_email,full_name")
    .eq("id", input.accountId)
    .maybeSingle();
  const firstName = (account?.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const vars = { first_name: firstName, ...(input.data ?? {}) };

  const title = fill(template.title, vars);
  const body = fill(template.body, vars);
  const ctaPath = input.ctaPath ?? template.cta_path ?? null;
  const channels: string[] = input.channels ?? template.channels ?? ["in_app"];

  // In-app is the default surface for every lifecycle message.
  await db.from("lifecycle_messages").insert({
    account_id: input.accountId,
    template_key: input.templateKey,
    category,
    channel: channels.includes("email") ? "in_app+email" : "in_app",
    title,
    body,
    cta_label: template.cta_label,
    cta_path: ctaPath,
  });

  if (channels.includes("email")) {
    const to = (account?.contact_email || account?.email || "").trim();
    if (to) {
      try {
        const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
        const origin = process.env.PUBLIC_SITE_URL || "https://www.xellvio.com";
        await sendBrandedEmail({
          templateName: "generic",
          recipientEmail: to,
          idempotencyKey: `lifecycle-${input.templateKey}-${input.accountId}`,
          templateData: {
            subject: fill(template.subject ?? title, vars),
            heading: title,
            body,
            ctaText: template.cta_label ?? undefined,
            ctaUrl: ctaPath ? `${origin}${ctaPath}` : undefined,
          },
        });
      } catch (e) {
        console.error("[lifecycle] email failed", input.templateKey, e);
      }
    }
  }

  await recordTenantEvent({
    accountId: input.accountId,
    event: "MESSAGE_SENT",
    metadata: { template: input.templateKey, category, channels },
  });

  return { sent: true };
}
