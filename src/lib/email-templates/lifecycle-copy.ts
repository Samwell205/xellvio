/**
 * Copy map for the generic lifecycle template.
 * tone: which StatusBox tone (if any) fits the message.
 */
export type LifecycleKey =
  | "welcome" | "workspace_reminder" | "audience_reminder" | "contacts_reminder"
  | "campaign_reminder" | "send_reminder" | "first_success"
  | "inactive_3d" | "inactive_7d" | "inactive_14d"
  | "low_credits" | "plan_usage_warning"
  | "feature_discovery_automation" | "feature_announcement" | "upgrade_recommendation";

export type LifecycleEntry = {
  category: string;
  eyebrow: string;
  subject: string;
  heading: string;
  body: string;          // "\n" splits into separate <Text> blocks
  ctaText?: string;
  ctaPath?: string;
  preview: string;
  tone?: "success" | "warn" | "error" | "info";
};

export const LIFECYCLE: Record<LifecycleKey, LifecycleEntry> = {
  welcome: {
    category: "onboarding", eyebrow: "Welcome",
    subject: "Welcome to Xellvio 👋 Let's get your first campaign running",
    heading: "Welcome to Xellvio, {{first_name}} 👋",
    body: "Let's get your first SMS campaign running.\nStart by setting up your workspace, creating an audience, and adding your contacts.",
    ctaText: "Complete Your Setup", ctaPath: "/app/onboarding",
    preview: "Three quick steps to your first SMS campaign.",
  },
  workspace_reminder: {
    category: "onboarding", eyebrow: "Reminder",
    subject: "Your Xellvio workspace is waiting",
    heading: "Finish setting up your workspace",
    body: "Your Xellvio workspace is waiting for you.\nComplete your setup and start building your first SMS campaign.",
    ctaText: "Complete Setup", ctaPath: "/app/onboarding",
    preview: "Pick up your setup where you left off.",
  },
  audience_reminder: {
    category: "onboarding", eyebrow: "Next step",
    subject: "Create your first audience",
    heading: "Create your first audience",
    body: "Your first audience is the foundation of every great SMS campaign.\nCreate one and start organizing your contacts.",
    ctaText: "Create Audience", ctaPath: "/app/lists",
    preview: "Audiences are how you organize who you reach.",
  },
  contacts_reminder: {
    category: "onboarding", eyebrow: "Next step",
    subject: "Add the people you want to reach",
    heading: "Your audience is ready 🎉",
    body: "Now add the people you want to reach.",
    ctaText: "Import Contacts", ctaPath: "/app/audience",
    preview: "Import your contacts to fill your new audience.",
  },
  campaign_reminder: {
    category: "onboarding", eyebrow: "Next step",
    subject: "Turn your contacts into your first campaign",
    heading: "Your contacts are ready",
    body: "Now turn them into your first SMS campaign.",
    ctaText: "Create Campaign", ctaPath: "/app/campaigns/new",
    preview: "Your contacts are in. Time to send.",
  },
  send_reminder: {
    category: "onboarding", eyebrow: "Almost there",
    subject: "Your campaign is almost ready",
    heading: "Your campaign is almost ready",
    body: "Review it and launch when you're ready.",
    ctaText: "Continue Campaign", ctaPath: "/app/campaigns",
    preview: "One review away from your first send.",
  },
  first_success: {
    category: "milestone", eyebrow: "Milestone 🎉",
    subject: "🎉 Your first campaign is live",
    heading: "🎉 Congratulations!",
    body: "You've successfully launched your first campaign with Xellvio.",
    ctaText: "See your report", ctaPath: "/app/campaigns",
    preview: "Your first campaign is live — here's the report.",
    tone: "success",
  },
  inactive_3d: {
    category: "educational", eyebrow: "We're here to help",
    subject: "Need a hand getting started?",
    heading: "Need a hand getting started?",
    body: "Pick up where you left off — your Xellvio workspace is ready.",
    ctaText: "Continue onboarding", ctaPath: "/app",
    preview: "Your workspace is ready when you are.",
  },
  inactive_7d: {
    category: "educational", eyebrow: "Come back",
    subject: "Continue where you left off",
    heading: "We noticed you haven't been back",
    body: "Your next step is waiting in your workspace.",
    ctaText: "Continue Where You Left Off", ctaPath: "/app",
    preview: "Your next step is still waiting.",
  },
  inactive_14d: {
    category: "educational", eyebrow: "Your workspace is ready",
    subject: "Your Xellvio workspace is ready whenever you are",
    heading: "Your Xellvio workspace is ready whenever you are",
    body: "Reach your customers by SMS, automate follow-ups and grow with Xellvio.",
    ctaText: "Return to Xellvio", ctaPath: "/app",
    preview: "SMS, automations and growth — whenever you're ready.",
  },
  low_credits: {
    category: "transactional", eyebrow: "Action needed",
    subject: "Your Xellvio balance is running low",
    heading: "Your balance is running low",
    body: "Top up so your campaigns keep sending without interruption.",
    ctaText: "Top up", ctaPath: "/app/billing",
    preview: "Top up to keep your campaigns sending.",
    tone: "warn",
  },
  plan_usage_warning: {
    category: "transactional", eyebrow: "Heads up",
    subject: "You're getting close to your plan limit",
    heading: "You're getting close to your plan limit",
    body: "Review your usage and pick the plan that fits your sending.",
    ctaText: "View Plans", ctaPath: "/pricing",
    preview: "A quick look at your usage and plan options.",
    tone: "warn",
  },
  feature_discovery_automation: {
    category: "educational", eyebrow: "Did you know?",
    subject: "Ready to save time?",
    heading: "Ready to save time?",
    body: "Automate follow-ups and customer journeys with Xellvio Automations.",
    ctaText: "Explore Automations", ctaPath: "/app/automations",
    preview: "Let automations handle your follow-ups.",
  },
  feature_announcement: {
    category: "product_update", eyebrow: "New in Xellvio",
    subject: "Something new in Xellvio",
    heading: "Something new in Xellvio",
    body: "We've shipped a new feature to help you grow.",
    ctaText: "Take a look", ctaPath: "/app",
    preview: "A new feature just landed in your workspace.",
    tone: "info",
  },
  upgrade_recommendation: {
    category: "promotional", eyebrow: "Save more",
    subject: "Unlock more with Xellvio",
    heading: "Unlock more with Xellvio",
    body: "Based on how much you're sending, a larger credit pack gives you a better rate.",
    ctaText: "View Plans", ctaPath: "/app/billing",
    preview: "A larger credit pack could lower your rate.",
  },
};

export const SITE = "https://www.xellvio.com";
export const absolute = (path: string) => (path.startsWith("http") ? path : SITE + path);
