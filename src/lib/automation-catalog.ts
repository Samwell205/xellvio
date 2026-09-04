import {
  AlarmClock,
  ArrowRightLeft,
  BadgeCheck,
  Ban,
  Bell,
  Braces,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Clock,
  Contact,
  Filter,
  FlagTriangleRight,
  GitBranch,
  Globe,
  Hash,
  Layers,
  Link2,
  Mail,
  MailOpen,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  Pencil,
  Percent,
  PlusCircle,
  RefreshCcw,
  Send,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Split,
  Tag,
  TagsIcon,
  Target,
  Timer,
  UserPlus,
  UserRoundCog,
  Users,
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
  /** Output handles. Empty array = terminal node. */
  outputs: StepHandle[];
  /** Config keys that must be filled before the flow can go live. */
  required?: string[];
};

const OUT: StepHandle[] = [{ id: "out", label: "" }];

export const STEP_DEFINITIONS: StepDefinition[] = [
  // ---------- TRIGGERS ----------
  { type: "trigger.contact_added", category: "trigger", label: "Contact Added", description: "A new contact enters your audience.", icon: UserPlus, outputs: OUT },
  { type: "trigger.contact_updated", category: "trigger", label: "Contact Updated", description: "A contact's details change.", icon: UserRoundCog, outputs: OUT },
  { type: "trigger.tag_added", category: "trigger", label: "Tag Added", description: "A tag is applied to a contact.", icon: Tag, outputs: OUT, required: ["tag"] },
  { type: "trigger.tag_removed", category: "trigger", label: "Tag Removed", description: "A tag is taken off a contact.", icon: TagsIcon, outputs: OUT, required: ["tag"] },
  { type: "trigger.form_submitted", category: "trigger", label: "Form Submitted", description: "Someone submits a sign-up form.", icon: Contact, outputs: OUT },
  { type: "trigger.email_opened", category: "trigger", label: "Email Opened", description: "A contact opens an email.", icon: MailOpen, outputs: OUT },
  { type: "trigger.email_clicked", category: "trigger", label: "Email Clicked", description: "A contact clicks inside an email.", icon: MousePointerClick, outputs: OUT },
  { type: "trigger.sms_received", category: "trigger", label: "SMS Received", description: "A contact texts you back.", icon: MessageSquare, outputs: OUT },
  { type: "trigger.link_clicked", category: "trigger", label: "Link Clicked", description: "A tracked link gets a click.", icon: Link2, outputs: OUT },
  { type: "trigger.purchase_made", category: "trigger", label: "Purchase Made", description: "A contact completes a purchase.", icon: ShoppingBag, outputs: OUT },
  { type: "trigger.order_created", category: "trigger", label: "Order Created", description: "A new order is created.", icon: ShoppingCart, outputs: OUT },
  { type: "trigger.appointment_booked", category: "trigger", label: "Appointment Booked", description: "A booking is confirmed.", icon: CalendarPlus, outputs: OUT },
  { type: "trigger.appointment_cancelled", category: "trigger", label: "Appointment Cancelled", description: "A booking is cancelled.", icon: CalendarX, outputs: OUT },
  { type: "trigger.pipeline_stage_changed", category: "trigger", label: "Pipeline Stage Changed", description: "A deal moves to another stage.", icon: ArrowRightLeft, outputs: OUT },
  { type: "trigger.webhook_received", category: "trigger", label: "Webhook Received", description: "An outside system calls your webhook.", icon: Webhook, outputs: OUT },
  { type: "trigger.custom_event", category: "trigger", label: "Custom Event", description: "Any event you send us by name.", icon: Braces, outputs: OUT, required: ["event_name"] },
  { type: "trigger.datetime", category: "trigger", label: "Date/Time Trigger", description: "Starts on a date or schedule.", icon: CalendarClock, outputs: OUT, required: ["run_at"] },

  // ---------- ACTIONS ----------
  { type: "action.send_email", category: "action", label: "Send Email", description: "Email the contact.", icon: Mail, outputs: OUT, required: ["subject"] },
  { type: "action.send_sms", category: "action", label: "Send SMS", description: "Text the contact.", icon: MessageSquare, outputs: OUT, required: ["body"] },
  { type: "action.send_whatsapp", category: "action", label: "Send WhatsApp", description: "Message on WhatsApp.", icon: MessageCircle, outputs: OUT, required: ["body"] },
  { type: "action.add_tag", category: "action", label: "Add Tag", description: "Tag the contact.", icon: Tag, outputs: OUT, required: ["tag"] },
  { type: "action.remove_tag", category: "action", label: "Remove Tag", description: "Remove a tag.", icon: TagsIcon, outputs: OUT, required: ["tag"] },
  { type: "action.update_contact", category: "action", label: "Update Contact", description: "Set a field on the contact.", icon: Pencil, outputs: OUT, required: ["field"] },
  { type: "action.create_task", category: "action", label: "Create Task", description: "Add a task for your team.", icon: BadgeCheck, outputs: OUT, required: ["title"] },
  { type: "action.assign_user", category: "action", label: "Assign User", description: "Give ownership to a teammate.", icon: Users, outputs: OUT, required: ["assignee"] },
  { type: "action.move_pipeline_stage", category: "action", label: "Move Pipeline Stage", description: "Move the deal forward.", icon: Layers, outputs: OUT, required: ["stage"] },
  { type: "action.create_opportunity", category: "action", label: "Create Opportunity", description: "Open a new deal.", icon: PlusCircle, outputs: OUT, required: ["title"] },
  { type: "action.update_opportunity", category: "action", label: "Update Opportunity", description: "Change deal details.", icon: RefreshCcw, outputs: OUT, required: ["field"] },
  { type: "action.send_webhook", category: "action", label: "Send Webhook", description: "Post data to a URL.", icon: Webhook, outputs: OUT, required: ["url"] },
  { type: "action.api_request", category: "action", label: "API Request", description: "Call an external API.", icon: Globe, outputs: OUT, required: ["url"] },
  { type: "action.internal_notification", category: "action", label: "Internal Notification", description: "Alert your own team.", icon: Bell, outputs: OUT, required: ["message"] },

  // ---------- LOGIC ----------
  {
    type: "logic.if_else",
    category: "logic",
    label: "If / Else",
    description: "Split on a rule you choose.",
    icon: GitBranch,
    outputs: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    required: ["conditions"],
  },
  {
    type: "logic.condition_split",
    category: "logic",
    label: "Condition Split",
    description: "Match rules, send everyone else the other way.",
    icon: Filter,
    outputs: [
      { id: "match", label: "Match" },
      { id: "other", label: "Everyone else" },
    ],
    required: ["conditions"],
  },
  {
    type: "logic.ab_split",
    category: "logic",
    label: "A/B Split",
    description: "Test two versions against each other.",
    icon: Percent,
    outputs: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  },
  { type: "logic.random_split", category: "logic", label: "Random Split", description: "Spread people across 2–5 paths.", icon: Shuffle, outputs: [] },
  { type: "logic.goal", category: "logic", label: "Goal", description: "Mark the outcome you care about.", icon: Target, outputs: [{ id: "reached", label: "Reached" }, { id: "missed", label: "Not reached" }], required: ["goal"] },
  { type: "logic.exit", category: "logic", label: "Exit Flow", description: "Stop the automation here.", icon: Ban, outputs: [] },

  // ---------- TIMING ----------
  { type: "timing.wait", category: "timing", label: "Wait", description: "Pause for an amount of time.", icon: Timer, outputs: OUT },
  { type: "timing.wait_until", category: "timing", label: "Wait Until", description: "Hold until a date and time.", icon: AlarmClock, outputs: OUT, required: ["until_date"] },
  { type: "timing.schedule", category: "timing", label: "Schedule", description: "Continue on a chosen weekday and time.", icon: Clock, outputs: OUT },
];

export const CATEGORY_META: Record<StepCategory, { label: string; icon: LucideIcon; accent: string; soft: string; text: string }> = {
  trigger: { label: "Trigger", icon: Zap, accent: "border-l-primary", soft: "bg-primary/10", text: "text-primary" },
  action: { label: "Action", icon: Send, accent: "border-l-chart-2", soft: "bg-chart-2/10", text: "text-chart-2" },
  logic: { label: "Logic", icon: Split, accent: "border-l-chart-4", soft: "bg-chart-4/10", text: "text-chart-4" },
  timing: { label: "Timing", icon: Hash, accent: "border-l-chart-5", soft: "bg-chart-5/10", text: "text-chart-5" },
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

export type NodeConfig = Record<string, unknown>;

export function defaultConfig(type: string): NodeConfig {
  switch (type) {
    case "action.send_sms":
    case "action.send_whatsapp":
      return { body: "", from: "" };
    case "action.send_email":
      return { subject: "", from_name: "", from_email: "", reply_to: "", track_opens: true, track_clicks: true, html: "" };
    case "timing.wait":
      return { amount: 2, unit: "days" };
    case "timing.wait_until":
      return { until_date: "", until_time: "09:00", timezone: "UTC" };
    case "timing.schedule":
      return { weekday: "monday", until_time: "09:00", timezone: "UTC" };
    case "logic.if_else":
    case "logic.condition_split":
      return { match: "all", conditions: [{ field: "contact.tags", operator: "is", value: "" }] };
    case "logic.ab_split":
      return { split_a: 50, split_b: 50 };
    case "logic.random_split":
      return { paths: [{ label: "A", percent: 50 }, { label: "B", percent: 50 }] };
    case "trigger.contact_added":
      return { list_id: "", filters: [] };
    default:
      return {};
  }
}

/** Random-split handles are dynamic, driven by config. */
export function outputsFor(type: string, config: NodeConfig): StepHandle[] {
  if (type === "logic.random_split") {
    const paths = Array.isArray(config["paths"]) ? (config["paths"] as { label?: string }[]) : [];
    return paths.map((p, i) => ({ id: `p${i}`, label: p.label || String.fromCharCode(65 + i) }));
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
      return s("tag") ? `Tag: ${s("tag")}` : "";
    case "timing.wait": {
      const n = Number(config["amount"] ?? 0);
      const unit = String(config["unit"] ?? "days");
      if (!n) return "";
      return `${n} ${UNIT_LABEL[unit] ?? unit}${n === 1 ? "" : "s"}`;
    }
    case "timing.wait_until":
      return s("until_date") ? `Until ${s("until_date")} ${s("until_time")}` : "";
    case "timing.schedule":
      return `${capitalise(s("weekday") || "monday")} at ${s("until_time") || "09:00"}`;
    case "logic.if_else":
    case "logic.condition_split": {
      const conds = Array.isArray(config["conditions"]) ? (config["conditions"] as any[]) : [];
      const filled = conds.filter((c) => c?.field && c?.operator);
      if (!filled.length) return "";
      const join = config["match"] === "any" ? " OR " : " AND ";
      return filled.map((c) => `${labelForField(c.field)} ${c.operator} ${c.value ?? ""}`.trim()).join(join);
    }
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
    case "action.create_task":
    case "action.create_opportunity":
      return s("title");
    case "trigger.custom_event":
      return s("event_name");
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
      { value: "contact.status", label: "Contact status" },
      { value: "contact.custom_field", label: "Custom field" },
    ],
  },
  {
    group: "Tags",
    options: [
      { value: "contact.has_tag", label: "Has tag" },
      { value: "contact.not_has_tag", label: "Does not have tag" },
    ],
  },
  {
    group: "Activity",
    options: [
      { value: "activity.email_opened", label: "Email opened" },
      { value: "activity.email_clicked", label: "Email clicked" },
      { value: "activity.sms_received", label: "SMS received" },
      { value: "activity.link_clicked", label: "Link clicked" },
    ],
  },
  {
    group: "Commerce",
    options: [
      { value: "commerce.purchase_count", label: "Purchase count" },
      { value: "commerce.purchase_amount", label: "Purchase amount" },
      { value: "commerce.last_purchase", label: "Last purchase" },
    ],
  },
  {
    group: "Workflow",
    options: [
      { value: "workflow.in_flow", label: "In flow" },
      { value: "workflow.completed_flow", label: "Completed flow" },
      { value: "workflow.exited_flow", label: "Exited flow" },
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
  { value: ">=", label: "Greater than or equal" },
  { value: "<=", label: "Less than or equal" },
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
  "{{contact.email}}",
  "{{contact.phone}}",
  "{{company.name}}",
];

// ---------- SMS counting ----------
export function smsSegments(body: string): number {
  if (!body) return 0;
  const unicode = /[^\u0000-\u007F]/.test(body);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return body.length <= single ? 1 : Math.ceil(body.length / multi);
}
