// Ready-made starting points for sign-up forms and landing pages.
// Every field, colour and section stays fully editable after applying.
import {
  DARK_DESIGN,
  LIGHT_DESIGN,
  type Design,
  type Section,
  newId,
} from "./website-design";

const CONSENT =
  "By subscribing you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

const d = (over: Partial<Design> = {}, dark = false): Design => ({ ...(dark ? DARK_DESIGN : LIGHT_DESIGN), ...over });

/* --------------------------------- sign-up forms -------------------------------- */

export type FormTemplate = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  values: {
    headline: string;
    description: string;
    cta_label: string;
    success_message: string;
    collect_name: boolean;
    consent_text: string;
    design: Design;
    image_url: string;
  };
};

const f = (
  id: string,
  label: string,
  category: string,
  blurb: string,
  headline: string,
  description: string,
  cta_label: string,
  success_message: string,
  design: Design,
  collect_name = true,
): FormTemplate => ({
  id,
  label,
  category,
  blurb,
  values: { headline, description, cta_label, success_message, collect_name, consent_text: CONSENT, design, image_url: "" },
});

export const FORM_TEMPLATES: FormTemplate[] = [
  f("welcome-10", "Welcome 10% off", "Discount", "Classic first-order discount pop-up.", "Get 10% off your first order", "Join our text list and we'll send your code right away.", "Get my code", "Check your phone — your code is on the way!", d({ accent: "#111827" })),
  f("welcome-15", "Welcome 15% off", "Discount", "Higher incentive for new visitors.", "Take 15% off today", "Sign up for texts and unlock your discount instantly.", "Unlock 15% off", "Your 15% code is on its way by text.", d({ accent: "#e11d48", buttonStyle: "pill", radius: 22, headingScale: 1.1 })),
  f("free-shipping", "Free shipping", "Discount", "Offer shipping instead of a discount.", "Free shipping on your first order", "Add your number and we'll text you the code.", "Send my code", "Sent! Your free-shipping code is in your texts.", d({ accent: "#0f766e" })),
  f("early-access", "Early access", "VIP", "Give texters first look at drops.", "Shop new drops first", "VIP texters get every launch 24 hours early.", "Join the VIP list", "You're in. Watch your phone for the next drop.", d({ accent: "#a855f7", accentText: "#140a24" }, true)),
  f("back-in-stock", "Back in stock alerts", "Alerts", "For sold-out product pages.", "Get a text when it's back", "We'll message you the moment this restocks.", "Notify me", "We'll text you as soon as it's back.", d({ accent: "#1d4ed8", radius: 10 })),
  f("flash-sale", "Flash sale alerts", "Alerts", "Urgency without hype.", "Never miss a flash sale", "Sale alerts by text — usually one or two a month.", "Alert me", "You'll hear from us before the next sale.", d({ accent: "#ea580c", headingScale: 1.15 })),
  f("waitlist", "Product waitlist", "Launch", "Pre-launch demand capture.", "Join the waitlist", "Be first in line when we open orders.", "Join waitlist", "You're on the list — we'll text you first.", d({ accent: "#0ea5e9", accentText: "#04121f" }, true)),
  f("giveaway", "Giveaway entry", "Events", "Contest or giveaway signups.", "Enter to win", "Add your number for one entry. Winner announced by text.", "Enter now", "Entry received — good luck!", d({ accent: "#db2777", buttonStyle: "pill" })),
  f("event-rsvp", "Event RSVP", "Events", "In-store or online events.", "Save your spot", "We'll text you the details and a reminder.", "Reserve my spot", "You're booked. Details coming by text.", d({ accent: "#4338ca", headingFont: "serif" })),
  f("appointment", "Appointment reminders", "Service", "Salons, clinics, studios.", "Never miss an appointment", "Opt in for text reminders and easy rescheduling.", "Turn on reminders", "Reminders are on.", d({ accent: "#059669", radius: 12 })),
  f("loyalty", "Loyalty club", "VIP", "Rewards programme signups.", "Join the rewards club", "Points, perks and members-only offers by text.", "Join free", "Welcome to the club!", d({ accent: "#b45309", background: "#faf5ef", surface: "#fffdf9", border: "#ead9c6", headingFont: "serif" })),
  f("restaurant", "Restaurant specials", "Local", "Weekly specials for local guests.", "Weekly specials by text", "One text a week with what's fresh on the menu.", "Send me specials", "Tasty. First text lands this week.", d({ accent: "#7f1d1d", headingFont: "serif", radius: 8 })),
  f("realestate", "New listings", "Local", "Property alerts by area.", "New listings before anyone else", "Get a text when a home hits the market near you.", "Get alerts", "Alerts on — first listing coming soon.", d({ accent: "#0c4a6e", buttonStyle: "outline" })),
  f("newsletter-dark", "Bold dark", "Minimal", "High-contrast dark card.", "Texts worth reading", "Short, useful, never spammy.", "Subscribe", "Thanks for subscribing.", d({ accent: "#f59e0b" }, true)),
  f("minimal-light", "Minimal light", "Minimal", "Clean, quiet, no offer.", "Stay in the loop", "Occasional updates by text. Unsubscribe anytime.", "Subscribe", "You're subscribed.", d({ radius: 6, shadow: false, buttonStyle: "outline" }), false),
  f("abandoned-cart", "Cart reminders", "Ecommerce", "Recover abandoned carts.", "Save your cart", "We'll text you a link so you can finish later.", "Text me my cart", "Sent — check your messages.", d({ accent: "#16a34a" })),
];

/* -------------------------------- landing pages -------------------------------- */

export type PageTemplate = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  values: {
    headline: string;
    subheadline: string;
    cta_label: string;
    success_message: string;
    design: Design;
    sections: Section[];
    seo_title: string;
    seo_description: string;
  };
};

type Blocks = {
  headline: string;
  sub: string;
  body?: string;
  align?: "left" | "center";
  benefits?: [string, string][];
  quote?: [string, string];
  faq?: [string, string][];
  text?: [string, string];
  closing?: string;
  footer?: string;
};

function build(b: Blocks): Section[] {
  const out: Section[] = [
    {
      id: newId(),
      type: "hero",
      headline: b.headline,
      subheadline: b.sub,
      body: b.body ?? "",
      imageUrl: "",
      align: b.align ?? "left",
      showForm: true,
    },
  ];
  if (b.benefits)
    out.push({
      id: newId(),
      type: "features",
      heading: "What you get",
      items: b.benefits.map(([title, body]) => ({ title, body })),
    });
  if (b.text) out.push({ id: newId(), type: "text", heading: b.text[0], body: b.text[1] });
  if (b.quote) out.push({ id: newId(), type: "quote", text: b.quote[0], author: b.quote[1] });
  if (b.faq) out.push({ id: newId(), type: "faq", heading: "Questions", items: b.faq.map(([q, a]) => ({ q, a })) });
  if (b.closing) out.push({ id: newId(), type: "signup", heading: b.closing, note: "" });
  out.push({ id: newId(), type: "footer", text: b.footer ?? "Reply STOP to opt out, HELP for help. Message and data rates may apply." });
  return out;
}

const p = (
  id: string,
  label: string,
  category: string,
  blurb: string,
  cta_label: string,
  success_message: string,
  design: Design,
  blocks: Blocks,
  seo_title?: string,
  seo_description?: string,
): PageTemplate => ({
  id,
  label,
  category,
  blurb,
  values: {
    headline: blocks.headline,
    subheadline: blocks.sub,
    cta_label,
    success_message,
    design,
    sections: build(blocks),
    seo_title: seo_title ?? blocks.headline,
    seo_description: seo_description ?? blocks.sub,
  },
});

export const PAGE_TEMPLATES: PageTemplate[] = [
  p("offer-15", "15% off offer", "Discount", "Discount landing page with benefits and FAQ.", "Send my code", "Thanks — watch your phone for your code!", d({ accent: "#111827" }), {
    headline: "Get 15% off your first order",
    sub: "Join our text list for early access to drops and deals.",
    benefits: [["Instant code", "Your discount arrives by text in seconds."], ["Early access", "Shop new arrivals before the site goes live."], ["No spam", "Two or three texts a month, that's it."]],
    quote: ["I got my code straight away and used it the same night.", "Verified customer"],
    faq: [["How often will you text me?", "Around two or three times a month."], ["Can I stop?", "Reply STOP to any message and you're removed instantly."]],
    closing: "Claim your 15% off",
  }),
  p("free-shipping", "Free shipping", "Discount", "Shipping incentive with simple reassurance.", "Get free shipping", "Sent! Check your texts for the code.", d({ accent: "#0f766e" }), {
    headline: "Free shipping, on us",
    sub: "Add your number and we'll text the code straight over.",
    benefits: [["Any order", "No minimum spend on your first order."], ["One text", "Your code, then only the good stuff."], ["Easy exit", "Reply STOP any time."]],
    closing: "Text me the code",
  }),
  p("link-in-bio", "Link in bio", "Social", "Centred single-column page for social bios.", "Join the list", "You're in!", d({ accent: "#ec4899", accentText: "#1a0512", buttonStyle: "pill", radius: 26 }, true), {
    headline: "Tap in for the good stuff",
    sub: "Deals, drops and behind-the-scenes — by text.",
    align: "center",
    benefits: [["Drops first", "Every launch, 24 hours early."], ["Member pricing", "Text-only offers."], ["Real people", "Reply and we answer."]],
    closing: "Join the list",
  }),
  p("waitlist", "Launch waitlist", "Launch", "Pre-launch hype builder.", "Join the waitlist", "You're on the list.", d({ accent: "#8b5cf6", accentText: "#150a2a" }, true), {
    headline: "Something new is coming",
    sub: "Join the waitlist and be first through the door.",
    body: "Waitlist members get early access and launch-day pricing.",
    benefits: [["Early access", "Shop before the public launch."], ["Launch pricing", "Locked in for waitlist members."], ["Zero spam", "We only text about the launch."]],
    faq: [["When is launch?", "We'll text you the exact date first."]],
    closing: "Save my place",
  }),
  p("giveaway", "Giveaway", "Events", "Contest entry page with rules.", "Enter to win", "Entry received. Good luck!", d({ accent: "#e11d48", headingScale: 1.2, buttonStyle: "pill" }), {
    headline: "Win the full bundle",
    sub: "Enter with your phone number — winner drawn Friday.",
    text: ["How it works", "One entry per person. We text the winner directly, and everyone else gets a consolation offer."],
    closing: "Enter now",
  }),
  p("event", "Event signup", "Events", "RSVP page with details and reminders.", "Reserve my spot", "You're booked — details coming by text.", d({ accent: "#4338ca", headingFont: "serif" }), {
    headline: "Save your seat",
    sub: "Free to attend, limited spots.",
    benefits: [["The details", "Location and time, texted to you."], ["A reminder", "The day before, so you don't forget."], ["Easy changes", "Reply to swap or cancel."]],
    closing: "Reserve my spot",
  }),
  p("vip", "VIP club", "VIP", "Members-only club page.", "Become a VIP", "Welcome to the inner circle.", d({ accent: "#f59e0b" }, true), {
    headline: "Join the inner circle",
    sub: "Early access, member pricing, first dibs on restocks.",
    benefits: [["First dibs", "Restocks go to members first."], ["Member pricing", "Quietly better prices."], ["Free to join", "Leave any time."]],
    quote: ["Being a VIP paid for itself in one sale.", "Member since 2024"],
    closing: "Join the club",
  }),
  p("restaurant", "Restaurant", "Local", "Weekly specials for local guests.", "Send me specials", "Delicious. First text lands Thursday.", d({ accent: "#7f1d1d", headingFont: "serif", background: "#fbf7f2", surface: "#ffffff", border: "#ecdfd2" }), {
    headline: "This week's specials, texted to you",
    sub: "Fresh menu news every Thursday.",
    text: ["A little thank you", "Show your first text in store for a free side."],
    closing: "Get this week's specials",
  }),
  p("fitness", "Gym & studio", "Local", "Free class trial page.", "Claim free class", "Pass sent — see you soon!", d({ accent: "#059669", headingScale: 1.15 }), {
    headline: "Your first class is free",
    sub: "Drop your number and we'll text your pass.",
    benefits: [["Any class", "Use your pass on any session this month."], ["No card needed", "Nothing to pay upfront."], ["Bring a friend", "Reply and we'll add a second pass."]],
    closing: "Send my free pass",
  }),
  p("realestate", "Real estate", "Local", "Listing alerts by area.", "Get listing alerts", "Alerts are on.", d({ accent: "#0c4a6e", buttonStyle: "outline", radius: 8 }), {
    headline: "See new homes first",
    sub: "Get a text the moment a home hits the market near you.",
    benefits: [["Your area only", "Tell us the postcode, we filter the rest."], ["Same-day alerts", "Before the portals refresh."], ["No cold calls", "Texts only, unless you ask."]],
    closing: "Turn on alerts",
  }),
  p("service-quote", "Free quote", "Service", "Lead capture for service businesses.", "Get my quote", "Got it — your quote is coming by text.", d({ accent: "#1d4ed8" }), {
    headline: "Get your free quote by text",
    sub: "No calls unless you ask for one.",
    benefits: [["Same-day estimate", "Usually within a couple of hours."], ["No pressure", "A number, not a sales pitch."], ["Text only", "Everything in writing."]],
    closing: "Request my quote",
  }),
  p("app-download", "App download", "Launch", "Text yourself the app link.", "Text me the link", "Link sent!", d({ accent: "#38bdf8", accentText: "#04121f", font: "mono" }, true), {
    headline: "Get the app",
    sub: "We'll text you a download link.",
    align: "center",
    text: ["Works everywhere", "iPhone and Android, one link."],
    closing: "Send the link",
  }),
  p("charity", "Nonprofit", "Cause", "Supporter updates and actions.", "Count me in", "Thank you for joining us.", d({ accent: "#166534", headingFont: "serif" }), {
    headline: "Stand with us",
    sub: "Join our supporter texts for updates and urgent actions.",
    benefits: [["Real impact", "See where your support goes."], ["Urgent actions", "A text when your voice counts."], ["A couple a month", "We respect your inbox."]],
    closing: "Join our supporters",
  }),
  p("black-friday", "Black Friday", "Seasonal", "Early-access countdown page.", "Get early access", "You're in — watch your phone.", d({ accent: "#f59e0b", headingScale: 1.3 }, true), {
    headline: "Black Friday, early",
    sub: "Texters shop our sale 12 hours before everyone else.",
    align: "center",
    benefits: [["12 hours early", "Shop before the crowds."], ["Best stock", "Sizes sell out fast."], ["One link", "Straight to the sale."]],
    closing: "Send my early link",
  }),
  p("holiday", "Holiday sale", "Seasonal", "Daily deals through December.", "Send me deals", "Happy holidays — first deal on the way.", d({ accent: "#b91c1c", headingFont: "serif" }), {
    headline: "Holiday deals by text",
    sub: "Daily doorbusters, straight to your phone.",
    text: ["How it runs", "One deal a day through December. Reply STOP any time."],
    closing: "Start my deals",
  }),
  p("minimal", "Minimal", "Minimal", "Just a headline and a box.", "Subscribe", "You're subscribed.", d({ radius: 6, shadow: false, buttonStyle: "outline", width: "narrow" }), {
    headline: "Stay in the loop",
    sub: "Occasional texts. Nothing else.",
    align: "center",
  }),
];
