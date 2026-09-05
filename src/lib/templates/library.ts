/**
 * Single source of truth for the public template library.
 *
 * Every entry here maps to a template that already ships inside Xellvio
 * (landing page builder, form builder, automation canvas). Nothing is
 * invented: facets below are editorial classifications of real templates, and
 * the payload for each one is the same object the in-app builders apply.
 */
import { PAGE_BUILDER_TEMPLATES, FORM_BUILDER_TEMPLATES, type BuilderTemplate } from "@/lib/builder/templates";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/lib/automation-templates";

export type TemplateType = "landing-page" | "signup-form" | "automation";

/** URL segment used by the public template routes (kept from the existing site). */
export const TYPE_TO_CATEGORY: Record<TemplateType, string> = {
  "landing-page": "landing-pages",
  "signup-form": "sign-up-forms",
  automation: "automations",
};

export const CATEGORY_TO_TYPE: Record<string, TemplateType> = {
  "landing-pages": "landing-page",
  "sign-up-forms": "signup-form",
  automations: "automation",
};

export type Industry =
  | "ecommerce"
  | "agencies"
  | "saas"
  | "education"
  | "events"
  | "professional-services"
  | "creators";

export type Goal =
  | "grow-a-list"
  | "generate-leads"
  | "fill-an-event"
  | "sell-a-product"
  | "book-calls"
  | "re-engage-contacts"
  | "stay-compliant";

export type Complexity = "starter" | "intermediate" | "advanced";

export const INDUSTRY_LABEL: Record<Industry, string> = {
  ecommerce: "Ecommerce",
  agencies: "Agencies",
  saas: "SaaS",
  education: "Education & courses",
  events: "Events & webinars",
  "professional-services": "Professional services",
  creators: "Creators & publishers",
};

export const GOAL_LABEL: Record<Goal, string> = {
  "grow-a-list": "Grow a text list",
  "generate-leads": "Generate leads",
  "fill-an-event": "Fill an event",
  "sell-a-product": "Sell a product",
  "book-calls": "Book calls",
  "re-engage-contacts": "Re-engage contacts",
  "stay-compliant": "Stay compliant",
};

export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  starter: "Starter",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export type LibraryTemplate = {
  type: TemplateType;
  /** Category segment for the public URL. */
  category: string;
  slug: string;
  label: string;
  blurb: string;
  /** Editorial chip carried over from the in-app template. */
  tag: string;
  industries: Industry[];
  goals: Goal[];
  complexity: Complexity;
  /** Bumped when the underlying template definition changes. */
  version: string;
  featured: boolean;
  audience: string;
  /** Answer-first summary used for GEO / AI answer engines. */
  answer: string;
  features: string[];
  customise: string[];
  steps: string[];
  faq: { q: string; a: string }[];
  /** Marketing product page this template belongs to. */
  product: string;
  /** In-app destination once the template has been imported. */
  useIn: string;
};

const F = (
  industries: Industry[],
  goals: Goal[],
  complexity: Complexity,
  audience: string,
  featured = false,
) => ({ industries, goals, complexity, audience, featured });

type Facets = ReturnType<typeof F>;

const PAGE_FACETS: Record<string, Facets> = {
  "lead-gen": F(["agencies", "professional-services"], ["generate-leads", "grow-a-list"], "starter", "Teams running a lead magnet or gated guide.", true),
  saas: F(["saas"], ["generate-leads", "sell-a-product"], "intermediate", "Software products explaining features and pricing."),
  agency: F(["agencies"], ["book-calls", "generate-leads"], "intermediate", "Agencies presenting services and booking calls.", true),
  course: F(["education"], ["sell-a-product", "generate-leads"], "intermediate", "Educators selling or filling a course."),
  "webinar-page": F(["events", "education"], ["fill-an-event"], "starter", "Hosts filling seats for a live session.", true),
  "event-page": F(["events"], ["fill-an-event"], "starter", "Organisers taking event registrations."),
  "product-promo": F(["ecommerce"], ["sell-a-product", "grow-a-list"], "starter", "Retail and ecommerce promoting a launch or offer.", true),
  consultant: F(["professional-services"], ["book-calls", "generate-leads"], "starter", "Independent consultants generating enquiries."),
  coaching: F(["professional-services", "creators"], ["book-calls"], "starter", "Coaches converting interest into discovery calls."),
  "digital-product": F(["creators"], ["sell-a-product"], "starter", "Anyone selling a download or digital product."),
  "newsletter-page": F(["creators"], ["grow-a-list"], "starter", "Publishers growing a subscriber list."),
  "free-training": F(["education"], ["generate-leads", "fill-an-event"], "intermediate", "Providers offering free training as a lead in."),
};

const FORM_FACETS: Record<string, Facets> = {
  "lead-capture": F(["agencies", "professional-services"], ["generate-leads"], "starter", "Service businesses and agencies collecting enquiries.", true),
  newsletter: F(["creators", "ecommerce"], ["grow-a-list"], "starter", "Brands starting a text list with the fewest possible fields.", true),
  webinar: F(["events", "education"], ["fill-an-event"], "starter", "Anyone running a webinar or online session."),
  "free-course": F(["education"], ["generate-leads"], "starter", "Course providers and training companies."),
  "digital-skills": F(["education"], ["generate-leads"], "starter", "Training providers promoting a specific programme."),
  discount: F(["ecommerce"], ["grow-a-list", "sell-a-product"], "starter", "Ecommerce stores trading an incentive for consent.", true),
  consultation: F(["professional-services"], ["book-calls"], "starter", "Consultants and clinics taking bookings."),
  waitlist: F(["saas", "creators"], ["grow-a-list"], "starter", "Teams gathering demand before launch."),
  event: F(["events"], ["fill-an-event"], "starter", "Venues and organisers registering attendees."),
  contact: F(["professional-services", "agencies"], ["generate-leads"], "starter", "Any business that wants enquiries in one place."),
};

const AUTOMATION_FACETS: Record<string, Facets> = {
  "welcome-series": F(["ecommerce", "creators"], ["grow-a-list", "sell-a-product"], "starter", "Brands that want every new contact greeted automatically.", true),
  "keyword-optin": F(["ecommerce", "events"], ["grow-a-list"], "intermediate", "Anyone collecting sign-ups from a printed or spoken keyword."),
  "signup-form-followup": F(["agencies", "professional-services"], ["generate-leads"], "starter", "Teams following up on form enquiries within minutes.", true),
  "two-way-question": F(["ecommerce", "creators"], ["grow-a-list"], "advanced", "Lists that want preferences captured by reply."),
  "abandoned-interest": F(["ecommerce", "saas"], ["sell-a-product"], "advanced", "Stores acting on link clicks as buying signals.", true),
  winback: F(["ecommerce"], ["re-engage-contacts"], "intermediate", "Lists with contacts who have gone quiet."),
  birthday: F(["ecommerce", "professional-services"], ["sell-a-product"], "intermediate", "Businesses with birthdays on file."),
  "optout-cleanup": F(["ecommerce", "agencies"], ["stay-compliant"], "starter", "Any sender keeping opt-outs tidy and provable."),
  "failed-delivery": F(["ecommerce", "agencies"], ["stay-compliant"], "starter", "Senders protecting deliverability from dead numbers."),
  "vip-nurture": F(["ecommerce", "creators"], ["sell-a-product", "re-engage-contacts"], "advanced", "Brands with a VIP or high-value segment."),
};

const PAGE_FEATURES = [
  "Hero section with headline, supporting copy and a call to action",
  "Benefit, proof and FAQ sections you can keep or remove",
  "Built-in capture form with explicit SMS consent",
  "Responsive layout with desktop, tablet and mobile previews",
];

const FORM_FEATURES = [
  "Only the fields you need, with validation on phone numbers",
  "Editable SMS consent checkbox and wording",
  "Duplicate submissions matched to the existing contact",
  "Views, submissions and conversion rate tracked per form",
];

const AUTOMATION_FEATURES = [
  "Trigger, waits and message steps already connected",
  "Consent checked before any message is sent",
  "Branching on replies, clicks or contact data where relevant",
  "Activity log showing which contacts are in the journey",
];

const PAGE_CUSTOMISE = [
  "Rewrite any section, or ask the AI assistant to redraft it for your offer.",
  "Swap images and logos from your own media library.",
  "Adjust the mobile layout in the responsive preview before publishing.",
  "Set the page title, description and social share image in the SEO tab.",
];

const FORM_CUSTOMISE = [
  "Add, remove or reorder fields, and mark the ones you require.",
  "Edit the consent wording so the permission you record matches your policy.",
  "Apply your brand colours, fonts and corner radius with design tokens.",
  "Choose the list or tag every submission should land in.",
];

const AUTOMATION_CUSTOMISE = [
  "Change the trigger, or add a second entry point.",
  "Edit the message copy and merge fields for each send.",
  "Adjust waits and branch conditions to match your sales cycle.",
  "Simulate the path a contact takes, then activate when it reads correctly.",
];

const PAGE_STEPS = [
  "Open the template — it lands in your workspace as an editable draft.",
  "Replace the copy, images and consent wording with your own.",
  "Point the form at the list you want new contacts added to.",
  "Publish, then send traffic to the page from ads, social or SMS.",
];

const FORM_STEPS = [
  "Open the template — it lands in your workspace as an editable draft.",
  "Set the fields you need and edit the consent wording.",
  "Choose the list every submission should join.",
  "Publish, then embed the form or share its link.",
];

const AUTOMATION_STEPS = [
  "Open the template — it lands on your canvas as a draft automation.",
  "Edit each message and set the waits to suit your cycle.",
  "Simulate a contact to check the path reads correctly.",
  "Activate it and watch contacts move through the log.",
];

function build(
  type: TemplateType,
  slug: string,
  label: string,
  blurb: string,
  tag: string,
  facets: Facets | undefined,
): LibraryTemplate {
  const f = facets ?? F(["professional-services"], ["generate-leads"], "starter", "Any business growing a consented contact list.");
  const shared = {
    type,
    category: TYPE_TO_CATEGORY[type],
    slug,
    label,
    blurb,
    tag,
    industries: f.industries,
    goals: f.goals,
    complexity: f.complexity,
    version: "1.0",
    featured: f.featured,
    audience: f.audience,
  };
  if (type === "landing-page")
    return {
      ...shared,
      answer: `${label} is a free Xellvio landing page template. It arrives as editable sections — hero, benefits, proof and a capture form with SMS consent — and you publish it from the Xellvio landing page builder.`,
      features: PAGE_FEATURES,
      customise: PAGE_CUSTOMISE,
      steps: PAGE_STEPS,
      faq: [
        { q: `Is the ${label} template free to use?`, a: "Yes. Create a Xellvio account and the template opens in the landing page builder at no cost. You only pay for the messages you send." },
        { q: "Can I change the design?", a: "Every section, colour, font and corner radius is editable, and the AI design assistant can restyle or rewrite any part of the page for your offer." },
        { q: "Where do the sign-ups go?", a: "Submissions create or match a contact in your Xellvio audience, with the consent you collected recorded against them." },
      ],
      product: "/landing-pages",
      useIn: "/app/landing-pages",
    };
  if (type === "signup-form")
    return {
      ...shared,
      answer: `${label} is a free Xellvio sign-up form template. It captures the number, the details and explicit SMS consent in one submission, and it opens in the Xellvio form builder ready to edit.`,
      features: FORM_FEATURES,
      customise: FORM_CUSTOMISE,
      steps: FORM_STEPS,
      faq: [
        { q: `Is the ${label} form template free?`, a: "Yes. The template opens in the Xellvio form builder on a free account, and you only pay for messages you send." },
        { q: "Does it collect SMS consent?", a: "Yes. A consent checkbox with editable wording ships with the template, and each submission stores the exact wording that was agreed to." },
        { q: "Can I embed it on my own site?", a: "Yes. Publish the form and use its link, or embed it on any page you control." },
      ],
      product: "/signup-forms",
      useIn: "/app/signup-forms",
    };
  return {
    ...shared,
    answer: `${label} is a ready-made Xellvio SMS automation. The trigger, waits, conditions and message copy are already connected, so you edit the wording and activate it on the Xellvio automation canvas.`,
    features: AUTOMATION_FEATURES,
    customise: AUTOMATION_CUSTOMISE,
    steps: AUTOMATION_STEPS,
    faq: [
      { q: `What triggers the ${label} automation?`, a: "The trigger ships with the template and stays editable — you can change it or add a second entry point before activating." },
      { q: "Will it message people who opted out?", a: "No. Consent is checked before any send, and opted-out contacts leave the journey." },
      { q: "Can I test it before activating?", a: "Yes. Simulate a contact through the canvas first, then activate when the path reads correctly." },
    ],
    product: "/automations",
    useIn: "/app/automations",
  };
}

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  ...PAGE_BUILDER_TEMPLATES.map((t: BuilderTemplate) =>
    build("landing-page", t.id, t.label, t.blurb, t.category, PAGE_FACETS[t.id]),
  ),
  ...FORM_BUILDER_TEMPLATES.map((t: BuilderTemplate) =>
    build("signup-form", t.id, t.label, t.blurb, t.category, FORM_FACETS[t.id]),
  ),
  ...AUTOMATION_TEMPLATES.map((t: AutomationTemplate) =>
    build("automation", t.id, t.name, t.description, t.tag, AUTOMATION_FACETS[t.id]),
  ),
];

export function findLibraryTemplate(category: string, slug: string) {
  return TEMPLATE_LIBRARY.find((t) => t.category === category && t.slug === slug);
}

export function templatesByType(type: TemplateType) {
  return TEMPLATE_LIBRARY.filter((t) => t.type === type);
}

export function templatesByIndustry(industry: Industry) {
  return TEMPLATE_LIBRARY.filter((t) => t.industries.includes(industry));
}

export function templatesByGoal(goal: Goal) {
  return TEMPLATE_LIBRARY.filter((t) => t.goals.includes(goal));
}

export function isIndustry(value: string): value is Industry {
  return Object.prototype.hasOwnProperty.call(INDUSTRY_LABEL, value);
}

export function isGoal(value: string): value is Goal {
  return Object.prototype.hasOwnProperty.call(GOAL_LABEL, value);
}

/** Collections only become indexable pages when they hold enough real templates. */
export const MIN_COLLECTION_SIZE = 3;

export type TemplateFilters = {
  q?: string;
  type?: TemplateType | "all";
  industry?: Industry | "all";
  goal?: Goal | "all";
  complexity?: Complexity | "all";
};

export function filterTemplates(filters: TemplateFilters) {
  const q = (filters.q ?? "").trim().toLowerCase();
  return TEMPLATE_LIBRARY.filter((t) => {
    if (filters.type && filters.type !== "all" && t.type !== filters.type) return false;
    if (filters.industry && filters.industry !== "all" && !t.industries.includes(filters.industry)) return false;
    if (filters.goal && filters.goal !== "all" && !t.goals.includes(filters.goal)) return false;
    if (filters.complexity && filters.complexity !== "all" && t.complexity !== filters.complexity) return false;
    if (q && !`${t.label} ${t.blurb} ${t.tag} ${t.audience}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Related templates: same goal first, then same type, never the template itself. */
export function relatedTemplates(t: LibraryTemplate, limit = 3) {
  const scored = TEMPLATE_LIBRARY.filter((o) => o.slug !== t.slug || o.type !== t.type).map((o) => ({
    t: o,
    score:
      o.goals.filter((g) => t.goals.includes(g)).length * 3 +
      o.industries.filter((i) => t.industries.includes(i)).length * 2 +
      (o.type === t.type ? 1 : 0),
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.t);
}

/** The three-step product journey shown on every template page. */
export function importPath(t: LibraryTemplate) {
  return `/app/use-template/${t.category}/${t.slug}`;
}

export function authPath(t: LibraryTemplate) {
  return { to: "/auth", search: { mode: "signup" as const, redirect: importPath(t) } };
}
