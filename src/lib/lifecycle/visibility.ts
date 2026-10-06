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