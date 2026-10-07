export type LifecycleVisibilityInput = {
  completed: number;
  total: number;
  firstCampaignSentAt: string | null;
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
}: LifecycleVisibilityInput): LifecycleVisibility {
  return {
    showWelcome: completed < total,
    celebrateFirstSend: Boolean(firstCampaignSentAt),
    checklistHidden: false,
  };
}
/** Balance (USD) below which the workspace is genuinely "running low". Matches the scheduler. */
export const LOW_BALANCE_THRESHOLD = 2;

export function isLowBalanceMessage(m: { title: string | null; cta_label: string | null }): boolean {
  return /balance|top up/i.test(`${m.title ?? ""} ${m.cta_label ?? ""}`);
}
