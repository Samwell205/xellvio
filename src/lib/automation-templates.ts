import { defaultConfig, type NodeConfig } from "./automation-catalog";

export type TemplateNode = {
  key: string;
  type: string;
  position: { x: number; y: number };
  config?: NodeConfig;
};
export type TemplateEdge = { source: string; target: string; sourceHandle?: string };

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  tag: "Welcome" | "Keywords" | "Re-engagement" | "Dates" | "Sales" | "Compliance";
  nodes: TemplateNode[];
  edges: TemplateEdge[];
};

const X = 0;
const step = (i: number) => ({ x: X, y: i * 190 });
const left = (i: number) => ({ x: -320, y: i * 190 });
const right = (i: number) => ({ x: 320, y: i * 190 });

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "welcome-series",
    name: "Welcome series",
    description: "Greet new contacts, wait two days, then send a first-purchase offer.",
    tag: "Welcome",
    nodes: [
      { key: "t", type: "trigger.contact_added", position: step(0) },
      { key: "c", type: "logic.check_consent", position: step(1) },
      { key: "s1", type: "action.send_sms", position: left(2), config: { body: "Hi {{contact.first_name}}, welcome to the club! Reply STOP to opt out.", shorten_links: true } },
      { key: "w", type: "timing.wait", position: left(3), config: { amount: 2, unit: "days" } },
      { key: "s2", type: "action.send_sms", position: left(4), config: { body: "{{contact.first_name}}, here's 10% off your first order: ", shorten_links: true } },
      { key: "x", type: "logic.exit", position: right(2) },
    ],
    edges: [
      { source: "t", target: "c" },
      { source: "c", target: "s1", sourceHandle: "yes" },
      { source: "c", target: "x", sourceHandle: "no" },
      { source: "s1", target: "w" },
      { source: "w", target: "s2" },
    ],
  },
  {
    id: "keyword-optin",
    name: "Keyword opt-in (text JOIN)",
    description: "Someone texts JOIN, gets confirmation, is tagged and added to a list.",
    tag: "Keywords",
    nodes: [
      { key: "t", type: "trigger.keyword_received", position: step(0), config: { keyword: "JOIN", match_type: "exact" } },
      { key: "s", type: "action.send_sms", position: step(1), config: { body: "You're in! Expect 2-4 texts a month. Reply STOP to opt out.", shorten_links: true } },
      { key: "tag", type: "action.add_tag", position: step(2), config: { tag: "sms-subscriber" } },
      { key: "l", type: "action.add_to_list", position: step(3) },
    ],
    edges: [
      { source: "t", target: "s" },
      { source: "s", target: "tag" },
      { source: "tag", target: "l" },
    ],
  },
  {
    id: "signup-form-followup",
    name: "Sign-up form follow-up",
    description: "Thank people who complete your sign-up form and follow up a day later.",
    tag: "Welcome",
    nodes: [
      { key: "t", type: "trigger.form_submitted", position: step(0) },
      { key: "s1", type: "action.send_sms", position: step(1), config: { body: "Thanks for signing up, {{contact.first_name}}! Here's your welcome link: ", shorten_links: true } },
      { key: "w", type: "timing.wait", position: step(2), config: { amount: 1, unit: "days" } },
      { key: "cl", type: "logic.clicked_link", position: step(3), config: { window_days: 1 } },
      { key: "s2", type: "action.send_sms", position: right(4), config: { body: "Still interested? Your welcome offer expires tonight: ", shorten_links: true } },
      { key: "tag", type: "action.add_tag", position: left(4), config: { tag: "engaged" } },
    ],
    edges: [
      { source: "t", target: "s1" },
      { source: "s1", target: "w" },
      { source: "w", target: "cl" },
      { source: "cl", target: "tag", sourceHandle: "yes" },
      { source: "cl", target: "s2", sourceHandle: "no" },
    ],
  },
  {
    id: "two-way-question",
    name: "Ask a question and branch on the reply",
    description: "Send a yes/no question and take different paths based on what they text back.",
    tag: "Keywords",
    nodes: [
      { key: "t", type: "trigger.contact_added", position: step(0) },
      { key: "s", type: "action.send_sms", position: step(1), config: { body: "Would you like our weekly deals? Reply YES or NO.", shorten_links: false } },
      { key: "w", type: "timing.wait_for_reply", position: step(2), config: { amount: 24, unit: "hours", expect: "keywords", keywords_yes: "YES", keywords_no: "NO" } },
      { key: "yes", type: "action.add_tag", position: left(3), config: { tag: "weekly-deals" } },
      { key: "no", type: "action.add_tag", position: step(3), config: { tag: "no-weekly-deals" } },
      { key: "rem", type: "action.send_sms", position: right(3), config: { body: "Last chance — reply YES for weekly deals.", shorten_links: false } },
    ],
    edges: [
      { source: "t", target: "s" },
      { source: "s", target: "w" },
      { source: "w", target: "yes", sourceHandle: "yes" },
      { source: "w", target: "no", sourceHandle: "no" },
      { source: "w", target: "rem", sourceHandle: "timeout" },
    ],
  },
  {
    id: "abandoned-interest",
    name: "Link-click follow-up",
    description: "Follow up automatically the moment someone clicks a link you texted.",
    tag: "Sales",
    nodes: [
      { key: "t", type: "trigger.link_clicked", position: step(0) },
      { key: "w", type: "timing.wait", position: step(1), config: { amount: 30, unit: "minutes" } },
      { key: "s", type: "action.send_sms", position: step(2), config: { body: "Saw you checking us out, {{contact.first_name}} — need a hand? Just reply here.", shorten_links: true } },
      { key: "tag", type: "action.add_tag", position: step(3), config: { tag: "hot-lead" } },
    ],
    edges: [
      { source: "t", target: "w" },
      { source: "w", target: "s" },
      { source: "s", target: "tag" },
    ],
  },
  {
    id: "winback",
    name: "Win back quiet contacts",
    description: "Reach people who have not replied lately, then split-test two offers.",
    tag: "Re-engagement",
    nodes: [
      { key: "t", type: "trigger.recurring", position: step(0), config: { weekday: "tuesday", run_time: "10:00", timezone: "UTC" } },
      { key: "cond", type: "logic.replied", position: step(1), config: { window_days: 30 } },
      { key: "ab", type: "logic.ab_split", position: right(2), config: { split_a: 50, split_b: 50 } },
      { key: "a", type: "action.send_sms", position: step(3), config: { body: "We miss you! 15% off today only: ", shorten_links: true } },
      { key: "b", type: "action.send_sms", position: right(3), config: { body: "Come back and get free delivery on your next order: ", shorten_links: true } },
      { key: "x", type: "logic.exit", position: left(2) },
    ],
    edges: [
      { source: "t", target: "cond" },
      { source: "cond", target: "x", sourceHandle: "yes" },
      { source: "cond", target: "ab", sourceHandle: "no" },
      { source: "ab", target: "a", sourceHandle: "a" },
      { source: "ab", target: "b", sourceHandle: "b" },
    ],
  },
  {
    id: "birthday",
    name: "Birthday treat",
    description: "Send a birthday message with a personal discount code.",
    tag: "Dates",
    nodes: [
      { key: "t", type: "trigger.birthday", position: step(0), config: { run_time: "09:00", offset_days: 0, timezone: "UTC" } },
      { key: "c", type: "logic.check_consent", position: step(1) },
      { key: "s", type: "action.send_sms", position: step(2), config: { body: "Happy birthday {{contact.first_name}}! Here's 20% off from all of us 🎉 ", shorten_links: true } },
    ],
    edges: [
      { source: "t", target: "c" },
      { source: "c", target: "s", sourceHandle: "yes" },
    ],
  },
  {
    id: "optout-cleanup",
    name: "Opt-out clean-up",
    description: "When somebody opts out, tag them and take them off your marketing lists.",
    tag: "Compliance",
    nodes: [
      { key: "t", type: "trigger.opted_out", position: step(0) },
      { key: "tag", type: "action.add_tag", position: step(1), config: { tag: "opted-out" } },
      { key: "rl", type: "action.remove_from_list", position: step(2) },
      { key: "n", type: "action.internal_notification", position: step(3), config: { message: "A contact just opted out of SMS." } },
    ],
    edges: [
      { source: "t", target: "tag" },
      { source: "tag", target: "rl" },
      { source: "rl", target: "n" },
    ],
  },
  {
    id: "failed-delivery",
    name: "Failed delivery clean-up",
    description: "Tag contacts whose messages bounce so you stop paying to text dead numbers.",
    tag: "Compliance",
    nodes: [
      { key: "t", type: "trigger.sms_failed", position: step(0) },
      { key: "tag", type: "action.add_tag", position: step(1), config: { tag: "undeliverable" } },
      { key: "rl", type: "action.remove_from_list", position: step(2) },
    ],
    edges: [
      { source: "t", target: "tag" },
      { source: "tag", target: "rl" },
    ],
  },
  {
    id: "vip-nurture",
    name: "VIP nurture",
    description: "Tag someone VIP and run a three-message sequence over a week.",
    tag: "Sales",
    nodes: [
      { key: "t", type: "trigger.tag_added", position: step(0), config: { tag: "vip" } },
      { key: "s1", type: "action.send_sms", position: step(1), config: { body: "You're officially VIP, {{contact.first_name}} — early access starts now: ", shorten_links: true } },
      { key: "w1", type: "timing.wait", position: step(2), config: { amount: 3, unit: "days" } },
      { key: "s2", type: "action.send_sms", position: step(3), config: { body: "VIP pick of the week, just for you: ", shorten_links: true } },
      { key: "w2", type: "timing.wait", position: step(4), config: { amount: 4, unit: "days" } },
      { key: "s3", type: "action.send_sms", position: step(5), config: { body: "Your VIP perk ends Sunday — grab it here: ", shorten_links: true } },
    ],
    edges: [
      { source: "t", target: "s1" },
      { source: "s1", target: "w1" },
      { source: "w1", target: "s2" },
      { source: "s2", target: "w2" },
      { source: "w2", target: "s3" },
    ],
  },
];

/** Fills in default configuration for anything the template left blank. */
export function materialiseTemplate(t: AutomationTemplate) {
  return {
    nodes: t.nodes.map((n) => ({ ...n, config: { ...defaultConfig(n.type), ...(n.config ?? {}) } })),
    edges: t.edges,
  };
}
