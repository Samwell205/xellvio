/**
 * Shared vocabulary for the Xellvio authority & distribution engine.
 *
 * This module is the single source of truth for opportunity types, quality
 * labels, pipeline stages, the priority framework and the guardrails that keep
 * authority work legitimate (no bought links, no fake reviews, no mass
 * outreach). Both the admin dashboard and the server functions read from here.
 */

export const OPPORTUNITY_TYPES = [
  "resource_mention",
  "guest_article",
  "product_listing",
  "integration_listing",
  "partnership",
  "template_resource",
  "tool_recommendation",
  "expert_contribution",
  "podcast",
  "interview",
  "digital_pr",
  "community",
  "competitor_mention",
  "link_reclamation",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  resource_mention: "Resource mention",
  guest_article: "Guest article",
  product_listing: "Product listing",
  integration_listing: "Integration listing",
  partnership: "Partnership",
  template_resource: "Template resource",
  tool_recommendation: "Tool recommendation",
  expert_contribution: "Expert contribution",
  podcast: "Podcast",
  interview: "Interview",
  digital_pr: "Digital PR",
  community: "Community",
  competitor_mention: "Comparison / alternatives list",
  link_reclamation: "Link reclamation",
};

/** Dashboard sections. Each maps to one or more opportunity types. */
export const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "backlinks", label: "Backlink opportunities" },
  { id: "mentions", label: "Brand mentions" },
  { id: "directories", label: "Directories" },
  { id: "partnerships", label: "Partnerships & partner pages" },
  { id: "guest", label: "Guest content" },
  { id: "pr", label: "Digital PR" },
  { id: "assets", label: "Linkable assets & research" },
  { id: "distribution", label: "Distribution & repurposing" },
  { id: "community", label: "Communities" },
  { id: "pipeline", label: "Outreach pipeline" },
  { id: "kpis", label: "KPIs & referral traffic" },
  { id: "brand", label: "Brand profile" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export const QUALITY_LABELS = ["high_value", "relevant", "low_priority", "avoid", "unrated"] as const;
export type QualityLabel = (typeof QUALITY_LABELS)[number];
export const QUALITY_LABEL: Record<QualityLabel, string> = {
  high_value: "High value",
  relevant: "Relevant",
  low_priority: "Low priority",
  avoid: "Avoid",
  unrated: "Not evaluated",
};

export const STAGES = [
  "identified",
  "researched",
  "qualified",
  "pitch_ready",
  "contacted",
  "follow_up",
  "responded",
  "link_earned",
  "not_a_fit",
  "archived",
] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  identified: "Opportunity identified",
  researched: "Researched",
  qualified: "Qualified",
  pitch_ready: "Personalised pitch ready",
  contacted: "Contacted",
  follow_up: "Follow-up sent",
  responded: "Response received",
  link_earned: "Link / mention earned",
  not_a_fit: "Not a fit",
  archived: "Archived",
};

/** Stages that mean the conversation is closed — never contact again. */
export const CLOSED_STAGES: Stage[] = ["not_a_fit", "archived"];

export const ASSET_STATUSES = [
  "idea",
  "research",
  "creation",
  "review",
  "published",
  "distribution",
  "promotion",
  "performance_review",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  idea: "Idea",
  research: "Research",
  creation: "Creation",
  review: "Review",
  published: "Published",
  distribution: "Distribution",
  promotion: "Promotion",
  performance_review: "Performance review",
};

export const ASSET_TYPES = [
  "guide",
  "free_tool",
  "calculator",
  "template_library",
  "original_research",
  "benchmark_report",
  "statistics_page",
  "interactive_resource",
  "checklist",
] as const;

export const DISTRIBUTION_CHANNELS = [
  "email_newsletter",
  "linkedin",
  "x",
  "facebook",
  "community",
  "partner_channel",
  "industry_newsletter",
  "founder_network",
  "product_community",
] as const;

/** Repurposing chain: one strong asset, adapted per audience — never copy-pasted. */
export const REPURPOSE_FORMATS = [
  "Blog article",
  "LinkedIn post",
  "Social thread",
  "Short educational post",
  "Email newsletter",
  "Infographic",
  "Video script",
  "Template",
] as const;

export const COMMUNITY_TYPES = [
  "Marketing",
  "SaaS",
  "Ecommerce",
  "Startup",
  "Business",
  "Automation",
] as const;

export const MENTION_LINK_STATES = ["linked", "unlinked", "unknown"] as const;
export const SENTIMENTS = ["positive", "neutral", "negative", "unknown"] as const;
export const MONITORED_TERMS = [
  "Xellvio",
  "Xellvio SMS",
  "Xellvio Automations",
  "Xellvio Landing Pages",
  "Xellvio Sign-up Forms",
] as const;

/** Topics that make a website topically relevant to Xellvio. */
export const RELEVANT_TOPICS = [
  "Marketing",
  "SaaS",
  "Ecommerce",
  "Business growth",
  "Customer engagement",
  "SMS",
  "Email marketing",
  "Automation",
] as const;

/**
 * The six quality checks that must be answered before pursuing anything.
 * Third-party authority metrics are deliberately absent — relevance decides.
 */
export const QUALITY_CHECKS = [
  { key: "topical_relevance", label: "Topical relevance", help: "Is the site about marketing, SaaS, ecommerce, growth, customer engagement, SMS, email or automation?" },
  { key: "audience_relevance", label: "Audience relevance", help: "Would this audience realistically want a platform like Xellvio?" },
  { key: "editorial_quality", label: "Editorial quality", help: "Does the site publish genuine, edited content written for readers?" },
  { key: "traffic_quality", label: "Traffic quality", help: "Does the site appear to have a real, engaged audience?" },
  { key: "link_value", label: "Link value", help: "Would a mention genuinely help their readers?" },
  { key: "low_spam_risk", label: "Low spam risk", help: "Confirm the site does not exist mainly to sell links." },
] as const;
export type QualityCheckKey = (typeof QUALITY_CHECKS)[number]["key"];
export type QualityAnswers = Partial<Record<QualityCheckKey, boolean>>;

/**
 * Suggests a quality label from the answered checks.
 * Any spam-risk failure forces AVOID, regardless of other answers.
 */
export function suggestQuality(answers: QualityAnswers): QualityLabel {
  if (answers.low_spam_risk === false) return "avoid";
  const answered = QUALITY_CHECKS.filter((c) => answers[c.key] !== undefined);
  if (answered.length === 0) return "unrated";
  const passed = answered.filter((c) => answers[c.key] === true).length;
  if (answers.topical_relevance === false && answers.audience_relevance === false) return "avoid";
  if (passed === QUALITY_CHECKS.length) return "high_value";
  if (passed >= 4 && answers.topical_relevance !== false) return "relevant";
  return "low_priority";
}

/**
 * Priority framework: relevance → audience quality → customer potential →
 * editorial quality → long-term value. Never backlink counts or domain metrics.
 */
export function priorityScore(input: {
  quality: QualityLabel;
  answers: QualityAnswers;
  opportunityType: OpportunityType;
  hasTargetPage: boolean;
}): number {
  if (input.quality === "avoid") return 0;
  let score = 0;
  if (input.answers.topical_relevance) score += 25;
  if (input.answers.audience_relevance) score += 20;
  if (input.answers.editorial_quality) score += 15;
  if (input.answers.traffic_quality) score += 10;
  if (input.answers.link_value) score += 10;
  if (input.answers.low_spam_risk) score += 5;
  // Long-term value: relationships outlast one-off placements.
  const longTerm: OpportunityType[] = ["partnership", "integration_listing", "guest_article", "expert_contribution"];
  if (longTerm.includes(input.opportunityType)) score += 10;
  if (input.hasTargetPage) score += 5;
  return Math.min(100, score);
}

/** Outreach rules shown next to every pitch field. */
export const OUTREACH_STANDARDS = {
  do: [
    "Name the specific page or section you are writing about.",
    "Explain why the resource helps their readers, in one sentence.",
    "Be upfront that you work on Xellvio.",
    "Send once, follow up at most once, then stop.",
  ],
  dont: [
    '"Dear Sir/Madam" or any unnamed greeting.',
    '"I love your article" openers.',
    '"Please give me a backlink" requests.',
    "Generic templates sent to many sites at once.",
    "Misleading claims about traffic, awards or customers.",
  ],
} as const;

/** Practices that are never acceptable in this system. */
export const SAFETY_RULES = {
  never: [
    "Buy backlinks or use private blog networks.",
    "Automate mass or unsolicited outreach.",
    "Create fake websites, reviews, testimonials, awards or press mentions.",
    "Submit to bulk or spam directories.",
    "Use keyword-stuffed anchor text or doorway pages.",
    "Publish statistics, surveys or case studies that are not real.",
  ],
  always: [
    "Earn relevance with genuinely useful resources.",
    "Build real partnerships and real integrations.",
    "Publish original insight with a stated data source and method.",
    "Participate in communities before sharing anything.",
    "Keep Xellvio's description consistent everywhere it appears.",
  ],
} as const;

/** Repeatable monthly rhythm rendered on the overview tab. */
export const MONTHLY_WORKFLOW = [
  { week: "Week 1", title: "Review", items: ["New brand mentions", "New opportunities", "Content assets performing well"] },
  { week: "Week 2", title: "Research", items: ["Potential partners", "Relevant publications", "Guest & expert opportunities"] },
  { week: "Week 3", title: "Execute", items: ["Personalised outreach", "Content distribution", "Partnership conversations"] },
  { week: "Week 4", title: "Measure", items: ["New links & mentions", "Referral traffic", "Signups from referrals"] },
] as const;

/** Entity signals that help search and AI systems recognise Xellvio. */
export const GEO_ENTITY_SIGNALS = [
  "Identical brand name, category and description on every external listing.",
  "Official website URL cited the same way everywhere (https://xellvio.com).",
  "Product names used consistently: SMS campaigns, automations, sign-up forms, landing pages, shared inbox.",
  "Real third-party mentions and directory listings rather than manufactured ones.",
  "Original research and expert contributions that cite their data source.",
  "Integration and partner pages that describe only integrations that actually exist.",
] as const;

/** The flywheel, used as the overview narrative. */
export const FLYWHEEL = [
  "Useful content or product",
  "Distribution",
  "Discovery",
  "Brand mention",
  "Relevant backlink",
  "Referral traffic",
  "Organic authority",
  "Higher visibility",
  "More users",
  "More customer stories",
  "More content",
] as const;

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
