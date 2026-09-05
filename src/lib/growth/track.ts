/**
 * Client-side growth tracking.
 *
 * Design rules:
 * - Never blocks or breaks the app: every call is wrapped and failures are swallowed.
 * - No extra third-party script: events are batched and posted to our own endpoint.
 * - No personal data: only a random visit id, the path, the traffic source and
 *   coarse labels such as page type, CTA name and placement.
 */
import { pageTypeFor, type TrackedEvent } from "./taxonomy";

const ENDPOINT = "/api/public/growth-events";
const SESSION_KEY = "xv_gs";
const FIRST_TOUCH_KEY = "xv_ft";

type Props = Record<string, string | number | boolean | null | undefined>;

export type GrowthEventInput = {
  event: TrackedEvent;
  path?: string;
  page_type?: string;
  entity_type?: string;
  entity_slug?: string;
  cta_name?: string;
  cta_placement?: string;
  experiment?: string;
  variant?: string;
  props?: Props;
};

type Attribution = { source: string; medium: string; campaign: string | null; referrer_host: string | null };

let queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let accountId: string | null = null;
let listenersBound = false;

function browser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Random per-visit id kept in sessionStorage — not a cross-site identifier. */
export function sessionId(): string {
  if (!browser()) return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function classifyReferrer(ref: string): Attribution {
  const search = /google\.|bing\.|duckduckgo|yahoo\.|ecosia|brave\.com|search\./i;
  const social = /facebook\.|instagram\.|linkedin\.|x\.com|twitter\.|t\.co|tiktok\.|youtube\.|reddit\.|pinterest\./i;
  if (!ref) return { source: "direct", medium: "none", campaign: null, referrer_host: null };
  let host = "";
  try {
    host = new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return { source: "direct", medium: "none", campaign: null, referrer_host: null };
  }
  if (browser() && host === window.location.hostname.replace(/^www\./, ""))
    return { source: "direct", medium: "none", campaign: null, referrer_host: null };
  if (search.test(host)) return { source: "organic_search", medium: "organic", campaign: null, referrer_host: host };
  if (social.test(host)) return { source: "social", medium: "social", campaign: null, referrer_host: host };
  return { source: "referral", medium: "referral", campaign: null, referrer_host: host };
}

/** Current attribution: UTM parameters win, otherwise the referrer is classified. */
export function attribution(): Attribution {
  if (!browser()) return { source: "direct", medium: "none", campaign: null, referrer_host: null };
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");
  const ref = params.get("ref");
  if (utmSource || utmMedium || ref) {
    const medium = (utmMedium || (ref ? "referral" : "unknown")).slice(0, 40);
    return {
      source: (utmSource || ref || "campaign").slice(0, 60),
      medium: medium === "cpc" || medium === "ppc" || medium === "paid" ? "paid" : medium,
      campaign: utmCampaign ? utmCampaign.slice(0, 80) : null,
      referrer_host: null,
    };
  }
  return classifyReferrer(document.referrer || "");
}

/** First touch is remembered so a signup can be credited to the channel that found us. */
export function firstTouch(): Attribution {
  const current = attribution();
  if (!browser()) return current;
  try {
    const stored = localStorage.getItem(FIRST_TOUCH_KEY);
    if (stored) return JSON.parse(stored) as Attribution;
    if (current.source !== "direct" || document.referrer) {
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current));
    }
  } catch {
    /* storage blocked — fall through */
  }
  return current;
}

function flush(useBeacon = false) {
  if (!browser() || queue.length === 0) return;
  const body = JSON.stringify({ events: queue.slice(0, 40) });
  queue = [];
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

function bindListeners() {
  if (listenersBound || !browser()) return;
  listenersBound = true;
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}

/** Associates later events in this visit with a workspace, once signed in. */
export function identifyWorkspace(id: string | null) {
  accountId = id;
}

/** Queues one event. Batched and sent shortly after, or on page hide. */
export function track(input: GrowthEventInput) {
  if (!browser()) return;
  try {
    bindListeners();
    const path = (input.path ?? window.location.pathname).slice(0, 300);
    const attr = attribution();
    queue.push({
      event: input.event,
      session_id: sessionId(),
      account_id: accountId,
      path,
      page_type: input.page_type ?? pageTypeFor(path),
      entity_type: input.entity_type ?? null,
      entity_slug: input.entity_slug ?? null,
      cta_name: input.cta_name ?? null,
      cta_placement: input.cta_placement ?? null,
      source: attr.source,
      medium: attr.medium,
      campaign: attr.campaign,
      referrer_host: attr.referrer_host,
      experiment: input.experiment ?? null,
      variant: input.variant ?? null,
      props: input.props ?? {},
    });
    if (queue.length >= 12) {
      flush();
      return;
    }
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 2500);
    }
  } catch {
    /* never throw from tracking */
  }
}

/** Records a page view plus the matching product-discovery event for that page type. */
export function trackView(path: string) {
  const type = pageTypeFor(path);
  track({ event: "page_view", path, page_type: type });
  const extra: Partial<Record<string, TrackedEvent>> = {
    product: "product_page_view",
    solution: "product_page_view",
    pricing: "pricing_page_view",
    template: "template_view",
    resource: "resource_view",
  };
  const followUp = extra[type];
  if (followUp) {
    const slug = path.split("?")[0].split("/").filter(Boolean).slice(-1)[0] ?? null;
    track({ event: followUp, path, page_type: type, entity_type: type, entity_slug: slug });
    if (type === "pricing") track({ event: "pricing_viewed", path, page_type: type });
  }
}

/** Records a call-to-action click with its name and where on the page it sits. */
export function trackCta(name: string, placement: string, extra: Omit<GrowthEventInput, "event"> = {}) {
  const signupish = /free|start|get started|create account|sign ?up|try/i.test(name);
  track({ ...extra, event: "cta_click", cta_name: name.slice(0, 60), cta_placement: placement });
  if (signupish) track({ ...extra, event: "signup_click", cta_name: name.slice(0, 60), cta_placement: placement });
}

/** Product milestone inside the app (safe to call on every success path). */
export function trackProduct(event: TrackedEvent, props: Props = {}) {
  track({ event, props });
}
