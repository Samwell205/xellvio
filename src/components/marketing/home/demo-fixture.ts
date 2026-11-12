import { calculateSegments } from "@/lib/sms-segments";

/* One fictional US scenario shared by the homepage hero and three-step story.
   Every count, percentage and estimate is derived here so the views agree.
   No real customer, number or price lookup is involved. */

export const US_RATE_PER_SEGMENT = 0.0165; // published US retail: $16.50 per 1,000 segments

export const DEMO = {
  business: "Brightleaf Café",
  country: "United States",
  /** Illustrative two-way number in the reserved 555-01xx fiction range. */
  sender: "+1 (555) 010-2468",
  contact: { first: "Ada", phone: "+1 (555) 010-0123", email: "ada@example.com" },
  link: "xell.vi/spring",
  welcomeLink: "xell.vi/vip",
  templateLead: "Brightleaf Cafe: Hi ",
  templateTail: ", our spring menu lands Friday. VIPs get first pick + 15% off this weekend: ",
  stop: " Reply STOP to opt out",
  audience: { name: "VIP customers", size: 1248 },
  reply: "Saving a table for Friday!",
  results: { delivered: 1201, awaiting: 28, failed: 19, clicks: 214 },
} as const;

export const MESSAGE = `${DEMO.templateLead}${DEMO.contact.first}${DEMO.templateTail}${DEMO.link}${DEMO.stop}`;
export const SEGMENTS = calculateSegments(MESSAGE);
export const SEGMENTS_TOTAL = SEGMENTS.segments * DEMO.audience.size;
export const ESTIMATED_COST = SEGMENTS_TOTAL * US_RATE_PER_SEGMENT;

export const WELCOME_TEXT = `Hi {first_name}, welcome to the VIP list! See this week's menu: ${DEMO.welcomeLink}`;

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const r = DEMO.results;
export const SENT = r.delivered + r.awaiting + r.failed;
export const STATS = {
  sent: SENT,
  deliveredPct: pct(r.delivered, SENT),
  awaitingPct: pct(r.awaiting, SENT),
  failedPct: pct(r.failed, SENT),
  clickPct: pct(r.clicks, r.delivered),
};

export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
