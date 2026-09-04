// Ready-made starting points for sign-up forms and landing pages.
// Every field stays fully editable after the template is applied.

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
    theme: "light" | "dark";
    accent: string;
  };
};

const CONSENT =
  "By subscribing you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.";

const f = (
  id: string,
  label: string,
  category: string,
  blurb: string,
  headline: string,
  description: string,
  cta_label: string,
  success_message: string,
  accent: string,
  theme: "light" | "dark" = "light",
  collect_name = true,
): FormTemplate => ({
  id,
  label,
  category,
  blurb,
  values: { headline, description, cta_label, success_message, collect_name, consent_text: CONSENT, theme, accent },
});

export const FORM_TEMPLATES: FormTemplate[] = [
  f("welcome-10", "Welcome 10% off", "Discount", "Classic first-order discount pop-up.", "Get 10% off your first order", "Join our text list and we'll send your code right away.", "Get my code", "Check your phone — your code is on the way!", "#111827"),
  f("welcome-15", "Welcome 15% off", "Discount", "Higher incentive for new visitors.", "Take 15% off today", "Sign up for texts and unlock your discount instantly.", "Unlock 15% off", "Your 15% code is on its way by text.", "#e11d48"),
  f("free-shipping", "Free shipping", "Discount", "Offer shipping instead of a discount.", "Free shipping on your first order", "Add your number and we'll text you the code.", "Send my code", "Sent! Your free-shipping code is in your texts.", "#0f766e"),
  f("early-access", "Early access", "VIP", "Give texters first look at drops.", "Shop new drops first", "VIP texters get every launch 24 hours early.", "Join the VIP list", "You're in. Watch your phone for the next drop.", "#7c3aed"),
  f("back-in-stock", "Back in stock alerts", "Alerts", "For sold-out product pages.", "Get a text when it's back", "We'll message you the moment this restocks.", "Notify me", "We'll text you as soon as it's back.", "#1d4ed8"),
  f("flash-sale", "Flash sale alerts", "Alerts", "Urgency without hype.", "Never miss a flash sale", "Sale alerts by text — usually one or two a month.", "Alert me", "You'll hear from us before the next sale.", "#ea580c"),
  f("waitlist", "Product waitlist", "Launch", "Pre-launch demand capture.", "Join the waitlist", "Be first in line when we open orders.", "Join waitlist", "You're on the list — we'll text you first.", "#0ea5e9"),
  f("giveaway", "Giveaway entry", "Events", "Contest or giveaway signups.", "Enter to win", "Add your number for one entry. Winner announced by text.", "Enter now", "Entry received — good luck!", "#db2777"),
  f("event-rsvp", "Event RSVP", "Events", "In-store or online events.", "Save your spot", "We'll text you the details and a reminder.", "Reserve my spot", "You're booked. Details coming by text.", "#4338ca"),
  f("appointment", "Appointment reminders", "Service", "Salons, clinics, studios.", "Never miss an appointment", "Opt in for text reminders and easy rescheduling.", "Turn on reminders", "Reminders are on.", "#059669"),
  f("loyalty", "Loyalty club", "VIP", "Rewards programme signups.", "Join the rewards club", "Points, perks and members-only offers by text.", "Join free", "Welcome to the club!", "#b45309"),
  f("restaurant", "Restaurant specials", "Local", "Weekly specials for local guests.", "Weekly specials by text", "One text a week with what's fresh on the menu.", "Send me specials", "Tasty. First text lands this week.", "#7f1d1d"),
  f("realestate", "New listings", "Local", "Property alerts by area.", "New listings before anyone else", "Get a text when a home hits the market near you.", "Get alerts", "Alerts on — first listing coming soon.", "#0c4a6e"),
  f("newsletter-dark", "Bold dark", "Minimal", "High-contrast dark card.", "Texts worth reading", "Short, useful, never spammy.", "Subscribe", "Thanks for subscribing.", "#f59e0b", "dark"),
  f("minimal-light", "Minimal light", "Minimal", "Clean, quiet, no offer.", "Stay in the loop", "Occasional updates by text. Unsubscribe anytime.", "Subscribe", "You're subscribed.", "#111827", "light", false),
  f("abandoned-cart", "Cart reminders", "Ecommerce", "Recover abandoned carts.", "Save your cart", "We'll text you a link so you can finish later.", "Text me my cart", "Sent — check your messages.", "#16a34a"),
];

export type PageTemplate = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  values: {
    headline: string;
    subheadline: string;
    body: string;
    cta_label: string;
    success_message: string;
    theme: "light" | "dark";
    accent: string;
  };
};

const p = (
  id: string,
  label: string,
  category: string,
  blurb: string,
  headline: string,
  subheadline: string,
  body: string,
  cta_label: string,
  success_message: string,
  accent: string,
  theme: "light" | "dark" = "light",
): PageTemplate => ({
  id,
  label,
  category,
  blurb,
  values: { headline, subheadline, body, cta_label, success_message, theme, accent },
});

export const PAGE_TEMPLATES: PageTemplate[] = [
  p("offer-15", "15% off offer", "Discount", "Straightforward discount page.", "Get 15% off your first order", "Join our text list for early access to drops and deals.", "One text to claim your code. Two or three messages a month after that — no spam, ever.", "Send my code", "Thanks — watch your phone for your code!", "#111827"),
  p("free-shipping", "Free shipping", "Discount", "Shipping incentive page.", "Free shipping, on us", "Add your number and we'll text the code straight over.", "Valid on your next order. Reply STOP any time to opt out.", "Get free shipping", "Sent! Check your texts for the code.", "#0f766e"),
  p("link-in-bio", "Link in bio", "Social", "Perfect for Instagram/TikTok bios.", "Tap in for the good stuff", "Deals, drops and behind-the-scenes — by text.", "You'll hear from us a couple of times a month. That's it.", "Join the list", "You're in!", "#db2777", "dark"),
  p("waitlist", "Launch waitlist", "Launch", "Build hype before launch.", "Something new is coming", "Join the waitlist and be first through the door.", "Waitlist members get early access and launch-day pricing.", "Join the waitlist", "You're on the list.", "#7c3aed", "dark"),
  p("giveaway", "Giveaway", "Events", "Contest entry page.", "Win the full bundle", "Enter with your phone number — winner drawn Friday.", "One entry per person. We'll text the winner directly.", "Enter to win", "Entry received. Good luck!", "#e11d48"),
  p("event", "Event signup", "Events", "RSVP and reminders.", "Save your seat", "Free to attend, limited spots.", "We'll text you the location, the time and a reminder the day before.", "Reserve my spot", "You're booked — details coming by text.", "#4338ca"),
  p("vip", "VIP club", "VIP", "Members-only feel.", "Join the inner circle", "Early access, member pricing, first dibs on restocks.", "Membership is free. Leave any time by replying STOP.", "Become a VIP", "Welcome to the inner circle.", "#b45309", "dark"),
  p("restaurant", "Restaurant", "Local", "Local specials and offers.", "This week's specials, texted to you", "Fresh menu news every Thursday.", "Show your text in store for a free side on your first visit.", "Send me specials", "Delicious. First text lands Thursday.", "#7f1d1d"),
  p("fitness", "Gym & studio", "Local", "Class passes and trials.", "Your first class is free", "Drop your number and we'll text your pass.", "New members only. Reply STOP to opt out any time.", "Claim free class", "Pass sent — see you soon!", "#059669"),
  p("realestate", "Real estate", "Local", "Listing alerts by area.", "See new homes first", "Get a text the moment a home hits the market near you.", "Tell us your number and we'll do the watching for you.", "Get listing alerts", "Alerts are on.", "#0c4a6e"),
  p("service-quote", "Free quote", "Service", "Lead capture for services.", "Get your free quote by text", "No calls unless you ask for one.", "Send your number and we'll text a same-day estimate.", "Get my quote", "Got it — your quote is coming by text.", "#1d4ed8"),
  p("app-download", "App download", "Launch", "Text yourself the app link.", "Get the app", "We'll text you a download link.", "Works on iPhone and Android.", "Text me the link", "Link sent!", "#0ea5e9", "dark"),
  p("charity", "Nonprofit", "Cause", "Supporter updates.", "Stand with us", "Join our supporter texts for updates and urgent actions.", "A couple of messages a month. Reply STOP to leave.", "Count me in", "Thank you for joining us.", "#166534"),
  p("black-friday", "Black Friday", "Seasonal", "Big sale countdown.", "Black Friday, early", "Texters shop our sale 12 hours before everyone else.", "Sign up now, get the access link before doors open.", "Get early access", "You're in — watch your phone.", "#f59e0b", "dark"),
  p("holiday", "Holiday sale", "Seasonal", "Festive promo page.", "Holiday deals by text", "Daily doorbusters, straight to your phone.", "Runs all December. Reply STOP any time.", "Send me deals", "Happy holidays — first deal on the way.", "#b91c1c"),
  p("minimal", "Minimal", "Minimal", "Just a headline and a box.", "Stay in the loop", "Occasional texts. Nothing else.", "", "Subscribe", "You're subscribed.", "#111827"),
];
