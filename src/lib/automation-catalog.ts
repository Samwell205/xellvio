import {
  AlarmClock,
  Ban,
  Bell,
  Braces,
  Cake,
  CalendarClock,
  CalendarHeart,
  Clock,
  Contact,
  Filter,
  FlagTriangleRight,
  GitBranch,
  Hash,
  Link2,
  ListMinus,
  ListPlus,
  MessageCircleReply,
  MessageSquare,
  MessageSquareDashed,
  MousePointerClick,
  Pencil,
  Percent,
  RefreshCcw,
  Repeat,
  Send,
  ShieldCheck,
  Shuffle,
  Split,
  Tag,
  TagsIcon,
  Target,
  Timer,
  TriangleAlert,
  UserMinus,
  UserPlus,
  UserRoundCog,
  Webhook,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StepCategory = "trigger" | "action" | "logic" | "timing";

export type StepHandle = { id: string; label: string };

export type StepDefinition = {
  type: string;
  category: StepCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Output handles. Empty array = terminal node (nothing can follow it). */
  outputs: StepHandle[];
  /** Config keys that must be filled before the flow can go live. */
  required?: string[];
  /** Hidden from the library but still rendered when saved automations use it. */
  deprecated?: boolean;
  /** Extra search words for the library. */
  keywords?: string;
};

const OUT: StepHandle[] = [{ id: "out", label: "" }];
const YES_NO: StepHandle[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const STEP_DEFINITIONS: StepDefinition[] = [
  // ---------- TRIGGERS: contact lifecycle ----------
  { type: "trigger.contact_created", category: "trigger", label: "Contact Created", description: "Someone new is added to your audience.", icon: UserPlus, outputs: OUT, keywords: "new contact subscriber" },
  { type: "trigger.contact_added", category: "trigger", label: "Contact Added to List", description: "A contact joins a list you choose.", icon: ListPlus, outputs: OUT, keywords: "list join" },
  { type: "trigger.contact_removed_from_list", category: "trigger", label: "Contact Removed from List", description: "A contact leaves a list.", icon: ListMinus, outputs: OUT },
  { type: "trigger.contact_updated", category: "trigger", label: "Contact Updated", description: "A contact's details change.", icon: UserRoundCog, outputs: OUT },
  { type: "trigger.tag_added", category: "trigger", label: "Tag Added", description: "A tag is applied to a contact.", icon: Tag, outputs: OUT, required: ["tag"] },
  { type: "trigger.tag_removed", category: "trigger", label: "Tag Removed", description: "A tag is taken off a contact.", icon: TagsIcon, outputs: OUT, required: ["tag"] },
  { type: "trigger.form_submitted", category: "trigger", label: "Form Submitted", description: "Someone submits one of your sign-up forms.", icon: Contact, outputs: OUT, keywords: "signup form landing page" },

  // ---------- TRIGGERS: SMS ----------
  { type: "trigger.sms_received", category: "trigger", label: "SMS Received", description: "A contact texts you back.", icon: MessageSquare, outputs: OUT, keywords: "reply inbound two-way" },
  { type: "trigger.keyword_received", category: "trigger", label: "Keyword Received", description: "A contact texts a keyword such as JOIN.", icon: Hash, outputs: OUT, required: ["keyword"], keywords: "join yes info sale help" },
  { type: "trigger.link_clicked", category: "trigger", label: "Link Clicked", description: "A contact clicks a tracked link you sent.", icon: Link2, outputs: OUT, keywords: "shortlink click" },
  { type: "trigger.sms_delivered", category: "trigger", label: "SMS Delivered", description: "A message you sent reaches the handset.", icon: MessageSquareDashed, outputs: OUT },
  { type: "trigger.sms_failed", category: "trigger", label: "SMS Failed", description: "A message you sent could not be delivered.", icon: TriangleAlert, outputs: OUT },
  { type: "trigger.opted_out", category: "trigger", label: "Contact Opted Out", description: "A contact replies STOP or unsubscribes.", icon: Ban, outputs: OUT, keywords: "stop unsubscribe suppression" },

  // ---------- TRIGGERS: date & schedule ----------
  { type: "trigger.datetime", category: "trigger", label: "Specific Date & Time", description: "Starts once on a date and time you pick.", icon: CalendarClock, outputs: OUT, required: ["run_at"] },
  { type: "trigger.recurring", category: "trigger", label: "Recurring Schedule", description: "Runs on a repeating schedule.", icon: Repeat, outputs: OUT, required: ["weekday"] },
  { type: "trigger.birthday", category: "trigger", label: "Birthday", description: "Runs on a contact's birthday.", icon: Cake, outputs: OUT },
  { type: "trigger.anniversary", category: "trigger", label: "Anniversary", description: "Runs on a contact's anniversary date.", icon: CalendarHeart, outputs: OUT },
  { type: "trigger.date_field", category: "trigger", label: "Custom Date Field", description: "Runs relative to a date saved on the contact.", icon: CalendarClock, outputs: OUT, required: ["field"] },

  // ---------- TRIGGERS: webhook / API ----------
  { type: "trigger.webhook_received", category: "trigger", label: "Webhook Received", description: "An outside system calls your automation webhook.", icon: Webhook, outputs: OUT, keywords: "api external" },
  { type: "trigger.custom_event", category: "trigger", label: "Custom Event", description: "Any event you send us by name.", icon: Braces, outputs: OUT, required: ["event_name"] },

  // ---------- ACTIONS ----------
  { type: "action.send_sms", category: "action", label: "Send SMS", description: "Text the contact with personalisation.", icon: MessageSquare, outputs: OUT, required: ["body"], keywords: "message mms text" },
  { type: "action.add_tag", category: "action", label: "Add Tag", description: "Tag the contact.", icon: Tag, outputs: OUT, required: ["tag"] },
  { type: "action.remove_tag", category: "action", label: "Remove Tag", description: "Remove a tag from the contact.", icon: TagsIcon, outputs: OUT, required: ["tag"] },
  { type: "action.update_contact", category: "action", label: "Update Contact", description: "Set a field on the contact record.", icon: Pencil, outputs: OUT, required: ["field"] },
  { type: "action.add_to_list", category: "action", label: "Add to List", description: "Put the contact on one of your lists.", icon: ListPlus, outputs: OUT, required: ["list_id"] },
  { type: "action.remove_from_list", category: "action", label: "Remove from List", description: "Take the contact off a list.", icon: ListMinus, outputs: OUT, required: ["list_id"] },
  { type: "action.opt_out", category: "action", label: "Unsubscribe Contact", description: "Mark the contact opted out of marketing.", icon: UserMinus, outputs: OUT },
  { type: "action.send_webhook", category: "action", label: "Send Webhook", description: "Post contact data to a URL.", icon: Webhook, outputs: OUT, required: ["url"] },
  { type: "action.internal_notification", category: "action", label: "Notify My Team", description: "Alert your own team by email.", icon: Bell, outputs: OUT, required: ["message"] },

  // ---------- LOGIC ----------
  {
    type: "logic.if_else",
    category: "logic",
    label: "Condition Split",
    description: "Send people down Yes or No based on your rules.",
    icon: GitBranch,
    outputs: YES_NO,
    required: ["conditions"],
    keywords: "if else branch rule",
  },
  {
    type: "logic.check_consent",
    category: "logic",
    label: "Check SMS Consent",
    description: "Only continue when the contact may be messaged.",
    icon: ShieldCheck,
    outputs: YES_NO,
    keywords: "compliance opt-in consent tcpa",
  },
  { type: "logic.has_tag", category: "logic", label: "Has Tag?", description: "Branch on whether a tag is present.", icon: Tag, outputs: YES_NO, required: ["tag"] },
  { type: "logic.in_list", category: "logic", label: "Is in List?", description: "Branch on list membership.", icon: ListPlus, outputs: YES_NO, required: ["list_id"] },
  { type: "logic.clicked_link", category: "logic", label: "Clicked a Link?", description: "Branch on tracked-link engagement.", icon: MousePointerClick, outputs: YES_NO, keywords: "engagement click" },
  { type: "logic.replied", category: "logic", label: "Replied to SMS?", description: "Branch on whether the contact texted back.", icon: MessageCircleReply, outputs: YES_NO },
  {
    type: "logic.ab_split",
    category: "logic",
    label: "A/B Split",
    description: "Test two message versions against each other.",
    icon: Percent,
    outputs: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  },
  { type: "logic.random_split", category: "logic", label: "Random Split", description: "Spread people across 2–5 paths.", icon: Shuffle, outputs: [] },
  {
    type: "logic.goal",
    category: "logic",
    label: "Goal",
    description: "Mark the outcome you care about.",
    icon: Target,
    outputs: [
      { id: "reached", label: "Reached" },
      { id: "missed", label: "Not reached" },
    ],
    required: ["goal"],
  },
  { type: "logic.exit", category: "logic", label: "Exit Automation", description: "Remove the contact from this automation.", icon: Ban, outputs: [], keywords: "stop end" },

  // ---------- TIMING ----------
  { type: "timing.wait", category: "timing", label: "Wait", description: "Pause for an amount of time.", icon: Timer, outputs: OUT },
  { type: "timing.wait_until", category: "timing", label: "Wait Until", description: "Hold until a date and time.", icon: AlarmClock, outputs: OUT, required: ["until_date"] },
  { type: "timing.schedule", category: "timing", label: "Wait for Weekday", description: "Continue on a chosen weekday and time.", icon: Clock, outputs: OUT },
  {
    type: "timing.wait_for_reply",
    category: "timing",
    label: "Wait for Response",
    description: "Hold for a reply, then branch on what they said.",
    icon: MessageCircleReply,
    outputs: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "timeout", label: "No response" },
    ],
    keywords: "two-way conversation reply keyword",
  },

  // ---------- LEGACY (hidden, kept so existing automations still open) ----------
  { type: "action.send_email", category: "action", label: "Send Email", description: "Legacy step.", icon: Send, outputs: OUT, deprecated: true },
  { type: "action.send_whatsapp", category: "action", label: "Send WhatsApp", description: "Legacy step.", icon: MessageSquare, outputs: OUT, deprecated: true },
  { type: "action.create_task", category: "action", label: "Create Task", description: "Legacy step.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "action.assign_user", category: "action", label: "Assign User", description: "Legacy step.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "action.move_pipeline_stage", category: "action", label: "Move Pipeline Stage", description: "Legacy step.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "action.create_opportunity", category: "action", label: "Create Opportunity", description: "Legacy step.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "action.update_opportunity", category: "action", label: "Update Opportunity", description: "Legacy step.", icon: RefreshCcw, outputs: OUT, deprecated: true },
  { type: "action.api_request", category: "action", label: "API Request", description: "Legacy step — use Send Webhook.", icon: Webhook, outputs: OUT, deprecated: true },
  { type: "logic.condition_split", category: "logic", label: "Match Split", description: "Legacy step — use Condition Split.", icon: Filter, outputs: [{ id: "match", label: "Match" }, { id: "other", label: "Everyone else" }], required: ["conditions"], deprecated: true },
  { type: "trigger.email_opened", category: "trigger", label: "Email Opened", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "trigger.email_clicked", category: "trigger", label: "Email Clicked", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "trigger.purchase_made", category: "trigger", label: "Purchase Made", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "trigger.order_created", category: "trigger", label: "Order Created", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "trigger.appointment_booked", category: "trigger", label: "Appointment Booked", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "trigger.appointment_cancelled", category: "trigger", label: "Appointment Cancelled", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
  { type: "trigger.pipeline_stage_changed", category: "trigger", label: "Pipeline Stage Changed", description: "Legacy trigger.", icon: FlagTriangleRight, outputs: OUT, deprecated: true },
];

/** Everything the library and pickers should offer. */
export const LIBRARY_STEPS = STEP_DEFINITIONS.filter((d) => !d.deprecated);

export const CATEGORY_META: Record<StepCategory, { label: string; icon: LucideIcon; accent: string; soft: string; text: string }> = {
  trigger: { label: "Trigger", icon: Zap, accent: "border-l-primary", soft: "bg-primary/10", text: "text-primary" },
  action: { label: "Action", icon: Send, accent: "border-l-chart-2", soft: "bg-chart-2/10", text: "text-chart-2" },
  logic: { label: "Condition", icon: Split, accent: "border-l-chart-4", soft: "bg-chart-4/10", text: "text-chart-4" },
  timing: { label: "Timing", icon: Timer, accent: "border-l-chart-5", soft: "bg-chart-5/10", text: "text-chart-5" },
};

export const CATEGORY_TITLES: Record<StepCategory, string> = {
  trigger: "Triggers",
  action: "Actions",
  logic: "Conditions & splits",
  timing: "Timing & flow control",
};

export const CATEGORY_ORDER: StepCategory[] = ["trigger", "action", "logic", "timing"];

const BY_TYPE = new Map(STEP_DEFINITIONS.map((d) => [d.type, d]));

export function stepDef(type: string): StepDefinition {
  return (
    BY_TYPE.get(type) ?? {
      type,
      category: "action",
      label: type,
      description: "Unknown step",
      icon: FlagTriangleRight,
      outputs: OUT,
    }
  );
}

export function isTriggerType(type: string): boolean {
  return type.startsWith("trigger.");
}

export type NodeConfig = Record<string, unknown>;

export function defaultConfig(type: string): NodeConfig {
  switch (type) {
    case "action.send_sms":
    case "action.send_whatsapp":
      return { body: "", from: "", shorten_links: true };
    case "action.send_email":
      return { subject: "", html: "" };
    case "timing.wait":
      return { amount: 1, unit: "days" };
    case "timing.wait_until":
      return { until_date: "", until_time: "09:00", timezone: "UTC" };
    case "timing.schedule":
      return { weekday: "monday", until_time: "09:00", timezone: "UTC" };
    case "timing.wait_for_reply":
      return { amount: 24, unit: "hours", expect: "any", keywords_yes: "YES", keywords_no: "NO" };
    case "logic.if_else":
    case "logic.condition_split":
      return { match: "all", conditions: [{ field: "contact.sms_consent", operator: "is", value: "granted" }] };
    case "logic.check_consent":
      return { require_consent: true, skip_opted_out: true };
    case "logic.clicked_link":
      return { window_days: 3 };
    case "logic.replied":
      return { window_days: 3 };
    case "logic.ab_split":
      return { split_a: 50, split_b: 50 };
    case "logic.random_split":
      return { paths: [{ label: "A", percent: 50 }, { label: "B", percent: 50 }] };
    case "trigger.contact_added":
    case "trigger.contact_removed_from_list":
      return { list_id: "", filters: [] };
    case "trigger.keyword_received":
      return { keyword: "JOIN", match_type: "exact" };
    case "trigger.recurring":
      return { weekday: "monday", run_time: "09:00", timezone: "UTC" };
    case "trigger.birthday":
    case "trigger.anniversary":
      return { run_time: "10:00", offset_days: 0, timezone: "UTC" };
    case "action.send_webhook":
      return { url: "", method: "POST", body_json: '{\n  "phone": "{{contact.phone}}",\n  "first_name": "{{contact.first_name}}"\n}' };
    default:
      return {};
  }
}

/** Random-split handles are dynamic, driven by config. */
export function outputsFor(type: string, config: NodeConfig): StepHandle[] {
  if (type === "logic.random_split") {
    const paths = Array.isArray(config["paths"]) ? (config["paths"] as { label?: string; percent?: number }[]) : [];
    return paths.map((p, i) => ({ id: `p${i}`, label: `${p.label || String.fromCharCode(65 + i)} · ${p.percent ?? 0}%` }));
  }
  if (type === "logic.ab_split") {
    const a = Number(config["split_a"] ?? 50);
    const b = Number(config["split_b"] ?? 50);
    return [
      { id: "a", label: `A · ${a}%` },
      { id: "b", label: `B · ${b}%` },
    ];
  }
  return stepDef(type).outputs;
}

const UNIT_LABEL: Record<string, string> = { minutes: "minute", hours: "hour", days: "day", weeks: "week" };

function durationLabel(config: NodeConfig): string {
  const n = Number(config["amount"] ?? 0);
  const unit = String(config["unit"] ?? "days");
  if (!n) return "";
  return `${n} ${UNIT_LABEL[unit] ?? unit}${n === 1 ? "" : "s"}`;
}

/** Short human line shown on the node card. */
export function configSummary(type: string, config: NodeConfig): string {
  const s = (k: string) => String(config[k] ?? "").trim();
  switch (type) {
    case "action.send_sms":
    case "action.send_whatsapp":
      return s("body") ? truncate(s("body"), 70) : "";
    case "action.send_email":
      return s("subject");
    case "action.add_tag":
    case "action.remove_tag":
    case "trigger.tag_added":
    case "trigger.tag_removed":
    case "logic.has_tag":
      return s("tag") ? `Tag: ${s("tag")}` : "";
    case "trigger.keyword_received":
      return s("keyword") ? `“${s("keyword")}” · ${String(config["match_type"] ?? "exact")} match` : "";
    case "logic.check_consent":
      return "Continues only with SMS consent";
    case "logic.clicked_link":
      return `Clicked in last ${config["window_days"] ?? 3} day${Number(config["window_days"] ?? 3) === 1 ? "" : "s"}`;
    case "logic.replied":
      return `Replied in last ${config["window_days"] ?? 3} day${Number(config["window_days"] ?? 3) === 1 ? "" : "s"}`;
    case "timing.wait":
      return durationLabel(config);
    case "timing.wait_for_reply": {
      const d = durationLabel(config);
      const expect = String(config["expect"] ?? "any");
      return `${d || "24 hours"} · ${expect === "any" ? "any reply" : `keywords ${s("keywords_yes") || "YES"}/${s("keywords_no") || "NO"}`}`;
    }
    case "timing.wait_until":
      return s("until_date") ? `Until ${s("until_date")} ${s("until_time")}` : "";
    case "timing.schedule":
    case "trigger.recurring":
      return `${capitalise(s("weekday") || "monday")} at ${s("until_time") || s("run_time") || "09:00"}`;
    case "trigger.birthday":
    case "trigger.anniversary":
      return `At ${s("run_time") || "10:00"}`;
    case "logic.if_else":
    case "logic.condition_split": {
      const conds = Array.isArray(config["conditions"]) ? (config["conditions"] as any[]) : [];
      const filled = conds.filter((c) => c?.field && c?.operator);
      if (!filled.length) return "";
      const join = config["match"] === "any" ? " OR " : " AND ";
      return filled.map((c) => `${labelForField(c.field)} ${c.operator} ${c.value ?? ""}`.trim()).join(join);
    }
    case "logic.in_list":
    case "action.add_to_list":
    case "action.remove_from_list":
      return s("list_name") || (s("list_id") ? "List selected" : "");
    case "logic.ab_split":
      return `${config["split_a"] ?? 50}% / ${config["split_b"] ?? 50}%`;
    case "logic.random_split": {
      const paths = Array.isArray(config["paths"]) ? (config["paths"] as any[]) : [];
      return paths.map((p) => `${p.label}: ${p.percent}%`).join(" · ");
    }
    case "logic.goal":
      return s("goal");
    case "action.send_webhook":
    case "action.api_request":
      return s("url");
    case "action.internal_notification":
      return truncate(s("message"), 60);
    case "action.update_contact":
      return s("field") ? `${s("field")} → ${s("value")}` : "";
    case "trigger.custom_event":
      return s("event_name");
    case "trigger.form_submitted":
      return s("form_name") || (s("form_id") ? "Specific form" : "Any sign-up form");
    default:
      return "";
  }
}

function truncate(v: string, n: number) {
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}
function capitalise(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// ---------- condition builder vocabulary ----------

export const CONDITION_FIELDS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: "Contact",
    options: [
      { value: "contact.first_name", label: "First name" },
      { value: "contact.last_name", label: "Last name" },
      { value: "contact.email", label: "Email" },
      { value: "contact.phone", label: "Phone" },
      { value: "contact.country", label: "Country" },
      { value: "contact.custom_field", label: "Custom field" },
    ],
  },
  {
    group: "Lists & tags",
    options: [
      { value: "contact.in_list", label: "Is in list" },
      { value: "contact.not_in_list", label: "Is not in list" },
      { value: "contact.has_tag", label: "Has tag" },
      { value: "contact.not_has_tag", label: "Does not have tag" },
    ],
  },
  {
    group: "SMS consent",
    options: [
      { value: "contact.sms_consent", label: "SMS consent" },
      { value: "contact.opted_out", label: "Opted out" },
      { value: "contact.suppressed", label: "On suppression list" },
    ],
  },
  {
    group: "Engagement",
    options: [
      { value: "activity.clicked_link", label: "Clicked a link" },
      { value: "activity.replied", label: "Replied to SMS" },
      { value: "activity.sms_delivered", label: "SMS delivered" },
      { value: "activity.sms_failed", label: "SMS failed" },
      { value: "activity.messages_received", label: "Number of replies received" },
      { value: "activity.last_message_at", label: "Last message date" },
      { value: "activity.last_click_at", label: "Last link click" },
    ],
  },
  {
    group: "Dates",
    options: [
      { value: "contact.birthday", label: "Birthday" },
      { value: "contact.anniversary", label: "Anniversary" },
      { value: "contact.custom_date", label: "Custom date field" },
    ],
  },
];

export const CONDITION_OPERATORS = [
  { value: "is", label: "Is" },
  { value: "is not", label: "Is not" },
  { value: "contains", label: "Contains" },
  { value: "does not contain", label: "Does not contain" },
  { value: "starts with", label: "Starts with" },
  { value: "ends with", label: "Ends with" },
  { value: ">", label: "Greater than" },
  { value: "<", label: "Less than" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "exists", label: "Exists" },
  { value: "does not exist", label: "Does not exist" },
] as const;

export function labelForField(value: string): string {
  for (const g of CONDITION_FIELDS) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
}

export const MERGE_TAGS = [
  "{{contact.first_name}}",
  "{{contact.last_name}}",
  "{{contact.full_name}}",
  "{{contact.phone}}",
  "{{contact.email}}",
  "{{contact.country}}",
  "{{system.date}}",
  "{{system.time}}",
];

// ---------- SMS counting ----------
export function smsSegments(body: string): number {
  if (!body) return 0;
  const unicode = /[^\u0000-\u007F]/.test(body);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return body.length <= single ? 1 : Math.ceil(body.length / multi);
}
