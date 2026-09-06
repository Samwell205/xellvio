/**
 * Content model for the Xellvio comparison pages ("/compare").
 *
 * Honesty rules for this file:
 * - Xellvio columns describe functionality that exists in the product today.
 * - Competitor columns stay at the level of publicly stated positioning
 *   (who the tool is built for, which markets it focuses on, what it leaves to
 *   you). No invented prices, no invented delivery rates, no invented feature
 *   claims, no fabricated reviews or customer numbers.
 * - Every page carries a visible note that competitor details change and should
 *   be checked on their own site.
 */

export type CompareRow = {
  /** What is being compared, in plain language. */
  dimension: string;
  /** Factual Xellvio answer. */
  xellvio: string;
  /** Publicly stated positioning of the other platform. */
  rival: string;
  /** Marks the rows where Xellvio is clearly the stronger fit. */
  edge?: boolean;
};

export type CompareDef = {
  /** URL slug: /compare/{slug} */
  slug: string;
  /** Display name of the other platform. */
  rival: string;
  /** Short category label, e.g. "Enterprise ecommerce SMS". */
  rivalCategory: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  heroBody: string;
  /** One-paragraph, even-handed summary shown above the table. */
  verdict: string;
  /** Three headline reasons businesses pick Xellvio in this matchup. */
  reasons: { title: string; text: string }[];
  /** Comparison table rows. */
  rows: CompareRow[];
  /** Honest "they may suit you better if…" bullets. */
  theirStrengths: string[];
  faq: { q: string; a: string }[];
};

/** Rows that are true in every matchup — the Xellvio side never changes. */
const X = {
  reach:
    "One account sends to 190+ countries, with each country's sender rules handled inside Xellvio.",
  inbox: "Two-way inbox included: replies land in Xellvio and can trigger automations.",
  builder:
    "Landing pages and sign-up forms with an AI design assistant, templates and hosted publishing.",
  automations:
    "Visual automations triggered by sign-ups, keywords, clicks, tags, dates or list changes.",
  segments: "Live segments on behaviour, location, spend or any custom field.",
  reporting:
    "Delivery, clicks, opt-outs and spend per campaign, per country and per message part.",
  pricing: "Top up credits and pay per message part at the destination country's rate.",
  senders:
    "Sender IDs, toll-free verification and 10DLC registration are requested and tracked in-app.",
  compliance:
    "Consent stored separately for marketing and transactional, automatic STOP handling, permanent suppression and content screening.",
  email: "Email campaigns and flows share the same contacts, segments and reporting.",
  api: "Developer API and webhooks for sends, contacts and events.",
} as const;

/** Rows shared by most comparisons, so each page stays consistent and honest. */
function baseRows(rival: {
  reach: string;
  inbox: string;
  builder: string;
  automations: string;
  reporting: string;
  pricing: string;
  senders: string;
  email: string;
}): CompareRow[] {
  return [
    { dimension: "Countries you can text", xellvio: X.reach, rival: rival.reach, edge: true },
    { dimension: "Two-way conversations", xellvio: X.inbox, rival: rival.inbox },
    {
      dimension: "Landing pages & sign-up forms",
      xellvio: X.builder,
      rival: rival.builder,
      edge: true,
    },
    { dimension: "Automations", xellvio: X.automations, rival: rival.automations },
    { dimension: "Segmentation", xellvio: X.segments, rival: "Varies by plan — check their current plan pages." },
    { dimension: "Reporting", xellvio: X.reporting, rival: rival.reporting },
    { dimension: "How you pay", xellvio: X.pricing, rival: rival.pricing },
    { dimension: "Getting a sender approved", xellvio: X.senders, rival: rival.senders, edge: true },
    { dimension: "Email in the same account", xellvio: X.email, rival: rival.email },
    { dimension: "Consent & opt-outs", xellvio: X.compliance, rival: "Opt-out handling is standard across the category." },
    { dimension: "API access", xellvio: X.api, rival: "Available on most platforms — check their developer docs." },
  ];
}

const NOTE_US = "Positioned mainly around US and Canada texting.";
const NOTE_SELF = "You bring your own pages and forms, or connect a separate tool.";

export const COMPARISONS: CompareDef[] = [
  {
    slug: "xellvio-vs-attentive",
    rival: "Attentive",
    rivalCategory: "Enterprise ecommerce SMS",
    seoTitle: "Xellvio vs Attentive: SMS Marketing Comparison",
    seoDescription:
      "Compare Xellvio and Attentive on global reach, two-way texting, automations, landing pages, sender approval and how you pay for messages.",
    h1: "Xellvio vs Attentive",
    heroBody:
      "Attentive is built for large ecommerce brands with managed onboarding. Xellvio gives any business the same building blocks — global SMS, automations, pages and forms — on self-serve credits you control.",
    verdict:
      "Attentive is aimed at high-volume retail brands, largely in North America, with sales-led onboarding and contracts. Xellvio is a self-serve platform you can start the same afternoon, sends in 190+ countries, and bundles the sign-up forms, landing pages and automations you would otherwise buy separately.",
    reasons: [
      {
        title: "Start today, no contract call",
        text: "Create an account, top up credits and send. Nothing is gated behind an annual commitment.",
      },
      {
        title: "Global from the first send",
        text: "One account covers 190+ countries, with sender rules for each market handled in-app.",
      },
      {
        title: "Growth tools included",
        text: "Sign-up forms, hosted landing pages and automations come with the platform, not as add-ons.",
      },
    ],
    rows: baseRows({
      reach: "Focused on North American ecommerce programmes.",
      inbox: "Two-way messaging supported within its own experience.",
      builder: "Strong on-site sign-up units; pages typically live on your store.",
      automations: "Retail journeys built around ecommerce events.",
      reporting: "Deep ecommerce revenue attribution.",
      pricing: "Sales-led plans and contracts.",
      senders: "Handled with managed onboarding support.",
      email: "Email is offered alongside SMS.",
    }),
    theirStrengths: [
      "You are a large retail brand wanting a managed, done-for-you programme.",
      "You need deep, out-of-the-box revenue attribution against a single storefront.",
      "You prefer an assigned strategist over self-serve tooling.",
    ],
    faq: [
      {
        q: "Can Xellvio replace Attentive for an ecommerce store?",
        a: "For campaigns, keyword opt-ins, sign-up forms, automations and click and spend reporting, yes. If your programme depends on a managed strategist team, that is a service difference rather than a feature one.",
      },
      {
        q: "Do I need a contract to use Xellvio?",
        a: "No. You top up credits and pay per message part at the destination country's rate.",
      },
    ],
  },
  {
    slug: "xellvio-vs-simpletexting",
    rival: "SimpleTexting",
    rivalCategory: "US business texting",
    seoTitle: "Xellvio vs SimpleTexting: SMS Platform Comparison",
    seoDescription:
      "Compare Xellvio and SimpleTexting on international reach, credits versus monthly plans, automations, landing pages, forms and sender approval.",
    h1: "Xellvio vs SimpleTexting",
    heroBody:
      "SimpleTexting is a well-known US texting tool. Xellvio adds worldwide delivery, credit-based pricing and a built-in page and form builder to the same everyday texting work.",
    verdict:
      "Both platforms handle lists, campaigns, keywords and two-way replies. The difference shows up when you text outside North America, when you would rather pay per message than per month, and when you want your landing pages and sign-up forms in the same account.",
    reasons: [
      {
        title: "Text beyond North America",
        text: "190+ countries from one account, with local sender rules handled for you.",
      },
      {
        title: "Pay for what you send",
        text: "Credits, not a monthly message allowance you either overrun or waste.",
      },
      {
        title: "Pages and forms included",
        text: "Build the landing page and the sign-up form that feed the list, in Xellvio.",
      },
    ],
    rows: baseRows({
      reach: NOTE_US,
      inbox: "Shared inbox for two-way texting.",
      builder: "Sign-up forms and simple landing pages offered.",
      automations: "Autoresponders, drips and scheduled campaigns.",
      reporting: "Campaign and keyword reporting.",
      pricing: "Monthly plans by contact or message volume.",
      senders: "US toll-free and 10DLC support.",
      email: "Primarily an SMS product.",
    }),
    theirStrengths: [
      "You only ever text US or Canadian numbers.",
      "You prefer a fixed monthly bill to usage-based credits.",
    ],
    faq: [
      {
        q: "Can I text internationally with Xellvio?",
        a: "Yes — 190+ countries from the same account, and the price for each destination is shown before you send.",
      },
      {
        q: "Is there a monthly fee?",
        a: "You buy credits and spend them on messages, so there is no monthly allowance to overrun.",
      },
    ],
  },
  {
    slug: "xellvio-vs-textmagic",
    rival: "Textmagic",
    rivalCategory: "Business SMS",
    seoTitle: "Xellvio vs Textmagic: SMS Platform Comparison",
    seoDescription:
      "Compare Xellvio and Textmagic on marketing automation, landing pages and forms, segmentation, global sending and per-message pricing.",
    h1: "Xellvio vs Textmagic",
    heroBody:
      "Textmagic covers business texting and email-to-SMS. Xellvio covers the same ground and adds the marketing layer: segments, automations, hosted pages, forms and revenue reporting.",
    verdict:
      "If you mainly need to send operational texts, both work. If you are running a marketing programme — growing a list, segmenting it, automating follow-ups and measuring clicks and spend — Xellvio is built around that end to end.",
    reasons: [
      {
        title: "A marketing platform, not just a sender",
        text: "Segments, automations, templates and campaign reporting in one place.",
      },
      {
        title: "Grow the list in the same tool",
        text: "AI-built landing pages and consent-first sign-up forms feed your lists directly.",
      },
      {
        title: "Email to SMS too",
        text: "Send a text straight from your inbox when that is the fastest route.",
      },
    ],
    rows: baseRows({
      reach: "International SMS sending supported.",
      inbox: "Two-way texting and email-to-SMS.",
      builder: NOTE_SELF,
      automations: "Scheduling and rule-based sending.",
      reporting: "Delivery and message-level reporting.",
      pricing: "Pay-as-you-go per message, plus plan options.",
      senders: "Sender ID and number options by country.",
      email: "Email-to-SMS rather than email marketing.",
    }),
    theirStrengths: [
      "Your use case is purely operational alerts, with no marketing programme around it.",
      "Your team already works entirely from email-to-SMS.",
    ],
    faq: [
      {
        q: "Does Xellvio support email to SMS?",
        a: "Yes. You can send a text from your inbox, and it is tracked like any other Xellvio message.",
      },
      {
        q: "Can I move my existing contacts over?",
        a: "Yes — import a CSV, keep your consent records, and existing opt-outs stay suppressed.",
      },
    ],
  },
  {
    slug: "xellvio-vs-textla",
    rival: "Textla",
    rivalCategory: "US SMS for small business",
    seoTitle: "Xellvio vs Textla: SMS Platform Comparison",
    seoDescription:
      "Compare Xellvio and Textla on international delivery, automations, landing pages and sign-up forms, reporting depth and sender registration.",
    h1: "Xellvio vs Textla",
    heroBody:
      "Textla focuses on straightforward US texting for small teams. Xellvio keeps that simplicity and adds global delivery, deeper automation and the tools that grow your list.",
    verdict:
      "Textla is a lean option for basic US campaigns. Xellvio suits businesses that also text other countries, want journeys rather than one-off blasts, and want their sign-up forms, pages and reporting in the same account.",
    reasons: [
      { title: "Worldwide, not US-only", text: "190+ countries, with sender requirements handled per market." },
      { title: "Automations that keep working", text: "Welcome series, keyword replies and win-backs run on their own." },
      { title: "One account for the whole funnel", text: "Page, form, list, campaign, report — nothing bolted on." },
    ],
    rows: baseRows({
      reach: NOTE_US,
      inbox: "Two-way texting supported.",
      builder: NOTE_SELF,
      automations: "Basic scheduling and autoresponders.",
      reporting: "Core delivery reporting.",
      pricing: "Per-message pricing on US traffic.",
      senders: "US toll-free and 10DLC support.",
      email: "SMS-focused.",
    }),
    theirStrengths: [
      "You want the smallest possible US-only texting tool.",
      "You have no need for automations, forms or landing pages.",
    ],
    faq: [
      {
        q: "Is Xellvio harder to learn?",
        a: "Sending a campaign takes the same few steps. The extra capability sits in automations, forms and reporting, which you can ignore until you need them.",
      },
      {
        q: "Do you handle 10DLC registration?",
        a: "Yes — you request it in-app and track its status without dealing with a provider portal.",
      },
    ],
  },
  {
    slug: "xellvio-vs-slicktext",
    rival: "SlickText",
    rivalCategory: "US SMS marketing",
    seoTitle: "Xellvio vs SlickText: SMS Marketing Comparison",
    seoDescription:
      "Compare Xellvio and SlickText on global reach, credit-based pricing, automations, AI-built landing pages, sign-up forms and campaign reporting.",
    h1: "Xellvio vs SlickText",
    heroBody:
      "SlickText is a long-standing US SMS marketing tool. Xellvio matches the campaign and keyword workflow, then extends it worldwide with usage-based credits.",
    verdict:
      "Both do lists, keywords, campaigns and autoresponders well. Choose Xellvio if you text internationally, want to pay per message rather than per plan tier, or want the landing page and form builder included.",
    reasons: [
      { title: "190+ countries", text: "Send to the same audience wherever they are, from one account." },
      { title: "Credits, not tiers", text: "No plan ceiling to bump into before a big launch." },
      { title: "AI page and form builder", text: "Describe the page you want and edit what the assistant produces." },
    ],
    rows: baseRows({
      reach: NOTE_US,
      inbox: "Two-way texting and keyword replies.",
      builder: "Sign-up forms and simple pages available.",
      automations: "Drips and autoresponders.",
      reporting: "Campaign, keyword and link reporting.",
      pricing: "Monthly plan tiers by message volume.",
      senders: "US toll-free and 10DLC support.",
      email: "SMS-focused.",
    }),
    theirStrengths: [
      "Your audience is entirely in the US.",
      "You want a predictable monthly plan rather than usage-based spend.",
    ],
    faq: [
      {
        q: "Can I keep my keywords?",
        a: "You can recreate keyword opt-ins in Xellvio; the exact word depends on availability on your new sender.",
      },
      {
        q: "How is spend reported?",
        a: "Per campaign, per country and per message part, so you can see exactly where credits went.",
      },
    ],
  },
  {
    slug: "xellvio-vs-salesmsg",
    rival: "Salesmsg",
    rivalCategory: "Sales team texting",
    seoTitle: "Xellvio vs Salesmsg: SMS Platform Comparison",
    seoDescription:
      "Compare Xellvio and Salesmsg on marketing campaigns, global delivery, automations, landing pages and sign-up forms, and per-message pricing.",
    h1: "Xellvio vs Salesmsg",
    heroBody:
      "Salesmsg is built around sales reps texting from a CRM. Xellvio is built around marketing programmes: growing a list, segmenting it, automating it and measuring it.",
    verdict:
      "If your priority is one-to-one rep conversations tied to a CRM record, Salesmsg is designed for that. If your priority is marketing at scale — campaigns, keyword growth, journeys, click and spend reporting, worldwide delivery — Xellvio is the closer fit.",
    reasons: [
      { title: "Built for campaigns", text: "Segments, scheduling, templates and per-campaign reporting as the core." },
      { title: "Worldwide delivery", text: "190+ countries with local sender rules handled." },
      { title: "List growth included", text: "Hosted pages, forms and keyword opt-ins that fill your lists." },
    ],
    rows: baseRows({
      reach: NOTE_US,
      inbox: "Strong per-rep inbox experience.",
      builder: NOTE_SELF,
      automations: "Sales sequences and CRM-triggered messages.",
      reporting: "Conversation and rep activity reporting.",
      pricing: "Per-seat monthly plans.",
      senders: "US numbers and 10DLC support.",
      email: "CRM email lives in your CRM.",
    }),
    theirStrengths: [
      "Reps need to text from inside a CRM record all day.",
      "You want per-seat inboxes and call features rather than marketing campaigns.",
    ],
    faq: [
      {
        q: "Can my team share an inbox in Xellvio?",
        a: "Yes. Replies land in a shared two-way inbox, and teammates can be invited with roles and permissions.",
      },
      {
        q: "Is Xellvio priced per seat?",
        a: "No. You pay for the messages you send with credits.",
      },
    ],
  },
  {
    slug: "xellvio-vs-ez-texting",
    rival: "EZ Texting",
    rivalCategory: "US SMS marketing",
    seoTitle: "Xellvio vs EZ Texting: SMS Marketing Comparison",
    seoDescription:
      "Compare Xellvio and EZ Texting on international sending, automations, AI landing pages and forms, credit pricing and sender registration.",
    h1: "Xellvio vs EZ Texting",
    heroBody:
      "EZ Texting is a familiar entry point for US mass texting. Xellvio covers the same campaign work and adds global delivery, deeper automation and a builder for the pages and forms behind your list.",
    verdict:
      "For simple US blasts both platforms get the job done. Xellvio pulls ahead once you text other countries, want automated journeys instead of one-off sends, or want your landing pages and forms in the same place as your campaigns.",
    reasons: [
      { title: "One account, 190+ countries", text: "No separate provider for international traffic." },
      { title: "Journeys, not just blasts", text: "Keyword replies, welcome series and win-backs run automatically." },
      { title: "Everything in one place", text: "Pages, forms, lists, campaigns and reporting under one login." },
    ],
    rows: baseRows({
      reach: NOTE_US,
      inbox: "Two-way texting and keywords.",
      builder: "Sign-up forms and basic pages available.",
      automations: "Drip campaigns and autoresponders.",
      reporting: "Campaign-level reporting.",
      pricing: "Monthly plans with message allowances.",
      senders: "US toll-free and 10DLC support.",
      email: "SMS-focused.",
    }),
    theirStrengths: [
      "You only text US numbers and want a plan-based bill.",
      "You already have a separate marketing stack you are happy with.",
    ],
    faq: [
      {
        q: "How fast can large sends go out?",
        a: "Xellvio sends at up to 5,000 messages per minute, with live delivery counts while the send is running.",
      },
      {
        q: "Will my opt-outs carry over?",
        a: "Import them as suppressions and they are respected permanently across every campaign.",
      },
    ],
  },
  {
    slug: "xellvio-vs-twilio",
    rival: "Twilio",
    rivalCategory: "Developer messaging API",
    seoTitle: "Xellvio vs Twilio: SMS Platform Comparison",
    seoDescription:
      "Compare Xellvio and Twilio: a ready-to-use SMS marketing platform with campaigns, automations, forms and reporting versus building on a messaging API.",
    h1: "Xellvio vs Twilio",
    heroBody:
      "Twilio gives developers messaging APIs to build on. Xellvio gives marketers the finished product — campaigns, segments, automations, pages, forms and reporting — with an API when you need it.",
    verdict:
      "With Twilio you build the marketing layer yourself: contact storage, consent, segmentation, scheduling, click tracking, reporting and an inbox. Xellvio ships all of that, and still exposes an API and webhooks for the custom parts.",
    reasons: [
      { title: "Nothing to build", text: "Campaigns, segments, automations and reporting work on day one." },
      { title: "Compliance handled", text: "Consent records, automatic STOP handling, suppression and screening built in." },
      { title: "Sender paperwork in-app", text: "Sender IDs, toll-free verification and 10DLC requested and tracked for you." },
    ],
    rows: baseRows({
      reach: "Global API coverage, with the marketing layer left to you.",
      inbox: "You build the inbox on top of the API.",
      builder: "Not part of the API product.",
      automations: "You write the orchestration yourself.",
      reporting: "Raw message logs and events to analyse yourself.",
      pricing: "Usage-based API pricing plus the cost of building.",
      senders: "You handle registration in the provider console.",
      email: "Available as a separate product.",
    }),
    theirStrengths: [
      "You have engineers and want total control over every message flow.",
      "Messaging is embedded deep inside your own product, not a marketing programme.",
    ],
    faq: [
      {
        q: "Does Xellvio have an API?",
        a: "Yes — an API and webhooks for sends, contacts and events, so you can automate around the platform instead of rebuilding it.",
      },
      {
        q: "Do I need my own carrier account?",
        a: "No. Routing and sender approval sit inside Xellvio.",
      },
    ],
  },
  {
    slug: "xellvio-vs-clicksend",
    rival: "ClickSend",
    rivalCategory: "Multi-channel messaging gateway",
    seoTitle: "Xellvio vs ClickSend: SMS Platform Comparison",
    seoDescription:
      "Compare Xellvio and ClickSend on marketing automation, segmentation, landing pages and sign-up forms, campaign reporting and global SMS delivery.",
    h1: "Xellvio vs ClickSend",
    heroBody:
      "ClickSend is a gateway for sending across several channels. Xellvio is a marketing platform: the same global SMS delivery, plus the segments, journeys, pages, forms and reporting around it.",
    verdict:
      "ClickSend is strong when you simply need messages to leave the building through an API or dashboard. Xellvio is the better fit when the messages are part of a marketing programme you need to grow and measure.",
    reasons: [
      { title: "Marketing built in", text: "Segments, automations, templates and per-campaign reporting included." },
      { title: "List growth included", text: "AI-built landing pages, forms and keyword opt-ins feeding your lists." },
      { title: "Spend you can read", text: "Cost per campaign, country and message part, next to clicks and delivery." },
    ],
    rows: baseRows({
      reach: "Global SMS delivery via gateway and API.",
      inbox: "Inbound message handling available.",
      builder: NOTE_SELF,
      automations: "Scheduling and API-driven sending.",
      reporting: "Delivery and account-level reporting.",
      pricing: "Pay-as-you-go per message.",
      senders: "Sender and number options by country.",
      email: "Email and post offered as separate channels.",
    }),
    theirStrengths: [
      "You need post, fax or other channels from one gateway.",
      "Your sending is entirely API-driven with no marketing programme.",
    ],
    faq: [
      {
        q: "Can Xellvio send MMS?",
        a: "Yes, where the destination supports it, and media pricing is shown before you send.",
      },
      {
        q: "Can I test before committing?",
        a: "Yes. Create an account, get free credits and send a real campaign first.",
      },
    ],
  },
];

export function getComparison(slug: string): CompareDef | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}

/** Other comparisons to link to from a detail page. */
export function relatedComparisons(slug: string, limit = 4): CompareDef[] {
  return COMPARISONS.filter((c) => c.slug !== slug).slice(0, limit);
}
