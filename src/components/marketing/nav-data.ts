import {
  MessageSquare, Mail, Workflow, LayoutTemplate, FormInput, BarChart3, Users,
  Globe2, ShieldCheck, Sparkles, Wallet, BookOpen, Building2,
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
          { to: "/automations", label: "Automations", blurb: "Trigger journeys from any event", icon: Workflow },
          { to: "/landing-pages", label: "Landing pages", blurb: "AI-built pages that convert", icon: LayoutTemplate },
          { to: "/signup-forms", label: "Sign-up forms", blurb: "Grow your list on any site", icon: FormInput },
          { to: "/audiences", label: "Audiences & segments", blurb: "Live lists that update themselves", icon: Users },
        ],
      },
      {
        heading: "Measure & trust",
        items: [
          { to: "/reporting", label: "Reporting", blurb: "Delivery, clicks and revenue", icon: BarChart3 },
          { to: "/global-delivery", label: "Global delivery", blurb: "Tier-1 carriers, local rules handled", icon: Globe2 },
          { to: "/compliance", label: "Compliance", blurb: "Consent, opt-outs and verification", icon: ShieldCheck },
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
          { to: "/resources", label: "Resource hub", blurb: "Guides, templates and documentation", icon: BookOpen },
          { to: "/templates", label: "Templates", blurb: "Pages, forms and automations ready to use", icon: LayoutTemplate },
          { to: "/docs", label: "Documentation", blurb: "How every part of Xellvio works", icon: BookOpen },
        ],
      },
      {
        heading: "By industry",
        items: [
          { to: "/solutions", label: "All industries", blurb: "Retail, services, events and more", icon: Building2 },
          { to: "/solutions/ecommerce", label: "Ecommerce", blurb: "Launches, back-in-stock and win-backs", icon: LayoutTemplate },
          { to: "/solutions/service-businesses", label: "Service businesses", blurb: "Quotes, reminders and follow-ups", icon: Users },
        ],
      },
      {
        heading: "Earn & support",
        items: [
          { to: "/verify", label: "Earn as a verifier", blurb: "Get paid to verify numbers", icon: Wallet },
          { to: "/about", label: "About Xellvio", blurb: "Who we are and why we build", icon: Users },
          { to: "/contact", label: "Contact us", blurb: "Talk to a human today", icon: MessageSquare },
        ],
      },
    ],
    footer: { label: "Browse all templates", to: "/templates" },
  },
  { label: "Pricing", to: "/pricing" },
];
