/**
 * Scheduled lifecycle checks (server only).
 *
 * Runs periodically and reacts to what each workspace actually did:
 * - onboarding reminders, only while the goal is still open
 * - a first-success celebration once a real campaign has been sent
 * - re-engagement after 3 / 7 / 14 days of genuine inactivity
 * - a low-balance notice based on the real credit balance
 * - one feature-discovery nudge once the workspace is actually active
 *
 * Every send goes through deliverMessage(), which enforces preferences,
 * one-send-per-message and the quiet period between optional messages.
 */
import { deliverMessage, refreshLifecycle, nextStep, type LifecycleRow } from "./engine.server";

type Db = any;

const REMINDER_FOR: Record<string, string> = {
  workspace: "workspace_reminder",
  audience: "audience_reminder",
  contacts: "contacts_reminder",
  campaign: "campaign_reminder",
  send: "send_reminder",
};

function days(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export type LifecycleTickResult = {
  checked: number;
  reminders: number;
  celebrations: number;
  reengagement: number;
  lowCredits: number;
  discovery: number;
};

export async function runLifecycleChecks(limit = 200): Promise<LifecycleTickResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Db;

  const result: LifecycleTickResult = {
    checked: 0,
    reminders: 0,
    celebrations: 0,
    reengagement: 0,
    lowCredits: 0,
    discovery: 0,
  };

  // Make sure every workspace has a lifecycle profile. Backfilled profiles get
  // no welcome message — they only start receiving anything after a real login.
  const { data: accounts, error: accErr } = await db.from("accounts").select("id").limit(500);
  if (accErr) console.error("[lifecycle] accounts read failed", accErr);
  console.log("[lifecycle] accounts", (accounts ?? []).length);
  const { data: known } = await db.from("tenant_lifecycle").select("account_id").limit(2000);
  const have = new Set(((known ?? []) as Array<{ account_id: string }>).map((r) => r.account_id));
  for (const a of ((accounts ?? []) as Array<{ id: string }>).filter((a) => !have.has(a.id)).slice(0, 100)) {
    try {
      await refreshLifecycle(a.id);
    } catch (e) {
      console.error("[lifecycle] backfill failed", a.id, e);
    }
  }

  // Only workspaces that have signed in at least once, oldest-refreshed first.
  const { data: rows } = await db
    .from("tenant_lifecycle")
    .select("*")
    .not("first_login_at", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  for (const stored of (rows ?? []) as LifecycleRow[]) {
    const accountId = stored.account_id;
    let row: LifecycleRow;
    try {
      row = await refreshLifecycle(accountId);
    } catch {
      continue;
    }
    result.checked += 1;

    const { data: account } = await db
      .from("accounts")
      .select("credit_balance")
      .eq("id", accountId)
      .maybeSingle();
    const balance = Number(account?.credit_balance ?? 0);

    // 1. Celebrate the first real send.
    if (row.first_campaign_sent_at) {
      const r = await deliverMessage({ accountId, templateKey: "first_success" });
      if (r.sent) result.celebrations += 1;
    }

    // 2. Onboarding reminder for the step that is still open (after 1 day idle).
    const step = nextStep(row);
    if (step && days(row.last_activity_at) >= 1 && days(row.first_login_at) >= 1) {
      const key = REMINDER_FOR[step.key];
      if (key) {
        const r = await deliverMessage({ accountId, templateKey: key });
        if (r.sent) result.reminders += 1;
      }
    }

    // 3. Re-engagement, escalating with real inactivity.
    const idle = days(row.last_activity_at);
    const reengage = idle >= 14 ? "inactive_14d" : idle >= 7 ? "inactive_7d" : idle >= 3 ? "inactive_3d" : null;
    if (reengage && idle < 60) {
      const r = await deliverMessage({ accountId, templateKey: reengage });
      if (r.sent) result.reengagement += 1;
    }

    // 4. Low balance — transactional, so it is never suppressed by marketing prefs.
    if (row.first_campaign_sent_at && balance > 0 && balance < 2) {
      const r = await deliverMessage({
        accountId,
        templateKey: "low_credits",
        data: { balance: balance.toFixed(2) },
      });
      if (r.sent) result.lowCredits += 1;
    }

    // 5. Feature discovery — only once the workspace has actually sent something.
    if (row.first_campaign_sent_at && !row.first_automation_at && days(row.first_campaign_sent_at) >= 3) {
      const r = await deliverMessage({
        accountId,
        templateKey: "feature_discovery_automation",
      });
      if (r.sent) result.discovery += 1;
    }
  }

  return result;
}
