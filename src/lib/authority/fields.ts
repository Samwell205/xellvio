/**
 * Field definitions for every authority record type.
 *
 * Keeping these declarative means the admin dashboard renders consistent,
 * fully editable forms for each table without duplicating form code, and the
 * guardrail help text sits next to the field it applies to.
 */
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  COMMUNITY_TYPES,
  DISTRIBUTION_CHANNELS,
  MENTION_LINK_STATES,
  MONITORED_TERMS,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABEL,
  QUALITY_LABEL,
  QUALITY_LABELS,
  RELEVANT_TOPICS,
  REPURPOSE_FORMATS,
  SENTIMENTS,
  STAGES,
  STAGE_LABEL,
  titleCase,
} from "./taxonomy";

export type FieldType = "text" | "url" | "textarea" | "select" | "number" | "date" | "switch" | "list";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Full-width in the two-column form grid. */
  wide?: boolean;
};

const opt = (values: readonly string[], labels?: Record<string, string>) =>
  values.map((v) => ({ value: v, label: labels?.[v] ?? titleCase(v) }));

export const OPPORTUNITY_FIELDS: Field[] = [
  { name: "website_name", label: "Website or publication", type: "text", required: true },
  { name: "website_url", label: "URL", type: "url", placeholder: "https://" },
  {
    name: "website_type",
    label: "Type of site",
    type: "select",
    options: opt(["blog", "publication", "directory", "community", "partner", "podcast", "newsletter", "other"]),
  },
  { name: "topic", label: "Primary topic", type: "select", options: opt(RELEVANT_TOPICS) },
  {
    name: "domain_relevance",
    label: "Why it is relevant to Xellvio",
    type: "textarea",
    wide: true,
    help: "Relevance decides priority here — not backlink counts or domain scores.",
  },
  {
    name: "opportunity_type",
    label: "Opportunity type",
    type: "select",
    required: true,
    options: opt(OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABEL),
  },
  { name: "contact_person", label: "Contact person", type: "text", help: "A named human. Never send unnamed outreach." },
  {
    name: "contact_method",
    label: "Contact method",
    type: "select",
    options: opt(["email", "contact_form", "linkedin", "x", "community", "unknown"]),
  },
  { name: "quality", label: "Quality label", type: "select", options: opt(QUALITY_LABELS, QUALITY_LABEL) },
  { name: "quality_notes", label: "Quality notes", type: "textarea", wide: true },
  { name: "priority_score", label: "Priority score", type: "number", help: "Suggested from the relevance checks. Editable." },
  { name: "stage", label: "Pipeline stage", type: "select", options: opt(STAGES, STAGE_LABEL) },
  {
    name: "target_page",
    label: "Xellvio page this should point to",
    type: "text",
    placeholder: "/sms-marketing",
    help: "Point links at the page that genuinely answers their readers' question.",
  },
  {
    name: "proposed_value",
    label: "What Xellvio offers them",
    type: "textarea",
    wide: true,
    help: "A resource, data, an integration or expertise their audience will actually use.",
  },
  {
    name: "pitch_draft",
    label: "Personalised pitch draft",
    type: "textarea",
    wide: true,
    help: "Name the exact page, say why it helps their readers, disclose you work on Xellvio. You send it yourself.",
  },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const MENTION_FIELDS: Field[] = [
  { name: "source_name", label: "Where it appeared", type: "text", required: true },
  { name: "source_url", label: "URL", type: "url" },
  { name: "term", label: "Monitored term", type: "select", options: opt(MONITORED_TERMS) },
  { name: "link_state", label: "Linked?", type: "select", options: opt(MENTION_LINK_STATES) },
  { name: "sentiment", label: "Sentiment", type: "select", options: opt(SENTIMENTS) },
  { name: "verified", label: "Verified as real", type: "switch", help: "Only record mentions you have opened and read." },
  { name: "relevant", label: "Relevant to Xellvio", type: "switch" },
  {
    name: "suggested_target_page",
    label: "Page to request a link to",
    type: "text",
    placeholder: "/sms-marketing",
    help: "For unlinked mentions: a polite, single request to link where it helps readers.",
  },
  { name: "review_status", label: "Review status", type: "select", options: opt(["new", "in_review", "reviewed", "ignored"]) },
  { name: "found_at", label: "Found on", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const DIRECTORY_FIELDS: Field[] = [
  { name: "platform", label: "Directory or platform", type: "text", required: true },
  { name: "platform_url", label: "Platform URL", type: "url" },
  { name: "listing_url", label: "Our listing URL", type: "url" },
  { name: "category", label: "Category used", type: "text" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: opt(["researching", "eligible", "not_eligible", "submitted", "live", "needs_update", "rejected"]),
  },
  { name: "account_owner", label: "Account owner", type: "text" },
  {
    name: "description_used",
    label: "Description submitted",
    type: "textarea",
    wide: true,
    help: "Use the wording from the brand profile so Xellvio reads identically everywhere.",
  },
  { name: "logo_uploaded", label: "Logo uploaded", type: "switch" },
  { name: "screenshots_uploaded", label: "Screenshots uploaded", type: "switch" },
  { name: "quality", label: "Quality label", type: "select", options: opt(QUALITY_LABELS, QUALITY_LABEL) },
  { name: "last_updated_at", label: "Listing last reviewed", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const ASSET_FIELDS: Field[] = [
  { name: "name", label: "Asset name", type: "text", required: true },
  { name: "asset_type", label: "Asset type", type: "select", options: opt(ASSET_TYPES) },
  { name: "status", label: "Workflow status", type: "select", options: opt(ASSET_STATUSES) },
  { name: "topic", label: "Topic", type: "select", options: opt(RELEVANT_TOPICS) },
  { name: "target_audience", label: "Target audience", type: "text" },
  { name: "problem_solved", label: "Problem it solves", type: "textarea", wide: true },
  { name: "related_product", label: "Related Xellvio product", type: "text", placeholder: "SMS campaigns" },
  { name: "page_path", label: "Page path once published", type: "text", placeholder: "/resources/..." },
  { name: "potential_audience", label: "Who would share it", type: "textarea", wide: true },
  { name: "outreach_angle", label: "Outreach angle", type: "textarea", wide: true },
  { name: "distribution_plan", label: "Distribution plan", type: "textarea", wide: true },
  {
    name: "is_research",
    label: "Original research",
    type: "switch",
    help: "Research must be based on real, permitted data. Never invent figures or surveys.",
  },
  { name: "data_source", label: "Data source", type: "textarea", wide: true, help: "Required for research: state exactly where the data came from." },
  { name: "methodology", label: "Methodology", type: "textarea", wide: true },
  { name: "sample_size", label: "Sample size", type: "text" },
  { name: "date_range", label: "Date range", type: "text" },
  { name: "limitations", label: "Limitations", type: "textarea", wide: true },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

export const DISTRIBUTION_FIELDS: Field[] = [
  { name: "content_piece", label: "Content piece", type: "text", required: true },
  { name: "channel", label: "Channel", type: "select", options: opt(DISTRIBUTION_CHANNELS) },
  { name: "post_format", label: "Format", type: "select", options: opt(REPURPOSE_FORMATS) },
  {
    name: "adapted_copy",
    label: "Copy adapted for this channel",
    type: "textarea",
    wide: true,
    help: "Adapt for the audience — never post the same text everywhere.",
  },
  { name: "status", label: "Status", type: "select", options: opt(["planned", "drafted", "scheduled", "published", "skipped"]) },
  { name: "scheduled_for", label: "Scheduled for", type: "date" },
  { name: "performance_notes", label: "What happened", type: "textarea", wide: true },
];

export const PARTNER_FIELDS: Field[] = [
  { name: "name", label: "Partner name", type: "text", required: true },
  { name: "slug", label: "URL slug", type: "text", required: true, placeholder: "acme" },
  { name: "website_url", label: "Partner website", type: "url" },
  { name: "logo_url", label: "Logo URL", type: "url" },
  {
    name: "relationship",
    label: "Relationship",
    type: "select",
    options: opt(["integration", "agency", "reseller", "technology", "co_marketing"]),
  },
  { name: "integration_app_slug", label: "Marketplace app slug", type: "text", help: "Links the partner page to the real app in the Xellvio marketplace." },
  { name: "short_description", label: "Short description", type: "textarea", wide: true },
  { name: "description", label: "Full description", type: "textarea", wide: true },
  { name: "integration_summary", label: "What the integration does", type: "textarea", wide: true },
  { name: "use_cases", label: "Use cases", type: "list", wide: true, help: "One per line." },
  { name: "benefits", label: "Benefits", type: "list", wide: true, help: "One per line." },
  { name: "related_links", label: "Related Xellvio pages", type: "list", wide: true, help: "One path per line, e.g. /automations" },
  {
    name: "verified",
    label: "Partnership verified",
    type: "switch",
    help: "Only tick when the partnership or integration genuinely exists.",
  },
  {
    name: "published",
    label: "Show on the public partners page",
    type: "switch",
    help: "Publishing requires verification — unverified partners stay private.",
  },
];

export const REFERRAL_FIELDS: Field[] = [
  { name: "source_name", label: "Source", type: "text", required: true },
  {
    name: "source_type",
    label: "Source type",
    type: "select",
    options: opt(["directory", "publication", "partner", "community", "social", "podcast", "other"]),
  },
  { name: "source_url", label: "Source URL", type: "url" },
  { name: "landing_page", label: "Landing page", type: "text", placeholder: "/sms-marketing" },
  { name: "period_start", label: "Period start", type: "date" },
  { name: "period_end", label: "Period end", type: "date" },
  { name: "visitors", label: "Visitors", type: "number" },
  { name: "engaged_visitors", label: "Engaged visitors", type: "number" },
  { name: "product_views", label: "Product page views", type: "number" },
  { name: "signups", label: "Signups", type: "number" },
  { name: "notes", label: "Notes", type: "textarea", wide: true, help: "Record measured figures only — never estimates presented as data." },
];

export const BRAND_FIELDS: Field[] = [
  { name: "brand_name", label: "Brand name", type: "text", required: true },
  { name: "website_url", label: "Official website", type: "url" },
  { name: "tagline", label: "Tagline", type: "text", wide: true },
  { name: "short_description", label: "Short description", type: "textarea", wide: true, help: "Use this exact wording on every external listing." },
  { name: "medium_description", label: "Medium description", type: "textarea", wide: true },
  { name: "long_description", label: "Long description", type: "textarea", wide: true },
  { name: "primary_categories", label: "Categories", type: "list", wide: true, help: "One per line." },
  { name: "key_features", label: "Key features", type: "list", wide: true, help: "One per line." },
  { name: "logo_url", label: "Logo URL", type: "url" },
  { name: "screenshots", label: "Screenshot URLs", type: "list", wide: true, help: "One URL per line." },
  { name: "social_profiles", label: "Official profiles", type: "list", wide: true, help: "One URL per line. Only profiles Xellvio actually owns." },
  { name: "company_info", label: "Company info", type: "textarea", wide: true },
];

/** Community placements are opportunities with type `community`. */
export const COMMUNITY_TOPICS = COMMUNITY_TYPES;
