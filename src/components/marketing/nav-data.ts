import {
  MessageSquare, Mail, Workflow, LayoutTemplate, FormInput, BarChart3, Users,
  Globe2, ShieldCheck, Sparkles, Wallet,
  type LucideIcon,
} from "lucide-react";

export type MenuItem = { to: string; label: string; blurb: string; icon: LucideIcon };
export type MenuGroup = { heading: string; items: MenuItem[] };
export type NavEntry =
  | { label: string; to: string }
  | { label: string; groups: MenuGroup[]; footer?: { label: string; to: string } };

export const NAV: NavEntry[] = [
  {
    label: "Platform",
    groups: [
      {
        heading: "Channels",
        items: [
          { to: "/sms-marketing", label: "SMS marketing", blurb: "Two-way texting in 190+ countries", icon: MessageSquare },
          { to: "/email-marketing", label: "Email marketing", blurb: "Campaigns, flows and A/B testing", icon: Mail },
          { to: "/solutions/email-to-sms", label: "Email to SMS", blurb: "Send a text from your inbox", icon: Sparkles },
        ],
      },
      {
        heading: "Build & grow",
        items: [
          { to: "/features", label: "Automations", blurb: "Trigger journeys from any event", icon: Workflow },
          { to: "/features", label: "Landing pages", blurb: "AI-built pages that convert", icon: LayoutTemplate },
          { to: "/features", label: "Sign-up forms", blurb: "Grow your list on any site", icon: FormInput },
          { to: "/features", label: "Audiences & segments", blurb: "Live lists that update themselves", icon: Users },
        ],
      },
      {
        heading: "Measure & trust",
        items: [
          { to: "/features", label: "Reporting", blurb: "Delivery, clicks and revenue", icon: BarChart3 },
          { to: "/features", label: "Global delivery", blurb: "Tier-1 carriers, local rules handled", icon: Globe2 },
          { to: "/features", label: "Compliance", blurb: "Consent, opt-outs and verification", icon: ShieldCheck },
        ],
      },
    ],
    footer: { label: "See every feature", to: "/features" },
  },
  {
    label: "Resources",
    groups: [
      {
        heading: "Learn",
        items: [
          { to: "/solutions", label: "Solutions by industry", blurb: "Retail, services, events and more", icon: LayoutTemplate },
          { to: "/about", label: "About Xellvio", blurb: "Who we are and why we build", icon: Users },
        ],
      },
      {
        heading: "Earn & support",
        items: [
          { to: "/verify", label: "Earn as a verifier", blurb: "Get paid to verify numbers", icon: Wallet },
          { to: "/contact", label: "Contact us", blurb: "Talk to a human today", icon: MessageSquare },
        ],
      },
    ],
    footer: { label: "Talk to us", to: "/contact" },
  },
  { label: "Pricing", to: "/pricing" },
];
