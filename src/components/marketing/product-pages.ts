import {
  BarChart3,
  Bell,
  Braces,
  Clock,
  Download,
  FileCheck2,
  Filter,
  Globe2,
  Image,
  LayoutTemplate,
  Link2,
  ListChecks,
  MessageSquare,
  MousePointerClick,
  Palette,
  Radio,
  Repeat,
  ShieldCheck,
  Sparkles,
  Split,
  Tags,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Content model for Xellvio's Platform pages.
 *
 * Navigation stays minimal — these pages carry the search intent, the product
 * explanation and the internal links that connect the ecosystem together.
 * Every claim here must map to functionality that exists in the product.
 */
export type ProductPageDef = {
  /** Route path, also used for canonical + sitemap. */
  path: string;
  /** Chain key from `ecosystem.tsx`, when this page is a step in the journey. */
  chainKey?: string;
  eyebrow: string;
  seoTitle: string;
  seoDescription: string;
  keywords?: string[];
  h1: string;
  heroBody: string;
  secondaryCta?: { label: string; to: string };
  subnav: { label: string; hash: string }[];
  stats: { value: string; label: string }[];
  /** Section 2 — the business problem, then how Xellvio answers it. */
  problem: { heading: string; body: string; points: string[]; answer: string };
  /** Section 3 — the real product experience. */
  experience: { heading: string; body: string; points: string[]; screen: string[] };
  /** Section 4 intro copy for the ecosystem chain. */
  connects: string;
  /** Section 5 — grouped, real capabilities. */
  features: { icon: LucideIcon; title: string; text: string }[];
  /** Section 6 — supported use cases. */
  useCases: { title: string; text: string }[];
  /** Section 7 — contextual internal links. */
  related: { label: string; to: string; text: string }[];
  /** Section 8 — visible FAQ (also emitted as FAQ schema). */
  faq: { q: string; a: string }[];
  /** Section 9. */
  cta: { title: string; body: string };
};

const DEMO = { label: "Get a demo", to: "/contact" };

const R = {
  sms: { label: "SMS marketing", to: "/sms-marketing", text: "Bulk and segmented text campaigns to 190+ countries." },
  email: { label: "Email marketing", to: "/email-marketing", text: "Campaigns and flows that share the same audience data." },
  emailToSms: { label: "Email to SMS", to: "/solutions/email-to-sms", text: "Send a text straight from your inbox." },
  automations: { label: "Automations", to: "/automations", text: "Trigger journeys from a sign-up, keyword, click or date." },
  pages: { label: "Landing pages", to: "/landing-pages", text: "Hosted pages built and published inside Xellvio." },
  forms: { label: "Sign-up forms", to: "/signup-forms", text: "Consent-first forms that grow your messaging list." },
  audiences: { label: "Audiences & segments", to: "/audiences", text: "Live lists that update as contacts change." },
  reporting: { label: "Reporting", to: "/reporting", text: "Delivery, clicks, spend and growth per campaign." },
  delivery: { label: "Global delivery", to: "/global-delivery", text: "Tier-1 routes with each country's sender rules handled." },
  compliance: { label: "Compliance", to: "/compliance", text: "Consent records, opt-outs, screening and verification." },
  templates: { label: "Templates", to: "/templates", text: "Ready-made pages, forms and automations to start from." },
  solutions: { label: "Industry solutions", to: "/solutions", text: "How Xellvio is used in retail, events, services and more." },
} as const;

export const PRODUCT_PAGES: Record<string, ProductPageDef> = {
  automations: {
    path: "/automations",
    chainKey: "automations",
    eyebrow: "Xellvio automations",
    seoTitle: "SMS Automation & Customer Journey Builder",
    seoDescription:
      "Build SMS automations in Xellvio: trigger journeys from sign-ups, keywords, link clicks or dates, add waits, conditions and branches, and let every message respect consent.",
    keywords: ["sms automation", "customer journey automation", "sms drip campaign", "automated text messages"],
    h1: "Automations that follow up so you don't have to",
    heroBody:
      "Draw the journey once on a visual canvas — a trigger, a wait, a condition, a text — and Xellvio runs it for every contact, day and night.",
    secondaryCta: { label: "See automation templates", to: "/templates/automations" },
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "The builder", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "10", label: "ready-made automation templates" },
      { value: "24/7", label: "runs without you" },
      { value: "1 canvas", label: "triggers, waits, branches" },
      { value: "Consent", label: "checked on every step" },
    ],
    problem: {
      heading: "Most leads are lost in the gap between interest and follow-up",
      body: "Someone fills in your form on Friday evening, or texts a keyword during a rush. If the reply comes days later, the moment has gone — and manually chasing every contact does not scale past a few dozen people.",
      points: [
        "Follow-up depends on someone remembering to send it.",
        "Timing drifts, so the message arrives after the intent has cooled.",
        "Different people get different treatment, so results are impossible to read.",
      ],
      answer:
        "Xellvio automations turn that follow-up into a workflow: the trigger fires the moment it happens, the wait is exact, and every contact gets the same considered sequence.",
    },
    experience: {
      heading: "A visual canvas, not a list of rules",
      body: "Drag steps onto the canvas, connect them, and see the whole journey at a glance. Xellvio checks the workflow before you switch it on, so orphaned steps or missing message text are caught up front.",
      points: [
        "Triggers for contact added, keyword received, link clicked, tag applied, date reached and list joined.",
        "Waits in minutes, hours or days, plus conditions and yes/no branches on contact fields, tags, consent and engagement.",
        "Actions to send SMS, add or remove tags, move contacts between lists, call a webhook, or exit the journey.",
        "Draft, activate, pause and edit safely — activation validation and autosave with undo/redo built in.",
      ],
      screen: ["Trigger: keyword JOIN", "Check consent", "Send SMS · welcome", "Wait 2 days", "If clicked → offer", "Else → exit"],
    },
    connects:
      "Automations sit in the middle of the platform: forms and pages feed contacts in, segments decide who qualifies, SMS and email carry the message, and reporting shows what the journey earned.",
    features: [
      { icon: Workflow, title: "Visual builder", text: "Build, rearrange and review the whole journey on one canvas." },
      { icon: Radio, title: "Real triggers", text: "Sign-ups, inbound keywords, link clicks, tags, dates and list changes." },
      { icon: Clock, title: "Precise waits", text: "Delay a step by minutes, hours or days before the next message." },
      { icon: Split, title: "Conditions & branches", text: "Split on consent, tags, fields or whether a link was clicked." },
      { icon: MessageSquare, title: "Personalised sends", text: "Merge first name and custom fields; shorten links automatically." },
      { icon: Braces, title: "Webhooks", text: "Push the event to your own systems as the journey runs." },
      { icon: ShieldCheck, title: "Consent-aware", text: "Opted-out contacts are skipped, not messaged again." },
      { icon: ListChecks, title: "Activity log", text: "See which contacts entered, where they are and what was sent." },
    ],
    useCases: [
      { title: "Welcome new subscribers", text: "Greet a new contact instantly, then follow up with a first-order offer two days later." },
      { title: "Keyword opt-in", text: "Someone texts JOIN, gets a confirmation, is tagged and added to the right list." },
      { title: "Follow up sign-up form leads", text: "A form submission starts a short sequence that qualifies the lead over a few days." },
      { title: "Re-engage quiet contacts", text: "Target people who haven't clicked in 60 days with a win-back message." },
      { title: "Clean the list", text: "Handle opt-outs and repeated delivery failures without touching a spreadsheet." },
      { title: "Date-based sends", text: "Birthday treats, renewal reminders and appointment nudges on the right day." },
    ],
    related: [R.forms, R.audiences, R.sms, R.reporting],
    faq: [
      { q: "Do I need to write code?", a: "No. Automations are built by dragging steps onto a canvas and filling in the message text and timings." },
      { q: "Can an automation reply to an inbound text?", a: "Yes. A keyword trigger fires when someone texts a word you choose, and the reply can go out immediately." },
      { q: "What happens if someone opts out mid-journey?", a: "They are suppressed straight away and the remaining steps are skipped for them." },
      { q: "Can I test before going live?", a: "Yes. Save the automation as a draft, simulate the path a contact would take, then activate when it reads correctly." },
      { q: "Does automation traffic cost the same as a campaign?", a: "Yes — automated messages are charged at the same per-message rate for the destination country." },
    ],
    cta: { title: "Build your first automation today", body: "Start from a template or an empty canvas, activate it, and let the follow-up run itself." },
  },

  "landing-pages": {
    path: "/landing-pages",
    chainKey: "pages",
    eyebrow: "Xellvio landing pages",
    seoTitle: "Landing Page Builder for Lead Capture",
    seoDescription:
      "Build and publish hosted landing pages in Xellvio: AI-assisted design, drag-and-drop sections, brand tokens, mobile previews, SEO and Open Graph settings, and leads that flow straight into your audiences.",
    keywords: ["landing page builder", "lead capture page", "hosted landing page", "sms landing page"],
    h1: "Landing pages that turn visits into contacts",
    heroBody:
      "Describe the page you want or start from a template, edit it visually, and publish it on a Xellvio link — with every lead landing in your audience instantly.",
    secondaryCta: { label: "Browse page templates", to: "/templates/landing-pages" },
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "The builder", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "16", label: "landing page templates" },
      { value: "AI", label: "builds the first draft" },
      { value: "1 click", label: "publish and update" },
      { value: "Leads", label: "saved, never lost" },
    ],
    problem: {
      heading: "A campaign is only as good as the page behind the link",
      body: "Sending traffic to a slow, generic or unbranded page wastes the message that earned the click. Building a proper page usually means a developer, a separate website tool, and a wait.",
      points: [
        "Website changes queue behind someone else's backlog.",
        "Leads arrive in a form tool that doesn't know your messaging lists.",
        "Nobody can tell which page actually converted.",
      ],
      answer:
        "Xellvio gives you the page, the hosting, the consent capture and the reporting in one place, so you can launch on the same day you plan the campaign.",
    },
    experience: {
      heading: "Design it visually, or just describe it",
      body: "The builder has a component library on the left, the canvas in the middle and properties on the right. Ask the AI assistant for a page and it writes the sections, copy and colours; then refine anything by hand.",
      points: [
        "Sections, headings, text, images, buttons, stats, testimonials, FAQ and form blocks.",
        "Brand tokens for colour, typography, radius and spacing keep every page consistent.",
        "Desktop, tablet and mobile previews, plus animation, hover and depth controls.",
        "Draft and published versions with version history, so you can update safely or restore.",
        "Per-page SEO title, description and social share image, and a switch to keep a page out of search.",
      ],
      screen: ["Hero · headline + form", "Benefits · 3 cards", "Proof · stats", "FAQ", "Closing CTA"],
    },
    connects:
      "A landing page is where the journey starts: the form on it creates the contact, segments organise them, an automation follows up, and reporting ties the leads back to the campaign that drove them.",
    features: [
      { icon: Sparkles, title: "AI design assistant", text: "Generate a full page from a prompt, then ask for edits in plain words." },
      { icon: LayoutTemplate, title: "Section templates", text: "16 real multi-section pages for launches, webinars, lead magnets and more." },
      { icon: Palette, title: "Brand tokens", text: "Set colour, type and spacing once and reuse them everywhere." },
      { icon: Image, title: "Media library", text: "Upload and reuse your own images, logos and backgrounds." },
      { icon: MousePointerClick, title: "Built-in forms", text: "Capture phone, email and custom fields with explicit SMS consent." },
      { icon: Globe2, title: "Hosted publishing", text: "Publish to a Xellvio link you can share and update at any time." },
      { icon: BarChart3, title: "Views & conversions", text: "See visits, submissions and conversion rate per page." },
      { icon: Download, title: "Lead export", text: "Export the leads a page collected whenever you need them." },
    ],
    useCases: [
      { title: "Lead magnet download", text: "Trade a guide or checklist for a phone number and consent." },
      { title: "Event or webinar registration", text: "Collect registrations, then text reminders before the session starts." },
      { title: "Product launch", text: "Announce a drop, capture interest and notify the list the moment it ships." },
      { title: "Local offer page", text: "Run a promo page per location or campaign without touching your website." },
      { title: "Waitlist", text: "Gather demand for something that isn't ready yet and message them first." },
    ],
    related: [R.forms, R.automations, R.sms, R.templates],
    faq: [
      { q: "Do I need my own website?", a: "No. Pages are hosted by Xellvio on a link you can share straight away, and you can point people to it from any campaign." },
      { q: "Can I edit a page after publishing?", a: "Yes. Edits stay in a draft until you publish again, and previous versions can be restored." },
      { q: "Will the page work on phones?", a: "Yes. Pages are responsive, and you can preview and adjust the mobile layout while editing." },
      { q: "Are leads added to my contacts automatically?", a: "Yes. Submissions become contacts with their consent recorded, and can be added to a list or trigger an automation." },
      { q: "Can a page stay out of Google?", a: "Yes. Each page has a search visibility switch, so a private page keeps its link but is excluded from search and the sitemap." },
    ],
    cta: { title: "Publish your first landing page", body: "Start from a template or describe the page you want, then share the link in your next campaign." },
  },

  "signup-forms": {
    path: "/signup-forms",
    chainKey: "forms",
    eyebrow: "Xellvio sign-up forms",
    seoTitle: "Online Sign-up Form Builder for SMS & Email Lists",
    seoDescription:
      "Grow your list with Xellvio sign-up forms: 16 templates, a visual editor, explicit SMS consent capture, duplicate protection, submission analytics and lead export — with contacts landing in your audiences instantly.",
    keywords: ["sign up form builder", "sms opt in form", "online form builder", "grow sms list"],
    h1: "Sign-up forms that grow a list you're allowed to text",
    heroBody:
      "Build a form in minutes, host it on a Xellvio link or embed it, and collect the phone number, the details and the consent you need — all in one submission.",
    secondaryCta: { label: "Browse form templates", to: "/templates/sign-up-forms" },
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "The builder", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "16", label: "form templates" },
      { value: "Consent", label: "captured and stored" },
      { value: "0", label: "leads lost to duplicates" },
      { value: "CSV", label: "export whenever you want" },
    ],
    problem: {
      heading: "A messaging list is worthless without provable consent",
      body: "Numbers scraped from orders or spreadsheets get you complaints, carrier filtering and opt-outs. Generic form tools collect the number but not the permission — and don't know anything about your messaging lists.",
      points: [
        "No record of what someone agreed to, or when.",
        "Duplicate and badly formatted numbers pollute every send.",
        "Leads sit in a separate tool until somebody exports them.",
      ],
      answer:
        "Xellvio forms capture the number, the explicit SMS consent wording and the timestamp together, then create the contact immediately.",
    },
    experience: {
      heading: "Pick a template, change what matters, publish",
      body: "The form editor uses the same visual builder as landing pages, so fields, copy, colours and layout are all editable — and the AI assistant can draft the whole thing from a sentence.",
      points: [
        "Phone, email, name and custom fields, with required-field control and validation.",
        "Editable consent text so the permission you record matches your policy.",
        "Live desktop and mobile preview while you edit, then one-click publish.",
        "Duplicate submissions are matched to the existing contact instead of creating clutter.",
        "Views, submissions and conversion rate per form, with lead export.",
      ],
      screen: ["First name", "Phone number", "☑ SMS consent text", "Submit → thank you", "Contact created"],
    },
    connects:
      "Forms are the front door: they create the contact, tag or list-assign it, hand it to an automation for follow-up, and every later campaign inherits that consent record.",
    features: [
      { icon: MousePointerClick, title: "Hosted or embedded", text: "Share the Xellvio link or place the form on your own site." },
      { icon: ShieldCheck, title: "Explicit consent", text: "Wording, checkbox and timestamp stored with the contact." },
      { icon: Sparkles, title: "AI drafting", text: "Describe the form and get fields, copy and styling to start from." },
      { icon: Tags, title: "Auto tagging & lists", text: "Route each submission to the right list or tag on arrival." },
      { icon: Users, title: "Duplicate protection", text: "Repeat sign-ups update the contact rather than duplicating it." },
      { icon: BarChart3, title: "Submission analytics", text: "Track views, conversions and performance per form." },
      { icon: Download, title: "Lead export", text: "Download submissions as CSV for your own records." },
      { icon: Palette, title: "On-brand styling", text: "Shared design tokens keep forms matching your pages." },
    ],
    useCases: [
      { title: "Newsletter and SMS opt-in", text: "One field, one consent line — the fastest way to start a list." },
      { title: "Quote or enquiry capture", text: "Collect the details you need to text a quote back the same day." },
      { title: "Event registration", text: "Register attendees and text reminders before the doors open." },
      { title: "In-store sign-up", text: "Run the form on a tablet at the counter to build a local list." },
      { title: "Loyalty or VIP list", text: "Let regulars opt in to early access and members-only offers." },
    ],
    related: [R.pages, R.audiences, R.automations, R.compliance],
    faq: [
      { q: "Can I use a form on my own website?", a: "Yes. Publish it on its Xellvio link, or place that link behind a button or embed on your site." },
      { q: "What consent does a form record?", a: "The wording shown, the checkbox state and the time of submission, stored against the contact for your records." },
      { q: "What if the same person signs up twice?", a: "Xellvio matches the number and updates the existing contact instead of creating a duplicate." },
      { q: "Can I add my own fields?", a: "Yes. Add custom fields and use them later for personalisation or segmentation." },
      { q: "Can a submission start a text sequence?", a: "Yes. A form submission is an automation trigger, so the follow-up can go out instantly." },
    ],
    cta: { title: "Start collecting consented contacts", body: "Publish a form today and let every sign-up flow straight into your audience." },
  },

  audiences: {
    path: "/audiences",
    chainKey: "audiences",
    eyebrow: "Xellvio audiences",
    seoTitle: "Contact Lists, Audiences & Segmentation",
    seoDescription:
      "Organise contacts in Xellvio: import with column mapping, build live segments on fields, tags, engagement and country, keep suppressions global, and reuse audiences across SMS, email and automations.",
    keywords: ["contact segmentation", "sms contact lists", "audience segmentation", "contact management"],
    h1: "Audiences and segments that stay up to date",
    heroBody:
      "Import your contacts, organise them into lists, and let segments rebuild themselves as behaviour changes — so every send goes to the right people.",
    secondaryCta: DEMO,
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "In the product", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "Live", label: "segments update themselves" },
      { value: "CSV", label: "import with column mapping" },
      { value: "Global", label: "suppression list" },
      { value: "Shared", label: "across SMS and email" },
    ],
    problem: {
      heading: "One big list is the reason messages feel like spam",
      body: "When everyone gets the same text, the offer is irrelevant to most of them. Opt-outs climb, delivery quality drops, and the cost per result gets worse with every send.",
      points: [
        "Spreadsheets go stale the day after they're exported.",
        "Nobody knows who has already bought, replied or unsubscribed.",
        "Numbers in mixed formats fail silently at send time.",
      ],
      answer:
        "Xellvio keeps one contact record per person, with lists, tags and live segments on top — so targeting is a filter, not an export.",
    },
    experience: {
      heading: "Import cleanly, then slice with confidence",
      body: "The importer lets you map each column yourself — phone, first name, last name, country — preview the rows, and untick anything you don't want. Large files stream in the background so the browser never stalls.",
      points: [
        "Map columns manually, exclude rows, and see invalid numbers before anything is saved.",
        "Numbers are normalised to international format with the country detected from the dialling code.",
        "Segments filter on contact fields, tags, list membership, country, consent and engagement such as clicks or replies.",
        "Suppressions and opt-outs are global, so a STOP anywhere applies everywhere.",
        "Every list and segment is reusable in campaigns, automations and flows.",
      ],
      screen: ["Contacts · 42,318", "Segment: clicked in 30 days", "Segment: VIP tag + US", "Suppressed · 812", "Import running…"],
    },
    connects:
      "Audiences are the shared spine: forms and pages add contacts, segments choose who is eligible, automations act on them, campaigns send to them, and reporting reads back against the same records.",
    features: [
      { icon: Filter, title: "Live segments", text: "Rules-based audiences that refresh as contacts change." },
      { icon: Tags, title: "Tags & custom fields", text: "Label contacts and store the data you personalise with." },
      { icon: Users, title: "Lists", text: "Group contacts by source, location, campaign or membership." },
      { icon: Download, title: "Guided import", text: "Manual column mapping, row exclusion and streaming for big files." },
      { icon: Globe2, title: "Country awareness", text: "Numbers normalised and grouped by destination country." },
      { icon: ShieldCheck, title: "Global suppression", text: "Opt-outs and hard failures are never messaged again." },
      { icon: Repeat, title: "Reusable everywhere", text: "The same audience powers SMS, email and automations." },
      { icon: ListChecks, title: "Consent visibility", text: "See marketing and transactional permission per contact." },
    ],
    useCases: [
      { title: "Recent engagers", text: "Text the people who clicked in the last 30 days with the next offer." },
      { title: "Location targeting", text: "Send store, city or country specific messages from one contact base." },
      { title: "VIP and loyalty", text: "Give your best customers early access using a tag-based segment." },
      { title: "Lapsed customers", text: "Find contacts with no engagement in 60+ days and win them back." },
      { title: "Source reporting", text: "Compare lists by sign-up source to see which channel grows fastest." },
    ],
    related: [R.forms, R.automations, R.sms, R.reporting],
    faq: [
      { q: "How do I get my contacts in?", a: "Upload a CSV and map each column yourself. You can untick rows you don't want, and large files import in the background." },
      { q: "Do segments update automatically?", a: "Yes. A segment is a set of rules, so contacts join and leave it as their data and behaviour change." },
      { q: "What happens to opt-outs?", a: "They go to a global suppression list and are excluded from every future campaign and automation." },
      { q: "Can I use the same audience for SMS and email?", a: "Yes. Contacts are shared, with SMS and email permission stored separately so each channel respects its own consent." },
      { q: "Are my contacts isolated from other businesses?", a: "Yes. Every workspace's data is separated at the database level and only reachable by that workspace." },
    ],
    cta: { title: "Bring your contacts into Xellvio", body: "Import once, segment freely, and send to people who actually want to hear from you." },
  },

  reporting: {
    path: "/reporting",
    chainKey: "reporting",
    eyebrow: "Xellvio reporting",
    seoTitle: "Marketing Reporting: Delivery, Clicks & Spend",
    seoDescription:
      "Measure every send in Xellvio: delivery and failure reasons from the carrier, click tracking on shortened links, spend per country and message part, list growth and opt-out trends, plus CSV export.",
    keywords: ["marketing reporting", "sms delivery report", "sms click tracking", "campaign analytics"],
    h1: "Reporting that tells you what the send actually did",
    heroBody:
      "Delivery straight from the carrier, clicks from your own short links, and the exact spend per country — per campaign, down to the cent.",
    secondaryCta: DEMO,
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "In the product", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "Per country", label: "delivery and spend" },
      { value: "Live", label: "counts while sending" },
      { value: "Clicks", label: "tracked per campaign" },
      { value: "CSV", label: "export any report" },
    ],
    problem: {
      heading: "\"Sent\" is not the same as \"delivered\", and neither means \"worked\"",
      body: "Many tools stop at the number of messages submitted. That hides carrier rejections, hides which country underperformed, and makes it impossible to tie spend to results.",
      points: [
        "No visibility of why a message failed.",
        "Clicks either untracked or mixed up between campaigns.",
        "Spend reported as a lump sum, not per country or per message part.",
      ],
      answer:
        "Xellvio records the carrier's final status for every message, the clicks on every shortened link, and the cost of each message part — so the report reconciles with reality.",
    },
    experience: {
      heading: "One report per campaign, with the detail underneath",
      body: "Open a campaign to see attempted, delivered, failed and not-delivered counts as they land, then drill into country breakdowns, failure reasons and click activity.",
      points: [
        "Carrier delivery receipts reconciled in the background, including late results.",
        "Failure reasons kept per message, so filtering or bad numbers are visible, not guessed.",
        "Click tracking through shortened links, with your own click domain if you want one.",
        "Spend per country and per message part, including MMS priced separately from SMS.",
        "Audience growth, opt-out and engagement trends over time, exportable as CSV.",
      ],
      screen: ["Attempted 19,993", "Delivered 18,742", "Not delivered 1,251", "Clicks 143", "Spend $239.94"],
    },
    connects:
      "Reporting closes the loop: it reads campaign, automation, page and form activity against the same contact records, so you can trace revenue back to the sign-up that started it.",
    features: [
      { icon: BarChart3, title: "Campaign reports", text: "Delivery, failures, clicks and spend for every send." },
      { icon: Globe2, title: "Country breakdown", text: "Performance and cost split by destination country." },
      { icon: Link2, title: "Short-link clicks", text: "Per-campaign click counts on automatically shortened links." },
      { icon: Wallet, title: "Spend accuracy", text: "Charges by message part, with MMS rated separately." },
      { icon: Bell, title: "Reply visibility", text: "Inbound replies counted and surfaced in your inbox." },
      { icon: Users, title: "Audience trends", text: "Growth, opt-outs and engagement over time." },
      { icon: Download, title: "Exports", text: "Download reports for finance, clients or your own analysis." },
      { icon: FileCheck2, title: "Reconciliation", text: "Late carrier results update the report instead of being lost." },
    ],
    useCases: [
      { title: "Prove campaign ROI", text: "Compare spend against clicks and conversions for each send." },
      { title: "Diagnose a bad send", text: "See the failure reason and country behind a low delivery rate." },
      { title: "Choose the better message", text: "Run variants and compare click rate on the same audience." },
      { title: "Control cost", text: "Watch spend per country before scaling a campaign internationally." },
      { title: "Client reporting", text: "Export the numbers you need for a monthly summary." },
    ],
    related: [R.sms, R.automations, R.audiences, R.delivery],
    faq: [
      { q: "Where do delivery statuses come from?", a: "From the carrier's delivery receipts, reconciled in the background so late results still update the report." },
      { q: "What does \"not delivered\" mean?", a: "The carrier returned a final result that wasn't a delivery — for example an invalid number or filtering. The reason is shown per message and those contacts can be resent." },
      { q: "How is click tracking done?", a: "Links are shortened at send time and clicks are attributed to that campaign. You can use a Xellvio domain or your own click domain." },
      { q: "Can I see how much a campaign cost?", a: "Yes. Spend is calculated per message part at the destination country's rate and shown on the campaign report." },
      { q: "Can I export the data?", a: "Yes. Campaign and audience reports export as CSV." },
    ],
    cta: { title: "See your next send in full detail", body: "Create an account and get carrier-level delivery, click and spend reporting from your first campaign." },
  },

  "global-delivery": {
    path: "/global-delivery",
    eyebrow: "Xellvio global delivery",
    seoTitle: "Global SMS Delivery to 190+ Countries",
    seoDescription:
      "Send SMS worldwide with Xellvio: tier-1 carrier routes to 190+ countries, sender IDs, toll-free and 10DLC registration handled in-app, throughput of thousands of messages a minute, and per-country pricing shown before you send.",
    keywords: ["international sms", "global sms delivery", "bulk sms 190 countries", "sms sender id"],
    h1: "Global delivery with each country's rules handled",
    heroBody:
      "Xellvio routes your messages over tier-1 carriers in 190+ countries and manages the sender identity each market requires — so you don't manage carrier paperwork.",
    secondaryCta: { label: "See per-country pricing", to: "/pricing" },
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "How it works", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "190+", label: "countries reached" },
      { value: "5,000", label: "messages per minute" },
      { value: "Tier-1", label: "carrier routes" },
      { value: "In-app", label: "sender registration" },
    ],
    problem: {
      heading: "Every country has its own sending rules, and carriers enforce them",
      body: "The same message that sails through in the UK can be blocked in the US without registration, or rejected in the Gulf without a pre-approved sender. Learning that at send time costs you the campaign.",
      points: [
        "Unregistered US and Canadian local numbers get filtered by carriers.",
        "Some markets require a whitelisted sender ID before a single message lands.",
        "Provider portals and paperwork sit outside the tool you actually send from.",
      ],
      answer:
        "Xellvio checks the destination rules for you, provisions the right sender type, and blocks sends that would be filtered instead of quietly wasting your credits.",
    },
    experience: {
      heading: "The right sender for the country, arranged in-app",
      body: "Xellvio picks or requests the correct sender identity per market: an alphanumeric sender ID where those are open, a verified toll-free number for the US and Canada, or a registered local number where that's required.",
      points: [
        "Open sender-ID markets such as the UK, EU, Australia and Singapore can go live immediately.",
        "US and Canada run through a guided toll-free verification wizard, tracked in-app.",
        "US local sending requires 10DLC registration; unregistered local sends are blocked rather than filtered.",
        "Registration-required destinations are filed on your behalf and their status shown in the product.",
        "Sharded dispatch sustains thousands of messages a minute on large launches, with live counts.",
      ],
      screen: ["UK · sender ID · live", "US · toll-free · verified", "Kuwait · registration filed", "Nigeria · route active", "Throughput 5,000/min"],
    },
    connects:
      "Delivery underpins everything you send: segments decide the destination mix, compliance decides who is eligible, and reporting shows delivery and spend per country.",
    features: [
      { icon: Globe2, title: "190+ countries", text: "Tier-1 routes with per-country rate cards." },
      { icon: FileCheck2, title: "Sender verification", text: "Toll-free and 10DLC registration handled inside Xellvio." },
      { icon: Radio, title: "Two-way numbers", text: "Replies route back to the account that sent the campaign." },
      { icon: Image, title: "MMS support", text: "Send images where the destination supports them, priced accordingly." },
      { icon: Clock, title: "High throughput", text: "Large audiences clear in minutes, not hours." },
      { icon: Wallet, title: "Transparent rates", text: "Cost per message part shown before you confirm a send." },
      { icon: ShieldCheck, title: "Protective checks", text: "Sends that carriers would filter are stopped up front." },
      { icon: BarChart3, title: "Delivery insight", text: "Carrier statuses and failure reasons per country." },
    ],
    useCases: [
      { title: "International launches", text: "One campaign, many countries, each with the correct sender." },
      { title: "US and Canada campaigns", text: "Use a verified toll-free number instead of risking filtered local traffic." },
      { title: "Time-critical alerts", text: "Push urgent notices to a large list within minutes." },
      { title: "Regional promos", text: "Split by country to respect local rules, timing and language." },
      { title: "Multi-brand sending", text: "Run separate sender identities for different brands or regions." },
    ],
    related: [R.sms, R.compliance, R.reporting, R.emailToSms],
    faq: [
      { q: "Do I need my own phone number or sender ID?", a: "No. Xellvio provisions the sender your destination requires — a sender ID, a verified toll-free number or a registered local number." },
      { q: "How long does US toll-free verification take?", a: "It depends on the carrier review, and Xellvio shows the current status in-app throughout. You can send to other countries while it's in progress." },
      { q: "Why was my US local send blocked?", a: "US local numbers must be registered under 10DLC. Xellvio blocks unregistered local sends because carriers would filter them, and offers verified toll-free instead." },
      { q: "How fast can a large campaign go out?", a: "Dispatch is parallelised and sustains thousands of messages a minute; a 20,000-recipient campaign typically clears in minutes." },
      { q: "How do I know the cost per country?", a: "Rates are shown per destination before you send, and actual spend is reported per country afterwards." },
    ],
    cta: { title: "Send to your first new market", body: "Create an account, check the rate for your destination and let Xellvio arrange the sender." },
  },

  compliance: {
    path: "/compliance",
    eyebrow: "Xellvio compliance",
    seoTitle: "SMS Compliance: Consent, Opt-outs & Verification",
    seoDescription:
      "Stay compliant with Xellvio: explicit consent capture and records, automatic STOP handling and global suppression, content screening, sender verification, and data separation for every workspace.",
    keywords: ["sms compliance", "sms consent management", "sms opt out handling", "tcpa sms compliance"],
    h1: "Compliance built into every send, not bolted on",
    heroBody:
      "Consent is captured where the contact signs up, opt-outs are honoured everywhere for good, and risky content is screened before it reaches a carrier.",
    secondaryCta: { label: "Read our policies", to: "/aup" },
    subnav: [
      { label: "Why it matters", hash: "#problem" },
      { label: "How it works", hash: "#experience" },
      { label: "How it connects", hash: "#connects" },
      { label: "Features", hash: "#features" },
      { label: "Use cases", hash: "#use-cases" },
      { label: "FAQ", hash: "#faq" },
    ],
    stats: [
      { value: "STOP", label: "handled automatically" },
      { value: "Global", label: "suppression across sends" },
      { value: "Stored", label: "consent proof per contact" },
      { value: "Screened", label: "content before dispatch" },
    ],
    problem: {
      heading: "One careless send can cost you the channel",
      body: "Messaging people who never agreed, or ignoring an opt-out, leads to complaints, carrier filtering and regulatory exposure. And when a complaint arrives, you need to show what the contact agreed to.",
      points: [
        "No proof of consent when someone disputes a message.",
        "Opt-outs respected in one campaign but not the next.",
        "Content that trips carrier filters taking a whole send down with it.",
      ],
      answer:
        "Xellvio records consent at the source, enforces suppression platform-wide, and screens message content and links before dispatch.",
    },
    experience: {
      heading: "The guardrails run automatically",
      body: "You don't have to remember the rules on every send: consent, suppression, sender identity and content checks are applied before a campaign leaves the queue.",
      points: [
        "Marketing and transactional consent stored separately, with the wording and timestamp from the form or page.",
        "STOP and local equivalents suppress the contact instantly and permanently, across every campaign and automation.",
        "Opt-in proof is retrievable per contact when you need to answer a complaint.",
        "Content screening flags prohibited categories and high-risk links before a carrier can reject them.",
        "Sender verification — toll-free and 10DLC — is tracked in-app so you only send from approved identities.",
      ],
      screen: ["Consent · form, 12 Mar", "STOP → suppressed", "Screening · passed", "Sender · verified", "Audit trail kept"],
    },
    connects:
      "Compliance touches the whole journey: forms capture permission, audiences hold suppressions, automations skip opted-out contacts, delivery uses approved senders, and reporting shows opt-out trends.",
    features: [
      { icon: ShieldCheck, title: "Consent records", text: "Wording, source and timestamp kept with each contact." },
      { icon: ListChecks, title: "Automatic opt-outs", text: "STOP and local keywords suppress instantly and forever." },
      { icon: FileCheck2, title: "Opt-in proof", text: "Retrieve the permission trail for any contact on request." },
      { icon: Filter, title: "Content screening", text: "Prohibited categories and risky links stopped pre-dispatch." },
      { icon: Globe2, title: "Local rules", text: "Country sender requirements applied per destination." },
      { icon: Users, title: "Workspace isolation", text: "Each business's data is separated at the database level." },
      { icon: Braces, title: "Role controls", text: "Invite teammates with only the permissions they need." },
      { icon: Bell, title: "Policy transparency", text: "Published acceptable use, anti-spam and consent terms." },
    ],
    useCases: [
      { title: "Answer a complaint", text: "Show exactly when and how a contact opted in." },
      { title: "Keep a clean list", text: "Let suppression and delivery failures maintain quality automatically." },
      { title: "Onboard a team safely", text: "Give staff campaign access without exposing billing or settings." },
      { title: "Enter a regulated market", text: "Use the sender identity and consent rules that country requires." },
      { title: "Protect deliverability", text: "Screen content and links so carriers keep accepting your traffic." },
    ],
    related: [R.forms, R.delivery, R.audiences, R.solutions],
    faq: [
      { q: "Does Xellvio handle STOP for me?", a: "Yes. STOP and its local equivalents are processed automatically, and the contact is suppressed across every campaign and automation from that moment." },
      { q: "Where is consent stored?", a: "With the contact — including the consent wording shown, the source form or page and the timestamp." },
      { q: "Why was my message flagged?", a: "Content screening blocks prohibited categories and links from domains carriers commonly reject. The reason is shown so you can adjust and resend." },
      { q: "Is my data separate from other businesses?", a: "Yes. Each workspace's records are isolated at the database level, and access is scoped to that workspace's users." },
      { q: "Does compliance replace my own legal advice?", a: "No. Xellvio gives you the controls and records; the rules that apply to your business and market remain your responsibility." },
    ],
    cta: { title: "Send with the guardrails on", body: "Create an account and start from consented sign-ups, automatic opt-outs and screened content." },
  },
};
