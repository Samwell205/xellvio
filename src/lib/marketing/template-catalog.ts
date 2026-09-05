import { FORM_BUILDER_TEMPLATES, PAGE_BUILDER_TEMPLATES } from "@/lib/builder/templates";
import { AUTOMATION_TEMPLATES } from "@/lib/automation-templates";

/**
 * Public, SEO-facing view of the templates that already ship inside Xellvio.
 * Nothing here is invented: every entry maps to a real template a signed-in
 * user can apply in the builder or the automation canvas.
 */
export type TemplateCategory = "landing-pages" | "sign-up-forms" | "automations";

export type PublicTemplate = {
  category: TemplateCategory;
  slug: string;
  label: string;
  /** Short "what it's for" line. */
  blurb: string;
  /** Editorial grouping shown as a chip. */
  tag: string;
  /** Who it suits. */
  audience: string;
  /** What's inside. */
  features: string[];
  /** How to customise it. */
  customise: string[];
  /** Where the user goes to use it. */
  useIn: string;
};

export const CATEGORY_META: Record<
  TemplateCategory,
  { label: string; path: string; title: string; description: string; intro: string; product: string }
> = {
  "landing-pages": {
    label: "Landing page templates",
    path: "/templates/landing-pages",
    title: "Free Landing Page Templates",
    description:
      "Browse Xellvio landing page templates for lead generation, webinars, launches, courses and events. Preview each one, then edit and publish it inside Xellvio.",
    intro:
      "Multi-section pages you can publish as they are or restyle with your own brand tokens. Each template opens in the Xellvio landing page builder.",
    product: "/landing-pages",
  },
  "sign-up-forms": {
    label: "Sign-up form templates",
    path: "/templates/sign-up-forms",
    title: "Free Sign-up Form Templates",
    description:
      "Xellvio sign-up form templates for newsletters, lead capture, events, courses and consultations — each with editable SMS consent wording and instant contact creation.",
    intro:
      "Short, focused forms that capture the number, the details and the consent in one submission. Each template opens in the Xellvio form builder.",
    product: "/signup-forms",
  },
  automations: {
    label: "Automation templates",
    path: "/templates/automations",
    title: "SMS Automation Templates",
    description:
      "Ready-made Xellvio automation templates: welcome series, keyword opt-in, lead follow-up, link-click follow-up, win-back, birthday and list clean-up workflows.",
    intro:
      "Complete workflows with triggers, waits, conditions and message copy already in place. Each one opens on the Xellvio automation canvas.",
    product: "/automations",
  },
};

const FORM_AUDIENCE: Record<string, string> = {
  "lead-capture": "Service businesses and agencies collecting enquiries.",
  newsletter: "Brands starting a text list with the fewest possible fields.",
  webinar: "Anyone running a webinar or online session.",
  "free-course": "Course providers and training companies.",
  "digital-skills": "Training providers promoting a specific programme.",
  discount: "Ecommerce stores trading an incentive for consent.",
  consultation: "Consultants and clinics taking bookings.",
  waitlist: "Teams gathering demand before launch.",
  event: "Venues and organisers registering attendees.",
  contact: "Any business that wants enquiries in one place.",
};

const PAGE_AUDIENCE: Record<string, string> = {
  "lead-gen": "Teams running a lead magnet or gated guide.",
  saas: "Software products explaining features and pricing.",
  agency: "Agencies presenting services and booking calls.",
  course: "Educators selling or filling a course.",
  "webinar-page": "Hosts filling seats for a live session.",
  "event-page": "Organisers taking event registrations.",
  "product-promo": "Retail and ecommerce promoting a launch or offer.",
  consultant: "Independent consultants generating enquiries.",
  coaching: "Coaches converting interest into discovery calls.",
  "digital-product": "Anyone selling a download or digital product.",
  "newsletter-page": "Publishers growing a subscriber list.",
  "free-training": "Providers offering free training as a lead in.",
};

const FORM_CUSTOMISE = [
  "Add, remove or reorder fields, and mark the ones you require.",
  "Edit the consent wording so the permission you record matches your policy.",
  "Apply your brand colours, fonts and corner radius with design tokens.",
  "Choose the list or tag every submission should land in.",
];

const PAGE_CUSTOMISE = [
  "Rewrite any section, or ask the AI assistant to redraft it for your offer.",
  "Swap images and logos from your own media library.",
  "Adjust the mobile layout in the responsive preview before publishing.",
  "Set the page title, description and social share image in the SEO tab.",
];

const AUTOMATION_CUSTOMISE = [
  "Change the trigger, or add a second entry point.",
  "Edit the message copy and merge fields for each send.",
  "Adjust waits and branch conditions to match your sales cycle.",
  "Simulate the path a contact takes, then activate when it reads correctly.",
];

export const PUBLIC_TEMPLATES: PublicTemplate[] = [
  ...PAGE_BUILDER_TEMPLATES.map<PublicTemplate>((t) => ({
    category: "landing-pages",
    slug: t.id,
    label: t.label,
    blurb: t.blurb,
    tag: t.category,
    audience: PAGE_AUDIENCE[t.id] ?? "Any business that needs a focused page fast.",
    features: [
      "Hero section with headline, supporting copy and a call to action",
      "Benefit, proof and FAQ sections you can keep or remove",
      "Built-in capture form with explicit SMS consent",
      "Responsive layout with desktop, tablet and mobile previews",
    ],
    customise: PAGE_CUSTOMISE,
    useIn: "/app/landing-pages",
  })),
  ...FORM_BUILDER_TEMPLATES.map<PublicTemplate>((t) => ({
    category: "sign-up-forms",
    slug: t.id,
    label: t.label,
    blurb: t.blurb,
    tag: t.category,
    audience: FORM_AUDIENCE[t.id] ?? "Any business growing a consented contact list.",
    features: [
      "Only the fields you need, with validation on phone numbers",
      "Editable SMS consent checkbox and wording",
      "Duplicate submissions matched to the existing contact",
      "Views, submissions and conversion rate tracked per form",
    ],
    customise: FORM_CUSTOMISE,
    useIn: "/app/signup-forms",
  })),
  ...AUTOMATION_TEMPLATES.map<PublicTemplate>((t) => ({
    category: "automations",
    slug: t.id,
    label: t.name,
    blurb: t.description,
    tag: t.tag,
    audience: "Teams that want the follow-up to happen without manual chasing.",
    features: [
      "Trigger, waits and message steps already connected",
      "Consent checked before any message is sent",
      "Branching on replies, clicks or contact data where relevant",
      "Activity log showing which contacts are in the journey",
    ],
    customise: AUTOMATION_CUSTOMISE,
    useIn: "/app/automations",
  })),
];

export function templatesInCategory(category: TemplateCategory) {
  return PUBLIC_TEMPLATES.filter((t) => t.category === category);
}

export function findTemplate(category: string, slug: string) {
  return PUBLIC_TEMPLATES.find((t) => t.category === category && t.slug === slug);
}

export function isTemplateCategory(value: string): value is TemplateCategory {
  return value === "landing-pages" || value === "sign-up-forms" || value === "automations";
}

/** Blocks for a live preview, when the template is a builder template. */
export function previewFor(category: TemplateCategory, slug: string) {
  if (category === "landing-pages") return PAGE_BUILDER_TEMPLATES.find((t) => t.id === slug);
  if (category === "sign-up-forms") return FORM_BUILDER_TEMPLATES.find((t) => t.id === slug);
  return undefined;
}
