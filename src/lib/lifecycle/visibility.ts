export type LifecycleVisibilityInput = {
  completed: number;
  total: number;
  firstCampaignSentAt: string | null;
  launchedCampaignCount?: number;
  trackingStartedAt?: string | null;
  now?: number;
};

export type LifecycleVisibility = {
  showWelcome: boolean;
  celebrateFirstSend: boolean;
  checklistHidden: false;
};

/**
 * Dashboard lifecycle cards are required guidance, so prior dismissals must not
 * hide them. Visibility is based only on real workspace progress.
 */
export function dashboardLifecycleVisibility({
  completed,
  total,
  firstCampaignSentAt,
  launchedCampaignCount = 0,
  trackingStartedAt = null,
  now = Date.now(),
}: LifecycleVisibilityInput): LifecycleVisibility {
  const first = firstCampaignSentAt ? Date.parse(firstCampaignSentAt) : NaN;
  const tracking = trackingStartedAt ? Date.parse(trackingStartedAt) : NaN;
  return {
    showWelcome: completed < total && launchedCampaignCount === 0,
    celebrateFirstSend: launchedCampaignCount === 1 && first >= tracking && now >= first && now - first < 48 * 3_600_000,
    checklistHidden: false,
  };
}

export type LifecycleEligibility = {
  first_campaign_sent_at: string | null;
  launched_campaign_count: number;
  created_at: string | null;
  workspace_completed_at: string | null;
  first_audience_at: string | null;
  first_contacts_at: string | null;
  first_campaign_at: string | null;
  first_automation_at: string | null;
  last_activity_at?: string | null;
};
export function lifecycleMessageRelevant(key: string, row: LifecycleEligibility, now = Date.now()): boolean {
  const sent = row.launched_campaign_count > 0;
  if (key === 'first_success') return dashboardLifecycleVisibility({ completed: 5, total: 5, firstCampaignSentAt: row.first_campaign_sent_at, launchedCampaignCount: row.launched_campaign_count, trackingStartedAt: row.created_at, now }).celebrateFirstSend;
  const goals: Record<string, keyof LifecycleEligibility> = { workspace_reminder: 'workspace_completed_at', audience_reminder: 'first_audience_at', contacts_reminder: 'first_contacts_at', campaign_reminder: 'first_campaign_at', send_reminder: 'first_campaign_sent_at' };
  if (key === 'welcome') return !sent;
  if (goals[key]) return !sent && !row[goals[key]];
  if (key === 'feature_discovery_automation') return sent && !row.first_automation_at;
  if (key.startsWith('inactive_')) {
    const idle = row.last_activity_at ? now - Date.parse(row.last_activity_at) : 0;
    const threshold = key === 'inactive_14d' ? 14 : key === 'inactive_7d' ? 7 : 3;
    return idle >= threshold * 86_400_000 && idle < 60 * 86_400_000 && (key !== 'inactive_3d' || !sent);
  }
  return true;
}
/** Balance (USD) below which the workspace is genuinely "running low". Matches the scheduler. */
export const LOW_BALANCE_THRESHOLD = 2;

export function isLowBalanceMessage(m: { title: string | null; cta_label: string | null }): boolean {
  return /balance|top up/i.test(`${m.title ?? ""} ${m.cta_label ?? ""}`);
}
