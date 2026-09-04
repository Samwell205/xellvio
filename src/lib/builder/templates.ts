/**
 * Ready-made templates. Every template is a real block tree using the same
 * schema as the visual builder, so anything a user picks stays fully editable.
 */
import {
  type Block,
  type Theme,
  BRAND_PRESETS,
  DARK_THEME,
  LIGHT_THEME,
  makeBlock,
} from "./schema";

export type BuilderTemplate = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  kind: "form" | "page";
  theme: Theme;
  blocks: Block[];
};

const preset = (id: string): Theme => BRAND_PRESETS.find((p) => p.id === id)?.theme ?? LIGHT_THEME;

const heading = (text: string, size = 40, extra: Partial<Block["styles"]> = {}) =>
  makeBlock("heading", { content: { text, level: 1 }, styles: { fontSize: size, fontWeight: 800, marginBottom: 14, ...extra } });

const text = (t: string, extra: Partial<Block["styles"]> = {}) =>
  makeBlock("text", { content: { text: t }, styles: { fontSize: 17, marginBottom: 18, color: "muted", ...extra } });

const field = (kind: string, label: string, placeholder: string, required = false, extra: Record<string, any> = {}) =>
  makeBlock("field", { content: { kind, label, placeholder, required, help: "", options: [], ...extra } });

const submit = (label: string) => makeBlock("submit", { content: { label }, styles: { width: "full", marginTop: 6 } });

function form(fields: Block[], cta: string, opts: { columns?: number; success?: string; flat?: boolean } = {}) {
  return makeBlock("form", {
    content: {
      successMessage: opts.success ?? "Thanks! You're officially registered.",
      successMode: "message",
      redirectUrl: "",
      consentText:
        "By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.",
    },
    styles: { columns: opts.columns ?? 1, mobileColumns: 1, gap: 12, paddingY: opts.flat ? 0 : 26, paddingX: opts.flat ? 0 : 26, background: opts.flat ? "transparent" : "surface", shadow: !opts.flat },
    children: [...fields, submit(cta)],
  });
}

const section = (children: Block[], styles: Partial<Block["styles"]> = {}) =>
  makeBlock("section", { styles: { paddingY: 72, paddingX: 24, ...styles }, children });

/* -------------------------------- form templates ------------------------------ */

type FormSpec = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  theme: Theme;
  headline: string;
  sub: string;
  cta: string;
  fields: Block[];
  columns?: number;
  align?: "left" | "center";
  eyebrow?: string;
};

const FORM_SPECS: FormSpec[] = [
  {
    id: "lead-capture",
    label: "Simple lead capture",
    category: "Lead Generation",
    blurb: "One clean card, name and phone, strong CTA.",
    theme: preset("clean"),
    eyebrow: "Get in touch",
    headline: "Get your free quote in minutes",
    sub: "Tell us where to reach you and a specialist will text you back today.",
    cta: "Get my free quote",
    fields: [field("firstName", "First name", "Jane", true), field("phone", "Phone number", "+1 555 000 1234", true)],
  },
  {
    id: "newsletter",
    label: "Newsletter signup",
    category: "Newsletter",
    blurb: "Minimal, single field, editorial type.",
    theme: preset("editorial"),
    eyebrow: "The weekly brief",
    headline: "One useful text a week. Nothing else.",
    sub: "Short, practical marketing ideas you can use the same day.",
    cta: "Subscribe",
    fields: [field("phone", "Phone number", "+1 555 000 1234", true)],
    align: "center",
  },
  {
    id: "webinar",
    label: "Webinar registration",
    category: "Webinar",
    blurb: "Two-column details capture with reminder promise.",
    theme: preset("saas"),
    eyebrow: "Live webinar",
    headline: "How to turn SMS into your best channel",
    sub: "45 minutes, live, with a Q&A at the end. We'll text you the join link.",
    cta: "Save my seat",
    columns: 2,
    fields: [
      field("firstName", "First name", "Jane", true),
      field("lastName", "Last name", "Doe"),
      field("email", "Work email", "you@company.com", true),
      field("phone", "Mobile number", "+1 555 000 1234", true),
    ],
  },
  {
    id: "free-course",
    label: "Free course registration",
    category: "Education",
    blurb: "Bold dark card with benefit list feel.",
    theme: preset("midnight"),
    eyebrow: "100% free",
    headline: "Free 5-day marketing course",
    sub: "One short lesson a day, straight to your phone. Cancel any time.",
    cta: "Start the free course",
    fields: [field("fullName", "Full name", "Jane Doe", true), field("phone", "Phone number", "+1 555 000 1234", true)],
  },
  {
    id: "digital-skills",
    label: "Digital skills training",
    category: "Education",
    blurb: "High-conversion training signup with three fields.",
    theme: preset("midnight"),
    eyebrow: "Free training",
    headline: "FREE DIGITAL SKILLS TRAINING",
    sub: "Learn practical digital skills and start building income online.",
    cta: "JOIN THE TRAINING",
    fields: [
      field("firstName", "First name", "Jane", true),
      field("email", "Email address", "you@example.com", true),
      field("phone", "Phone number", "+1 555 000 1234", true),
    ],
  },
  {
    id: "discount",
    label: "Discount signup",
    category: "E-commerce",
    blurb: "Retail popup style with pill CTA.",
    theme: preset("retail"),
    eyebrow: "Members only",
    headline: "Take 15% off your first order",
    sub: "Join our text list for early access to drops, restocks and member pricing.",
    cta: "Unlock 15% off",
    fields: [field("phone", "Phone number", "+1 555 000 1234", true)],
    align: "center",
  },
  {
    id: "consultation",
    label: "Book a consultation",
    category: "Consulting",
    blurb: "Professional two-column intake form.",
    theme: preset("clean"),
    eyebrow: "Free 20-minute call",
    headline: "Book your strategy consultation",
    sub: "Tell us a little about your business and we'll text you two time options.",
    cta: "Request my call",
    columns: 2,
    fields: [
      field("fullName", "Full name", "Jane Doe", true),
      field("company", "Company", "Acme Ltd"),
      field("phone", "Phone number", "+1 555 000 1234", true),
      field("select", "Team size", "", false, { options: ["Just me", "2–10", "11–50", "50+"] }),
      field("textarea", "What would you like help with?", "A sentence or two is plenty"),
    ],
  },
  {
    id: "waitlist",
    label: "Product waitlist",
    category: "Product",
    blurb: "Sleek waitlist with position promise.",
    theme: preset("saas"),
    eyebrow: "Early access",
    headline: "Join the waitlist",
    sub: "We're onboarding in small batches. We'll text you the moment your spot opens.",
    cta: "Join the waitlist",
    fields: [field("email", "Email", "you@example.com", true), field("phone", "Phone number", "+1 555 000 1234", true)],
    align: "center",
  },
  {
    id: "event",
    label: "Event registration",
    category: "Events",
    blurb: "Event details capture with guest count.",
    theme: preset("boutique"),
    eyebrow: "In person",
    headline: "Reserve your place",
    sub: "Doors at 6pm. We'll text your ticket and directions.",
    cta: "Reserve my place",
    columns: 2,
    fields: [
      field("fullName", "Full name", "Jane Doe", true),
      field("phone", "Mobile number", "+1 555 000 1234", true),
      field("number", "How many guests?", "1"),
      field("date", "Preferred date", ""),
    ],
  },
  {
    id: "contact",
    label: "Contact form",
    category: "Lead Generation",
    blurb: "Classic contact form with message box.",
    theme: preset("clean"),
    eyebrow: "Contact us",
    headline: "Send us a message",
    sub: "We reply to every message, usually within a couple of hours.",
    cta: "Send message",
    columns: 2,
    fields: [
      field("firstName", "First name", "Jane", true),
      field("lastName", "Last name", "Doe"),
      field("phone", "Phone number", "+1 555 000 1234", true),
      field("email", "Email", "you@example.com"),
      field("textarea", "Message", "How can we help?", true),
    ],
  },
];

function formBlocks(spec: FormSpec): Block[] {
  const align = spec.align ?? "left";
  const inner: Block[] = [];
  if (spec.eyebrow)
    inner.push(
      makeBlock("text", {
        content: { text: spec.eyebrow },
        styles: { fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase", color: "primary", marginBottom: 10, fontWeight: 700 },
      }),
    );
  inner.push(heading(spec.headline, align === "center" ? 38 : 40, { align }));
  inner.push(text(spec.sub, { align }));
  inner.push(form(spec.fields, spec.cta, { columns: spec.columns }));
  return [section(inner, { paddingY: 64, maxWidth: spec.columns === 2 ? 720 : 560, align })];
}

/* -------------------------------- page templates ------------------------------ */

type PageSpec = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  theme: Theme;
  eyebrow: string;
  headline: string;
  sub: string;
  cta: string;
  benefits: { icon: string; title: string; body: string }[];
  stats?: { value: string; label: string }[];
  quotes?: { quote: string; author: string; role: string }[];
  faq?: { q: string; a: string }[];
  fields?: Block[];
  splitHero?: boolean;
};

const defaultFields = () => [field("firstName", "First name", "Jane", true), field("phone", "Phone number", "+1 555 000 1234", true)];

const PAGE_SPECS: PageSpec[] = [
  {
    id: "lead-gen",
    label: "Lead generation page",
    category: "Lead Generation",
    blurb: "Split hero, proof stats, benefits and a closing CTA.",
    theme: preset("clean"),
    eyebrow: "Free guide",
    headline: "More customers, without more ad spend",
    sub: "Download the playbook we use to turn text subscribers into repeat buyers.",
    cta: "Send me the playbook",
    splitHero: true,
    benefits: [
      { icon: "📈", title: "Proven framework", body: "The exact sequence behind 40% reply rates." },
      { icon: "🧭", title: "Step-by-step", body: "Copy templates you can send this week." },
      { icon: "⏱️", title: "20 minutes", body: "Short, practical and free of fluff." },
    ],
    stats: [
      { value: "12k+", label: "Businesses" },
      { value: "38%", label: "Avg. click rate" },
      { value: "4.9/5", label: "Rating" },
    ],
    quotes: [{ quote: "We booked 26 calls in the first fortnight.", author: "Amara O.", role: "Founder, Lumo" }],
    faq: [{ q: "Is it really free?", a: "Yes — no card, no catch." }],
  },
  {
    id: "saas",
    label: "SaaS product page",
    category: "SaaS",
    blurb: "Modern product page with features, pricing and FAQ.",
    theme: preset("saas"),
    eyebrow: "New",
    headline: "Messaging that actually converts",
    sub: "Send campaigns, automate replies and track revenue in one clean workspace.",
    cta: "Start free",
    splitHero: true,
    benefits: [
      { icon: "⚡", title: "Fast dispatch", body: "Thousands of messages a minute." },
      { icon: "🤖", title: "Automations", body: "Welcome flows and keyword replies." },
      { icon: "📊", title: "Real reporting", body: "Delivery, clicks and revenue." },
    ],
    stats: [
      { value: "99.9%", label: "Uptime" },
      { value: "2s", label: "Avg. delivery" },
      { value: "180+", label: "Countries" },
    ],
    quotes: [
      { quote: "We replaced two tools with this.", author: "Dan P.", role: "Growth, Northside" },
      { quote: "Setup took ten minutes.", author: "Ife A.", role: "Ops, Barrel" },
    ],
    faq: [
      { q: "Can I cancel any time?", a: "Yes, monthly with no lock-in." },
      { q: "Do you support MMS?", a: "Yes, images and video included." },
    ],
  },
  {
    id: "agency",
    label: "Marketing agency page",
    category: "Agency",
    blurb: "Dark premium agency page with services and proof.",
    theme: preset("midnight"),
    eyebrow: "Growth studio",
    headline: "We build demand for ambitious brands",
    sub: "Paid, lifecycle and SMS — run by one senior team that reports on revenue.",
    cta: "Book a strategy call",
    benefits: [
      { icon: "🎯", title: "Paid acquisition", body: "Meta, Google and TikTok managed daily." },
      { icon: "✉️", title: "Lifecycle", body: "Email and SMS that pays for itself." },
      { icon: "🧪", title: "Creative testing", body: "New angles shipped every week." },
    ],
    stats: [
      { value: "$41m", label: "Revenue driven" },
      { value: "60+", label: "Brands" },
      { value: "7 yrs", label: "Average tenure" },
    ],
    quotes: [{ quote: "The only agency that showed us real numbers.", author: "Chloe R.", role: "CMO, Verdant" }],
    faq: [{ q: "What's the minimum term?", a: "Three months, then rolling." }],
  },
  {
    id: "course",
    label: "Online course page",
    category: "Education",
    blurb: "Curriculum-led course page with enrolment form.",
    theme: preset("editorial"),
    eyebrow: "Enrolment open",
    headline: "Learn digital marketing that pays",
    sub: "Six weeks, live sessions, real campaigns. Built for people starting out.",
    cta: "Enrol now",
    benefits: [
      { icon: "🎓", title: "Live teaching", body: "Two sessions a week with feedback." },
      { icon: "🛠️", title: "Real projects", body: "Build campaigns for actual brands." },
      { icon: "💬", title: "Community", body: "A cohort that keeps you accountable." },
    ],
    quotes: [{ quote: "I landed my first client in week four.", author: "Tunde B.", role: "Graduate" }],
    faq: [
      { q: "Do I need experience?", a: "None at all — we start from the basics." },
      { q: "Is there a payment plan?", a: "Yes, three instalments." },
    ],
  },
  {
    id: "webinar-page",
    label: "Webinar registration page",
    category: "Webinar",
    blurb: "Date-led hero, agenda benefits and countdown.",
    theme: preset("saas"),
    eyebrow: "Live · Free",
    headline: "The 45-minute SMS revenue workshop",
    sub: "Watch us build a full campaign from scratch, then ask anything.",
    cta: "Save my seat",
    splitHero: true,
    benefits: [
      { icon: "🗓️", title: "Live build", body: "A real campaign from blank to sent." },
      { icon: "🎁", title: "Free templates", body: "All copy shared afterwards." },
      { icon: "❓", title: "Open Q&A", body: "Bring your hardest question." },
    ],
    faq: [{ q: "Will there be a recording?", a: "Yes, we text it to everyone who registers." }],
  },
  {
    id: "event-page",
    label: "Event registration page",
    category: "Events",
    blurb: "Warm event page with schedule and reservation form.",
    theme: preset("boutique"),
    eyebrow: "In person · Limited seats",
    headline: "An evening for local founders",
    sub: "Talks, food and introductions that actually lead somewhere.",
    cta: "Reserve my place",
    benefits: [
      { icon: "🎤", title: "Three talks", body: "Short, practical and honest." },
      { icon: "🍽️", title: "Dinner included", body: "Proper food, not sad canapés." },
      { icon: "🤝", title: "Curated intros", body: "We match you with two guests." },
    ],
    faq: [{ q: "Can I bring someone?", a: "Yes, add guests on the form." }],
  },
  {
    id: "product-promo",
    label: "Product promotion page",
    category: "E-commerce",
    blurb: "Retail promo with countdown, benefits and discount capture.",
    theme: preset("retail"),
    eyebrow: "48 hours only",
    headline: "The mid-season sale is live",
    sub: "Up to 40% off, plus an extra 15% for text subscribers.",
    cta: "Unlock my 15%",
    benefits: [
      { icon: "🚚", title: "Free delivery", body: "On everything, no minimum." },
      { icon: "↩️", title: "60-day returns", body: "Changed your mind? No problem." },
      { icon: "⭐", title: "18k reviews", body: "Averaging 4.8 out of 5." },
    ],
    quotes: [{ quote: "Found out by text and saved £40.", author: "Sam K.", role: "Customer" }],
  },
  {
    id: "consultant",
    label: "Consultant page",
    category: "Consulting",
    blurb: "Authority-led page with credentials and booking form.",
    theme: preset("clean"),
    eyebrow: "Independent consultant",
    headline: "Fix the bottleneck, not the symptoms",
    sub: "Fifteen years helping operators find the one change that moves revenue.",
    cta: "Book a 20-minute call",
    splitHero: true,
    benefits: [
      { icon: "🔍", title: "Diagnostic first", body: "We find the constraint before spending." },
      { icon: "📐", title: "Clear plan", body: "One page, owners and dates." },
      { icon: "🤲", title: "Hands-on", body: "I stay until it's shipped." },
    ],
    faq: [{ q: "How do you charge?", a: "Fixed fee per engagement." }],
  },
  {
    id: "coaching",
    label: "Coaching page",
    category: "Coaching",
    blurb: "Personal, warm coaching page with programme detail.",
    theme: preset("boutique"),
    eyebrow: "1:1 coaching",
    headline: "Build the business without burning out",
    sub: "Twelve weeks of structure, accountability and honest feedback.",
    cta: "Apply for coaching",
    benefits: [
      { icon: "🧠", title: "Weekly sessions", body: "Sixty focused minutes, every week." },
      { icon: "📓", title: "Between calls", body: "Voice notes and text support." },
      { icon: "🎯", title: "One goal", body: "We pick it together and go." },
    ],
    quotes: [{ quote: "I doubled my rates and kept every client.", author: "Nadia S.", role: "Designer" }],
  },
  {
    id: "digital-product",
    label: "Digital product page",
    category: "Product",
    blurb: "Dark product page with pricing cards.",
    theme: preset("midnight"),
    eyebrow: "Instant download",
    headline: "The campaign template pack",
    sub: "120 proven SMS and email templates you can send today.",
    cta: "Get the pack",
    benefits: [
      { icon: "📦", title: "120 templates", body: "Sorted by industry and goal." },
      { icon: "✍️", title: "Editable", body: "Swap the brand and send." },
      { icon: "🔁", title: "Free updates", body: "New packs every quarter." },
    ],
    faq: [{ q: "What format?", a: "Copy-paste text plus a Notion board." }],
  },
  {
    id: "newsletter-page",
    label: "Newsletter page",
    category: "Newsletter",
    blurb: "Editorial newsletter page with sample issues.",
    theme: preset("editorial"),
    eyebrow: "Free weekly",
    headline: "The text that makes you better at marketing",
    sub: "One idea, one example, one thing to try. Every Tuesday.",
    cta: "Subscribe free",
    benefits: [
      { icon: "📖", title: "Two minutes", body: "Short enough to actually read." },
      { icon: "🧪", title: "Real examples", body: "Campaigns that ran, numbers included." },
      { icon: "🚪", title: "Leave any time", body: "Reply STOP and it stops." },
    ],
    stats: [
      { value: "24k", label: "Readers" },
      { value: "62%", label: "Open rate" },
      { value: "0", label: "Spam" },
    ],
  },
  {
    id: "free-training",
    label: "Free training page",
    category: "Education",
    blurb: "High-conversion free training page, dark and bold.",
    theme: preset("midnight"),
    eyebrow: "Completely free",
    headline: "FREE DIGITAL SKILLS TRAINING",
    sub: "Learn practical digital skills and start building income online — from your phone.",
    cta: "JOIN THE TRAINING",
    splitHero: true,
    benefits: [
      { icon: "💼", title: "Job-ready skills", body: "The four skills clients pay for now." },
      { icon: "📱", title: "Phone friendly", body: "Everything works on mobile data." },
      { icon: "🎁", title: "Free toolkit", body: "Templates and a starter checklist." },
    ],
    stats: [
      { value: "9,400", label: "Trained" },
      { value: "5 days", label: "Programme" },
      { value: "Free", label: "Cost" },
    ],
    quotes: [{ quote: "I got my first paid gig two weeks after.", author: "Grace M.", role: "Graduate" }],
    faq: [
      { q: "How is the training delivered?", a: "Short lessons by text and video links." },
      { q: "Do I need a laptop?", a: "No — a phone is enough to start." },
    ],
  },
];

function pageBlocks(spec: PageSpec): Block[] {
  const fields = spec.fields ?? defaultFields();
  const eyebrow = makeBlock("text", {
    content: { text: spec.eyebrow },
    styles: { fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase", color: "primary", fontWeight: 700, marginBottom: 12 },
  });

  const heroCopy = [eyebrow, heading(spec.headline, 52, { marginBottom: 16 }), text(spec.sub, { fontSize: 19, marginBottom: 26 })];
  const heroForm = form(fields, spec.cta);

  const hero = spec.splitHero
    ? section(
        [
          makeBlock("columns", {
            styles: { columns: 2, mobileColumns: 1, gap: 48 },
            children: [
              makeBlock("column", { children: heroCopy }),
              makeBlock("column", { children: [heroForm] }),
            ],
          }),
        ],
        { paddingY: 88, background: "background" },
      )
    : section([...heroCopy.map((b) => ({ ...b, styles: { ...b.styles, align: "center" as const } })), heroForm], {
        paddingY: 96,
        align: "center",
        maxWidth: 720,
      });

  const blocks: Block[] = [hero];

  if (spec.stats) blocks.push(section([makeBlock("stats", { content: { items: spec.stats }, styles: { columns: spec.stats.length, mobileColumns: 3, gap: 16, align: "center" } })], { paddingY: 40, background: "surface" }));

  blocks.push(
    section(
      [
        heading("Why people join", 34, { align: "center", marginBottom: 28 }),
        makeBlock("features", { content: { items: spec.benefits }, styles: { columns: 3, mobileColumns: 1, gap: 24 } }),
      ],
      { paddingY: 80 },
    ),
  );

  if (spec.quotes?.length)
    blocks.push(
      section(
        [
          heading("What people say", 32, { align: "center", marginBottom: 26 }),
          makeBlock("testimonials", { content: { items: spec.quotes }, styles: { columns: Math.min(2, spec.quotes.length), mobileColumns: 1, gap: 24 } }),
        ],
        { paddingY: 72, background: "surface" },
      ),
    );

  if (spec.faq?.length)
    blocks.push(
      section(
        [heading("Questions", 30, { align: "center", marginBottom: 24 }), makeBlock("faq", { content: { items: spec.faq }, styles: { gap: 12 } })],
        { paddingY: 72, maxWidth: 760 },
      ),
    );

  blocks.push(
    section(
      [
        heading("Ready to start?", 38, { align: "center", marginBottom: 14 }),
        text("It takes less than a minute and you can leave whenever you like.", { align: "center", marginBottom: 24 }),
        form(fields.map((f) => ({ ...f, id: `${f.id}b` })), spec.cta),
      ],
      { paddingY: 80, maxWidth: 620, align: "center", background: "background" },
    ),
  );

  blocks.push(
    section(
      [
        makeBlock("divider", { styles: { marginBottom: 20 } }),
        makeBlock("text", {
          content: { text: "© Your brand. Reply STOP to opt out, HELP for help." },
          styles: { fontSize: 13, color: "muted", align: "center", marginBottom: 8 },
        }),
        makeBlock("social", { styles: { align: "center", fontSize: 13 } }),
      ],
      { paddingY: 40 },
    ),
  );

  return blocks;
}

export const FORM_BUILDER_TEMPLATES: BuilderTemplate[] = FORM_SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  category: s.category,
  blurb: s.blurb,
  kind: "form",
  theme: s.theme,
  blocks: formBlocks(s),
}));

export const PAGE_BUILDER_TEMPLATES: BuilderTemplate[] = PAGE_SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  category: s.category,
  blurb: s.blurb,
  kind: "page",
  theme: s.theme,
  blocks: pageBlocks(s),
}));

export function templatesFor(kind: "form" | "page") {
  return kind === "form" ? FORM_BUILDER_TEMPLATES : PAGE_BUILDER_TEMPLATES;
}

export function categoriesFor(kind: "form" | "page") {
  return ["All", ...Array.from(new Set(templatesFor(kind).map((t) => t.category)))];
}

/** Fresh copy so a template applied twice never shares ids. */
export function instantiate(t: BuilderTemplate): { blocks: Block[]; theme: Theme } {
  const clone = (b: Block): Block => ({
    ...b,
    id: Math.random().toString(36).slice(2, 10),
    content: JSON.parse(JSON.stringify(b.content ?? {})),
    styles: { ...(b.styles ?? {}) },
    settings: { ...(b.settings ?? {}) },
    children: b.children?.map(clone),
  });
  return { blocks: t.blocks.map(clone), theme: { ...t.theme } };
}

export function blankDesign(kind: "form" | "page"): { blocks: Block[]; theme: Theme } {
  if (kind === "form")
    return {
      theme: { ...LIGHT_THEME },
      blocks: [
        section(
          [
            heading("Join our list", 36, { align: "center" }),
            text("Add a sentence about what people get.", { align: "center" }),
            form(defaultFields(), "Sign up"),
          ],
          { paddingY: 64, maxWidth: 560, align: "center" },
        ),
      ],
    };
  return {
    theme: { ...LIGHT_THEME },
    blocks: [
      section([heading("Your headline goes here", 48), text("Add a short supporting sentence."), form(defaultFields(), "Sign up")], {
        paddingY: 88,
        maxWidth: 720,
      }),
    ],
  };
}

export const DARK_STARTER = DARK_THEME;
