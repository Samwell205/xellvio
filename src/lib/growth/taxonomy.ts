/**
 * Shared vocabulary for the Xellvio growth intelligence engine.
 *
 * One place defines the funnel, the event names, the activation catalogue and the
 * wording rules for insights so that tracking code, dashboards and the AI analyst
 * all describe the same journey.
 */

export const FUNNEL_STAGES = [
  { key: "visitor", label: "Visitors", help: "Someone opened a Xellvio page." },
  { key: "engaged", label: "Engaged visitors", help: "Viewed more than one page or spent real time on one." },
  { key: "explorer", label: "Product explorers", help: "Opened a product, feature, template, solution or resource page." },
  { key: "cta_click", label: "CTA clicks", help: "Clicked a start / get started / use template style call to action." },
  { key: "signup_started", label: "Signup started", help: "Opened the signup form and began filling it in." },
  { key: "signup_completed", label: "Signup completed", help: "Account successfully created." },
  { key: "onboarding_started", label: "Onboarding started", help: "Began workspace setup." },
  { key: "activated", label: "Activated users", help: "Completed a real first outcome you defined as activation." },
  { key: "active", label: "Active users", help: "Kept using Xellvio after activating." },
  { key: "paying", label: "Paying customers", help: "Paid for credits or a plan." },
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number]["key"];

/** Every event name the app is allowed to emit. Keeps naming consistent. */
export const TRACKED_EVENTS = [
  // public website
  "page_view",
  "product_page_view",
  "pricing_page_view",
  "template_view",
  "template_preview",
  "resource_view",
  "cta_click",
  "signup_click",
  // authentication
  "signup_started",
  "signup_completed",
  "login_completed",
  // onboarding
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "onboarding_goal_selected",
  "onboarding_recommendation_clicked",
  // product
  "workspace_created",
  "contact_imported",
  "campaign_created",
  "campaign_sent",
  "automation_created",
  "automation_activated",
  "form_created",
  "form_published",
  "landing_page_created",
  "landing_page_published",
  "template_imported",
  "domain_connected",
  "feature_suggestion_shown",
  "feature_suggestion_clicked",
  // commercial
  "pricing_viewed",
  "upgrade_clicked",
  "checkout_started",
  "subscription_started",
  "subscription_cancelled",
] as const;

export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

/** Events that mean the visitor explored the product rather than just landing. */
export const EXPLORER_EVENTS: TrackedEvent[] = [
  "product_page_view",
  "pricing_page_view",
  "template_view",
  "template_preview",
  "resource_view",
];

export const CTA_PLACEMENTS = [
  { key: "hero", label: "Hero" },
  { key: "nav", label: "Navigation" },
  { key: "mid_page", label: "Mid-page" },
  { key: "end_of_page", label: "End of page" },
  { key: "sidebar", label: "Sidebar" },
  { key: "in_app", label: "Inside the app" },
] as const;

export const PAGE_TYPES = [
  "home",
  "product",
  "solution",
  "pricing",
  "template",
  "resource",
  "marketplace",
  "partner",
  "legal",
  "auth",
  "app",
  "other",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

/** Classifies a public path so page analytics groups pages meaningfully. */
export function pageTypeFor(path: string): PageType {
  const p = (path || "/").split("?")[0];
  if (p === "/") return "home";
  if (p.startsWith("/templates")) return "template";
  if (p.startsWith("/pricing")) return "pricing";
  if (p.startsWith("/solutions")) return "solution";
  if (p.startsWith("/marketplace")) return "marketplace";
  if (p.startsWith("/partners")) return "partner";
  if (p.startsWith("/blog") || p.startsWith("/resources") || p.startsWith("/docs") || p.startsWith("/glossary"))
    return "resource";
  if (p.startsWith("/app") || p.startsWith("/admin")) return "app";
  if (["/auth", "/verify-email", "/forgot-password", "/reset-password"].some((a) => p.startsWith(a))) return "auth";
  if (
    ["/terms", "/privacy", "/cookies", "/dpa", "/aup", "/anti-spam", "/sms-terms", "/compliance", "/prohibited-content"].some(
      (a) => p.startsWith(a),
    )
  )
    return "legal";
  if (
    [
      "/sms-marketing",
      "/email-marketing",
      "/automations",
      "/landing-pages",
      "/signup-forms",
      "/audiences",
      "/reporting",
      "/global-delivery",
      "/features",
      "/connect",
    ].some((a) => p.startsWith(a))
  )
    return "product";
  return "other";
}

/**
 * Activation candidates. An administrator chooses which of these count.
 * `derive` names the product table the milestone is measured from — activation is
 * always read from real product data, never from a guess.
 */
export const ACTIVATION_EVENTS = [
  { key: "contact_imported", label: "Imported contacts", product: "Audience", source: "contact_import_jobs" },
  { key: "campaign_created", label: "Created first campaign", product: "SMS", source: "campaigns" },
  { key: "campaign_sent", label: "Sent first campaign", product: "SMS", source: "messages" },
  { key: "automation_created", label: "Created first workflow", product: "Automation", source: "automations" },
  { key: "automation_activated", label: "Activated a workflow", product: "Automation", source: "automations" },
  { key: "landing_page_created", label: "Created first landing page", product: "Landing pages", source: "landing_pages" },
  { key: "landing_page_published", label: "Published first landing page", product: "Landing pages", source: "landing_pages" },
  { key: "form_created", label: "Created first sign-up form", product: "Forms", source: "signup_forms" },
  { key: "form_published", label: "Published a sign-up form", product: "Forms", source: "signup_forms" },
  { key: "form_submission_received", label: "Received first submission", product: "Forms", source: "subscribe_submissions" },
  { key: "template_imported", label: "Imported a template", product: "Templates", source: "template_events" },
  { key: "domain_connected", label: "Connected a custom domain", product: "Landing pages", source: "accounts" },
] as const;

export type ActivationEventKey = (typeof ACTIVATION_EVENTS)[number]["key"];

export const DEFAULT_ACTIVATION_EVENTS: ActivationEventKey[] = [
  "campaign_sent",
  "automation_activated",
  "landing_page_published",
  "form_submission_received",
];

/** Product areas whose adoption is tracked (discovered → created → launched). */
export const PRODUCT_AREAS = [
  { key: "sms", label: "SMS campaigns" },
  { key: "automation", label: "Automation" },
  { key: "landing_pages", label: "Landing pages" },
  { key: "forms", label: "Sign-up forms" },
  { key: "audience", label: "Audiences" },
  { key: "templates", label: "Templates" },
] as const;

/** Onboarding intents a new workspace can pick, with what to recommend next. */
export const ONBOARDING_GOALS = [
  {
    key: "grow_audience",
    label: "Grow my audience",
    recommend: ["Sign-up form templates", "Audience import", "Landing page to collect leads"],
    href: "/app/signup-forms",
  },
  {
    key: "send_sms",
    label: "Send SMS campaigns",
    recommend: ["Set up your sender", "Import contacts", "SMS campaign templates"],
    href: "/app/setup-sms",
  },
  {
    key: "landing_pages",
    label: "Build landing pages",
    recommend: ["Landing page templates", "AI landing page generator", "First page checklist"],
    href: "/app/landing-pages",
  },
  {
    key: "automation",
    label: "Create automation",
    recommend: ["Welcome flow template", "Automation builder", "Trigger from a form"],
    href: "/app/automations",
  },
  {
    key: "collect_leads",
    label: "Collect leads",
    recommend: ["Sign-up forms", "Landing pages", "Follow-up automation"],
    href: "/app/signup-forms",
  },
] as const;

export type OnboardingGoalKey = (typeof ONBOARDING_GOALS)[number]["key"];

/** Drop-off checks. Cause is never asserted — only an area to investigate. */
export const DROPOFF_CHECKS = [
  {
    from: "explorer",
    to: "cta_click",
    label: "Product interest is not turning into clicks",
    investigate: "Messaging and CTA clarity on product pages",
  },
  {
    from: "cta_click",
    to: "signup_completed",
    label: "Clicks are not turning into accounts",
    investigate: "Signup friction — form length, email verification, errors",
  },
  {
    from: "signup_completed",
    to: "activated",
    label: "New accounts are not reaching a first outcome",
    investigate: "Onboarding guidance and time to first value",
  },
  {
    from: "activated",
    to: "paying",
    label: "Activated users are not upgrading",
    investigate: "Pricing presentation and value communication",
  },
] as const;

/** Wording rules every insight and AI answer must follow. */
export const INSIGHT_LANGUAGE = {
  fact: "Data indicates",
  hypothesis: "Possible explanation",
  action: "Consider investigating",
  insufficient: "Not enough data yet to judge this.",
};

export const EXPERIMENT_SAFETY = [
  "Never experiment with sign-in or account security.",
  "Never experiment with payments or checkout security.",
  "Never experiment with privacy settings or consent wording that has legal effect.",
  "Never experiment on core customer data or message delivery.",
  "Safe areas: messaging, layout, CTA copy and placement, content, onboarding presentation.",
];

export const REVIEW_WORKFLOW = [
  {
    cadence: "Weekly",
    items: ["Traffic change", "Signup change", "Activation change", "Biggest funnel drop-off"],
  },
  {
    cadence: "Monthly",
    items: ["Top acquisition channels", "Content performance", "Template performance", "Product adoption", "Retention"],
  },
  {
    cadence: "Quarterly",
    items: ["Growth trend", "Activation trend", "Customer acquisition mix", "Experiment results", "Next priorities"],
  },
];

export const PRIVACY_RULES = [
  "No names, emails, phone numbers or message content are stored in the visitor event log.",
  "Visit identifiers are random, stored only in the browser, and reset when the visit ends.",
  "IP addresses are never stored — only a country, taken from the request edge.",
  "Reporting is aggregate; individual workspaces appear only where an admin already has access.",
];

/** Sub-100 sample sizes make percentages misleading; callers use this to hide rates. */
export function rate(numerator: number, denominator: number, minSample: number) {
  if (denominator < minSample) return null;
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
