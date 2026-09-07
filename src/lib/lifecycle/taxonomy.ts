/**
 * Shared vocabulary for the Xellvio customer lifecycle engine.
 *
 * One place defines the lifecycle stages, the activation checklist, the product
 * events we record and the contextual tips. Everything else (server engine,
 * in-app UI, admin dashboard) reads from here so the wording and the maths stay
 * consistent.
 */

export const LIFECYCLE_STAGES = [
  "new",
  "onboarding",
  "activating",
  "active",
  "power_user",
  "at_risk",
  "inactive",
  "churned",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const STAGE_LABELS: Record<LifecycleStage, string> = {
  new: "New",
  onboarding: "Onboarding",
  activating: "Activating",
  active: "Active",
  power_user: "Power user",
  at_risk: "At risk",
  inactive: "Inactive",
  churned: "Churned",
};

/** Product events recorded on the tenant timeline. */
export const TENANT_EVENTS = [
  "ACCOUNT_CREATED",
  "FIRST_LOGIN",
  "WORKSPACE_COMPLETED",
  "AUDIENCE_CREATED",
  "CONTACT_IMPORTED",
  "FIRST_CONTACT_ADDED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_SCHEDULED",
  "CAMPAIGN_SENT",
  "AUTOMATION_CREATED",
  "AUTOMATION_ACTIVATED",
  "LANDING_PAGE_CREATED",
  "LANDING_PAGE_PUBLISHED",
  "FORM_CREATED",
  "FORM_PUBLISHED",
  "INTEGRATION_CONNECTED",
  "CREDITS_PURCHASED",
  "PLAN_UPGRADED",
  "MILESTONE_REACHED",
  "LIFECYCLE_STAGE_CHANGED",
  "MESSAGE_SENT",
  "ANNOUNCEMENT_SEEN",
  "TIP_SEEN",
] as const;
export type TenantEvent = (typeof TENANT_EVENTS)[number];

export const EVENT_LABELS: Partial<Record<TenantEvent, string>> = {
  ACCOUNT_CREATED: "Account created",
  FIRST_LOGIN: "First login",
  WORKSPACE_COMPLETED: "Workspace completed",
  AUDIENCE_CREATED: "Audience created",
  CONTACT_IMPORTED: "Contacts imported",
  FIRST_CONTACT_ADDED: "First contact added",
  CAMPAIGN_CREATED: "Campaign created",
  CAMPAIGN_SCHEDULED: "Campaign scheduled",
  CAMPAIGN_SENT: "Campaign sent 🎉",
  AUTOMATION_CREATED: "Automation created",
  AUTOMATION_ACTIVATED: "Automation activated",
  LANDING_PAGE_CREATED: "Landing page created",
  LANDING_PAGE_PUBLISHED: "Landing page published",
  FORM_CREATED: "Sign-up form created",
  FORM_PUBLISHED: "Sign-up form published",
  INTEGRATION_CONNECTED: "Integration connected",
  CREDITS_PURCHASED: "Credits purchased",
  PLAN_UPGRADED: "Plan upgraded",
  MILESTONE_REACHED: "Milestone reached",
  LIFECYCLE_STAGE_CHANGED: "Lifecycle stage changed",
  MESSAGE_SENT: "Lifecycle message sent",
  ANNOUNCEMENT_SEEN: "Announcement seen",
  TIP_SEEN: "Guidance shown",
};

/**
 * The activation checklist. Five steps, each worth 20% — progress is always
 * derived from real workspace rows, never stored optimistically.
 */
export const CHECKLIST_STEPS = [
  {
    key: "workspace",
    label: "Complete your workspace",
    href: "/app/onboarding",
    field: "workspace_completed_at",
  },
  {
    key: "audience",
    label: "Create your first audience",
    href: "/app/lists",
    field: "first_audience_at",
  },
  { key: "contacts", label: "Add contacts", href: "/app/audience", field: "first_contacts_at" },
  {
    key: "campaign",
    label: "Create your first SMS campaign",
    href: "/app/campaigns/new",
    field: "first_campaign_at",
  },
  {
    key: "send",
    label: "Send your first message",
    href: "/app/campaigns",
    field: "first_campaign_sent_at",
  },
] as const;
export type ChecklistKey = (typeof CHECKLIST_STEPS)[number]["key"];

/** Contextual tips, shown once per area the first time a workspace opens it. */
export const CONTEXTUAL_TIPS: Record<string, { title: string; body: string }> = {
  audiences: {
    title: "This is where your customer list lives",
    body: "Start by importing contacts or creating an audience manually.",
  },
  campaigns: {
    title: "Campaigns reach your audience",
    body: "Create and send personalised SMS campaigns to the people on your lists.",
  },
  automations: {
    title: "Automations work while you sleep",
    body: "Automations help Xellvio react automatically to customer actions.",
  },
  "landing-pages": {
    title: "Collect sign-ups with a landing page",
    body: "Publish a page that turns visitors into SMS subscribers.",
  },
  "signup-forms": {
    title: "Grow your list with a form",
    body: "Embed a sign-up form on your site to collect consented contacts.",
  },
};

/** Feature areas used by the discovery engine. */
export const FEATURES = [
  "campaigns",
  "audiences",
  "contacts",
  "automations",
  "landing_pages",
  "forms",
  "integrations",
] as const;
export type FeatureKey = (typeof FEATURES)[number];

/** Message categories, used for preferences and frequency control. */
export const MESSAGE_CATEGORIES = [
  "onboarding",
  "educational",
  "milestone",
  "promotional",
  "product_update",
  "transactional",
] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/** Which preference switch governs each category (transactional is never optional). */
export const CATEGORY_PREFERENCE: Record<MessageCategory, string | null> = {
  onboarding: "educational",
  educational: "educational",
  milestone: null,
  promotional: "promotional",
  product_update: "product_updates",
  transactional: null,
};

export function progressFrom(completed: number): number {
  return Math.round((completed / CHECKLIST_STEPS.length) * 100);
}
