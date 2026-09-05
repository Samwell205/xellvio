/**
 * Industry solution pages. Each entry must carry genuinely different content —
 * different problems, different workflows, different templates. Industries with
 * nothing specific to say do not get a page.
 */
export type Industry = {
  slug: string;
  name: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  intro: string;
  /** Who this is for, in one line — used on the hub cards. */
  blurb: string;
  problems: string[];
  challenges: string;
  capabilities: { title: string; text: string }[];
  workflows: { name: string; steps: string[] }[];
  templates: { label: string; to: string }[];
  related: { label: string; to: string; text: string }[];
  faq: { q: string; a: string }[];
};

const rel = {
  sms: { label: "SMS marketing", to: "/sms-marketing", text: "Segmented text campaigns to 190+ countries." },
  automations: { label: "Automations", to: "/automations", text: "Journeys triggered by sign-ups, keywords and dates." },
  forms: { label: "Sign-up forms", to: "/signup-forms", text: "Consent-first forms that grow your list." },
  pages: { label: "Landing pages", to: "/landing-pages", text: "Hosted pages for offers and registrations." },
  audiences: { label: "Audiences & segments", to: "/audiences", text: "Live lists that update themselves." },
  reporting: { label: "Reporting", to: "/reporting", text: "Delivery, clicks and spend per campaign." },
  email: { label: "Email marketing", to: "/email-marketing", text: "Email campaigns on the same contact data." },
  compliance: { label: "Compliance", to: "/compliance", text: "Consent records and automatic opt-outs." },
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "ecommerce",
    name: "Ecommerce",
    seoTitle: "SMS Marketing for Ecommerce Stores",
    seoDescription:
      "Xellvio for ecommerce: grow an SMS list with sign-up forms, recover interest with automated follow-ups, launch drops and back-in-stock alerts, and measure clicks and spend per campaign.",
    h1: "SMS marketing for ecommerce brands",
    blurb: "Grow a text list, launch drops and follow up automatically.",
    intro:
      "Online stores live or die on repeat purchases. Xellvio gives you a consented text list, automated follow-up around browsing and clicks, and reporting that shows what each send cost and earned.",
    problems: [
      "Paid traffic gets more expensive while email open rates fall.",
      "Launches and restocks are announced to everyone, so the offer feels generic.",
      "Interested visitors leave without a single way to reach them again.",
    ],
    challenges:
      "Customers check texts within minutes, but they also opt out fast when messages are irrelevant. The work is in collecting permission properly and then segmenting so each drop reaches the people who care about it.",
    capabilities: [
      { title: "List growth on-site", text: "A sign-up form or landing page trades a first-order incentive for a number and explicit consent." },
      { title: "Launch and restock alerts", text: "Send a drop announcement to a segment, with a tracked short link straight to the product." },
      { title: "Automated follow-up", text: "A link click or form submission starts a short sequence instead of a single blast." },
      { title: "VIP segments", text: "Tag repeat buyers and give them early access before the general list." },
      { title: "Spend control", text: "See cost per country and per message part before scaling a campaign." },
    ],
    workflows: [
      { name: "First-order welcome", steps: ["Sign-up form", "Consent recorded", "Welcome text", "Wait 2 days", "First-order offer"] },
      { name: "Drop announcement", steps: ["Segment: clicked in 30 days", "Campaign with short link", "Track clicks", "Resend to non-delivered"] },
      { name: "Win back quiet buyers", steps: ["Segment: no engagement 60 days", "Win-back offer", "Branch on click", "Tag re-engaged"] },
    ],
    templates: [
      { label: "Product launch page", to: "/templates/landing-pages/product-promo" },
      { label: "Newsletter sign-up form", to: "/templates/sign-up-forms/newsletter" },
      { label: "Welcome series automation", to: "/templates/automations/welcome-series" },
    ],
    related: [rel.sms, rel.forms, rel.automations, rel.reporting],
    faq: [
      { q: "Can I text customers who bought from me?", a: "Only with messaging consent. Xellvio forms and landing pages capture that permission explicitly and store it with the contact." },
      { q: "Can I link to a specific product?", a: "Yes. Links are shortened at send time and clicks are tracked per campaign, so you can see which product drew interest." },
      { q: "Does Xellvio handle images?", a: "Yes. MMS is supported where the destination allows it, and priced separately from SMS." },
    ],
  },
  {
    slug: "retail",
    name: "Retail",
    seoTitle: "SMS Marketing for Retail Stores",
    seoDescription:
      "Xellvio for retail: build a local text list at the counter, promote in-store offers by location, run loyalty segments and measure redemption — with opt-outs handled automatically.",
    h1: "Text marketing for physical retail",
    blurb: "Build a local list in-store and fill quiet days.",
    intro:
      "For stores, the value is footfall on a specific day. Xellvio lets you build a list at the counter, message people near a location, and see which offer brought them in.",
    problems: [
      "Quiet weekdays with no cheap way to create demand.",
      "Loyalty schemes that collect data nobody ever uses.",
      "Offers sent to a whole database, including people 200 miles away.",
    ],
    challenges:
      "Retail messaging has to be short, local and timely. That means a fast in-store sign-up, contacts grouped by store or city, and sends scheduled around trading hours.",
    capabilities: [
      { title: "Counter sign-up", text: "Run a sign-up form on a tablet or a printed keyword so staff can add customers in seconds." },
      { title: "Store-level segments", text: "Group contacts by location and message only the catchment you care about." },
      { title: "Same-day offers", text: "Schedule or send immediately, with delivery counts visible while the send runs." },
      { title: "Loyalty tiers", text: "Tag regulars and give them first access to sales and members-only nights." },
      { title: "Keyword opt-in", text: "Customers text a word to join, get a confirmation and land in the right list." },
    ],
    workflows: [
      { name: "In-store list build", steps: ["Keyword or tablet form", "Consent recorded", "Welcome + first offer", "Tagged by store"] },
      { name: "Quiet-day promo", steps: ["Segment: store + opted in", "Send morning offer", "Track clicks", "Compare with last week"] },
      { name: "Loyalty night", steps: ["Segment: VIP tag", "Invite text", "Reminder 2 hours before", "Report attendance interest"] },
    ],
    templates: [
      { label: "Local offer landing page", to: "/templates/landing-pages/product-promo" },
      { label: "In-store sign-up form", to: "/templates/sign-up-forms/lead-capture" },
      { label: "Keyword opt-in automation", to: "/templates/automations/keyword-optin" },
    ],
    related: [rel.sms, rel.audiences, rel.forms, rel.compliance],
    faq: [
      { q: "How do customers join in-store?", a: "Either by texting a keyword to your number, or by filling in a hosted sign-up form on a tablet at the counter." },
      { q: "Can I message one store's customers only?", a: "Yes. Tag or list contacts by store and send to that segment." },
      { q: "How do I stop over-messaging?", a: "Segments exclude recent recipients and suppressions are global, so opt-outs are permanent everywhere." },
    ],
  },
  {
    slug: "service-businesses",
    name: "Service businesses",
    seoTitle: "SMS for Service Businesses & Appointments",
    seoDescription:
      "Xellvio for service businesses: capture enquiries with forms, text quotes and reminders, reduce no-shows with automated nudges, and keep a two-way conversation in a shared inbox.",
    h1: "SMS for service businesses and appointments",
    blurb: "Quote faster, remind clients and cut no-shows.",
    intro:
      "Trades, clinics, salons and agencies win work by replying first. Xellvio captures the enquiry, texts the follow-up automatically, and keeps replies in one shared inbox.",
    problems: [
      "Enquiries arrive out of hours and go cold before anyone calls back.",
      "No-shows waste booked time that can't be resold.",
      "Client conversations scattered across personal phones.",
    ],
    challenges:
      "The value is speed and reliability: acknowledge every enquiry immediately, remind before every appointment, and keep the thread where the whole team can see it.",
    capabilities: [
      { title: "Enquiry capture", text: "A form or landing page collects the job details and the number to reply on." },
      { title: "Instant acknowledgement", text: "An automation confirms receipt the moment the form is submitted." },
      { title: "Appointment reminders", text: "Date-based automations text a reminder before the booking." },
      { title: "Two-way inbox", text: "Replies land in Xellvio, with unread counts so nothing is missed." },
      { title: "Team access", text: "Invite staff with only the permissions they need." },
    ],
    workflows: [
      { name: "Enquiry to quote", steps: ["Enquiry form", "Instant acknowledgement text", "Wait 1 day", "Follow-up if no reply"] },
      { name: "Appointment reminder", steps: ["Date field reached", "Reminder text", "Reply handled in inbox", "Tag confirmed"] },
      { name: "Post-job follow-up", steps: ["Tag: job complete", "Thank-you text", "Wait 7 days", "Review request"] },
    ],
    templates: [
      { label: "Quote request form", to: "/templates/sign-up-forms/lead-capture" },
      { label: "Consultation booking page", to: "/templates/landing-pages/consultant" },
      { label: "Lead follow-up automation", to: "/templates/automations/signup-form-followup" },
    ],
    related: [rel.forms, rel.automations, rel.sms, rel.reporting],
    faq: [
      { q: "Can clients reply to my texts?", a: "Yes. Replies arrive in the Xellvio inbox with unread counts, and can trigger automations." },
      { q: "Can I send reminders automatically?", a: "Yes. A date-based automation sends the reminder ahead of the appointment without anyone scheduling it." },
      { q: "Can my team use it too?", a: "Yes. Invite teammates and grant only the areas they need, such as campaigns or the inbox." },
    ],
  },
  {
    slug: "events",
    name: "Events",
    seoTitle: "SMS for Events, Webinars & Registrations",
    seoDescription:
      "Xellvio for events: publish a registration page, confirm sign-ups instantly, text reminders before doors open, send day-of updates and report attendance interest.",
    h1: "Event registration and reminders over SMS",
    blurb: "Fill seats, confirm registrations and cut drop-off.",
    intro:
      "Registrations mean nothing if people forget. Xellvio hosts the registration page, confirms instantly, then reminds attendees at the times that lift turnout.",
    problems: [
      "High registration numbers, low attendance.",
      "Last-minute changes that email doesn't deliver in time.",
      "No single list of who registered for what.",
    ],
    challenges:
      "Events need a fast page, an immediate confirmation and reliable reminders in the final 24 hours — plus a channel for urgent updates on the day.",
    capabilities: [
      { title: "Registration pages", text: "Publish a hosted page with the agenda, the form and the consent line." },
      { title: "Instant confirmation", text: "A confirmation text goes out the moment someone registers." },
      { title: "Reminder sequences", text: "Automations send a day-before and hour-before nudge." },
      { title: "Day-of updates", text: "Room changes and delays reach everyone within minutes." },
      { title: "Per-event lists", text: "Each event gets its own list, so follow-up stays relevant." },
    ],
    workflows: [
      { name: "Registration flow", steps: ["Registration page", "Confirmation text", "Added to event list", "Reminder day before"] },
      { name: "Final call", steps: ["Segment: registered, not attended", "1-hour reminder", "Join link", "Track clicks"] },
      { name: "After the event", steps: ["Tag: attended", "Thank-you text", "Recording or offer link", "Report clicks"] },
    ],
    templates: [
      { label: "Webinar registration page", to: "/templates/landing-pages/webinar-page" },
      { label: "Event registration form", to: "/templates/sign-up-forms/webinar" },
      { label: "Welcome series automation", to: "/templates/automations/welcome-series" },
    ],
    related: [rel.pages, rel.forms, rel.automations, rel.sms],
    faq: [
      { q: "Do I need a website for registrations?", a: "No. Xellvio hosts the registration page on a link you can share anywhere." },
      { q: "Can reminders go out automatically?", a: "Yes. Build one automation per event and it runs for every registrant." },
      { q: "How fast can an urgent update reach everyone?", a: "Large sends sustain thousands of messages a minute, so a full attendee list is typically reached in minutes." },
    ],
  },
  {
    slug: "education",
    name: "Education",
    seoTitle: "SMS for Schools, Courses & Training Providers",
    seoDescription:
      "Xellvio for education: capture course enquiries, confirm enrolments, text term and deadline reminders, and send urgent notices to parents or students with consent recorded.",
    h1: "SMS for education and training providers",
    blurb: "Enrol students and keep parents informed.",
    intro:
      "Schools, colleges and course providers need messages that are read. Xellvio handles enquiry capture, enrolment confirmations, deadline reminders and urgent notices from one place.",
    problems: [
      "Important notices lost in crowded email inboxes.",
      "Course enquiries that never get followed up.",
      "No record of who agreed to be contacted.",
    ],
    challenges:
      "Education messaging mixes marketing and operational updates. Consent for each has to be stored separately, and urgent notices must reach a whole cohort quickly.",
    capabilities: [
      { title: "Enquiry and enrolment forms", text: "Collect course interest with the fields and permission you need." },
      { title: "Cohort lists", text: "Group by course, year or campus and message only that group." },
      { title: "Deadline reminders", text: "Date-based automations nudge before applications or payments close." },
      { title: "Urgent notices", text: "Reach an entire cohort within minutes when plans change." },
      { title: "Separate consent", text: "Marketing and operational permission stored independently." },
    ],
    workflows: [
      { name: "Course enquiry", steps: ["Course page", "Enquiry form", "Prospectus text", "Follow-up after 3 days"] },
      { name: "Enrolment reminders", steps: ["Segment: applied, not enrolled", "Deadline reminder", "Branch on click", "Tag enrolled"] },
      { name: "Cohort notice", steps: ["Cohort list", "Notice text", "Replies in inbox", "Delivery report"] },
    ],
    templates: [
      { label: "Course enrolment page", to: "/templates/landing-pages/course" },
      { label: "Course interest form", to: "/templates/sign-up-forms/free-course" },
      { label: "Lead follow-up automation", to: "/templates/automations/signup-form-followup" },
    ],
    related: [rel.forms, rel.audiences, rel.automations, rel.compliance],
    faq: [
      { q: "Can I message parents and students separately?", a: "Yes. Keep them on separate lists or tags and send to the relevant segment." },
      { q: "Are operational messages treated differently?", a: "Marketing and transactional consent are stored separately, so an opt-out from promotions doesn't remove necessary notices where you're permitted to send them." },
      { q: "Can staff send without full access?", a: "Yes. Invite teammates with permission limited to campaigns or the inbox." },
    ],
  },
  {
    slug: "real-estate",
    name: "Real estate",
    seoTitle: "SMS for Real Estate Agents & Lettings",
    seoDescription:
      "Xellvio for real estate: capture buyer and tenant enquiries, text new listings to matched segments, confirm viewings and follow up automatically after every appointment.",
    h1: "SMS for real estate and lettings",
    blurb: "Match buyers to listings and confirm viewings fast.",
    intro:
      "Property moves quickly and the first agent to reply usually wins the instruction. Xellvio captures enquiries, alerts matched buyers about new listings, and automates viewing follow-up.",
    problems: [
      "Portal enquiries answered hours after the lead has moved on.",
      "New listings emailed to everyone regardless of budget or area.",
      "Viewing no-shows that waste an evening.",
    ],
    challenges:
      "Success depends on matching: contacts grouped by area, budget and property type, then messaged the moment something relevant lists.",
    capabilities: [
      { title: "Enquiry capture", text: "A form collects the requirements you need to match a buyer or tenant." },
      { title: "Matched alerts", text: "Segments on area, budget and type mean only relevant buyers get the alert." },
      { title: "Viewing confirmations", text: "Automations confirm and remind before the appointment." },
      { title: "Two-way replies", text: "Questions come back into a shared inbox instead of a personal phone." },
      { title: "Follow-up after viewings", text: "Tag the outcome and let the sequence do the chasing." },
    ],
    workflows: [
      { name: "New listing alert", steps: ["Segment: area + budget", "Listing text with short link", "Track clicks", "Book viewings from replies"] },
      { name: "Viewing reminder", steps: ["Viewing date set", "Confirmation text", "Reminder 2 hours before", "Outcome tagged"] },
      { name: "Vendor nurture", steps: ["Valuation form", "Instant acknowledgement", "Wait 3 days", "Market update text"] },
    ],
    templates: [
      { label: "Valuation request page", to: "/templates/landing-pages/lead-gen" },
      { label: "Enquiry capture form", to: "/templates/sign-up-forms/lead-capture" },
      { label: "Link-click follow-up automation", to: "/templates/automations/abandoned-interest" },
    ],
    related: [rel.forms, rel.audiences, rel.automations, rel.sms],
    faq: [
      { q: "Can I alert only buyers in one area?", a: "Yes. Store area and budget as contact fields and build a segment on them." },
      { q: "Can I include a link to the listing?", a: "Yes, and it's shortened automatically so clicks are tracked per campaign." },
      { q: "Do replies come to me?", a: "Replies land in the Xellvio inbox for your workspace, with unread counts." },
    ],
  },
  {
    slug: "agencies",
    name: "Agencies",
    seoTitle: "SMS Marketing Platform for Agencies",
    seoDescription:
      "Xellvio for agencies: run client messaging with separated data, reusable templates and automations, exportable delivery and click reports, and role-based access for your team.",
    h1: "Run client SMS programmes from one platform",
    blurb: "Deliver client messaging with clean reporting.",
    intro:
      "Agencies need repeatable process and defensible numbers. Xellvio gives you reusable templates and automations, isolated data per workspace, and exportable reports for every client review.",
    problems: [
      "Rebuilding the same campaign structure for each client.",
      "Reporting assembled by hand from partial data.",
      "Junior staff needing access without touching billing.",
    ],
    challenges:
      "The work is operational: standardise the build, keep client data separated, and produce delivery, click and spend numbers that hold up in a review.",
    capabilities: [
      { title: "Reusable templates", text: "Landing pages, forms and automations you can apply to a new client in minutes." },
      { title: "Separated workspaces", text: "Each account's contacts and campaigns are isolated at the database level." },
      { title: "Role-based access", text: "Invite team members with only the permissions their job needs." },
      { title: "Exportable reporting", text: "Delivery, clicks and spend as CSV for client reporting." },
      { title: "Cost transparency", text: "Per-country rates and per-campaign spend for accurate recharging." },
    ],
    workflows: [
      { name: "Client onboarding", steps: ["Apply page + form templates", "Import consented contacts", "Activate welcome automation", "Baseline report"] },
      { name: "Monthly campaign cycle", steps: ["Segment build", "Campaign send", "Delivery reconciliation", "Export report"] },
      { name: "Programme optimisation", steps: ["Compare click rates", "Adjust segments", "Update automation copy", "Re-measure"] },
    ],
    templates: [
      { label: "Lead generation page", to: "/templates/landing-pages/lead-gen" },
      { label: "Lead capture form", to: "/templates/sign-up-forms/lead-capture" },
      { label: "Welcome series automation", to: "/templates/automations/welcome-series" },
    ],
    related: [rel.reporting, rel.automations, rel.audiences, rel.email],
    faq: [
      { q: "Can I keep client data separate?", a: "Yes. Each workspace's data is isolated at the database level and only reachable by its own users." },
      { q: "Can I limit what staff can see?", a: "Yes. Team invitations grant specific areas, so campaign staff needn't have billing access." },
      { q: "Can I export reports for clients?", a: "Yes. Campaign and audience reports export as CSV." },
    ],
  },
];

export function industryBySlug(slug: string) {
  return INDUSTRIES.find((i) => i.slug === slug);
}
