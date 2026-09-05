/**
 * Extensible client-side analytics events.
 *
 * No keys are hardcoded: a measurement ID is read from VITE_GA_MEASUREMENT_ID
 * at build time and the tag is only loaded when that variable is configured.
 * Without configuration every call is a safe no-op, so product code can emit
 * events unconditionally.
 */

export type AnalyticsEvent =
  | "page_view"
  | "cta_click"
  | "signup_started"
  | "signup_completed"
  | "trial_started"
  | "landing_page_created"
  | "signup_form_created"
  | "first_campaign_created"
  | "campaign_sent"
  | "credits_purchased"
  | "subscription_upgraded";

type Props = Record<string, string | number | boolean | null | undefined>;

const MEASUREMENT_ID =
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_GA_MEASUREMENT_ID : undefined) || "";

export const analyticsEnabled = () => typeof window !== "undefined" && Boolean(MEASUREMENT_ID);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loaded = false;

/** Injects the analytics tag once, only when a measurement ID is configured. */
export function initAnalytics() {
  if (loaded || !analyticsEnabled()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(s);
}

/** Records a product or conversion event. Never throws, never blocks the UI. */
export function trackEvent(event: AnalyticsEvent, props: Props = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...props });
    window.gtag?.("event", event, props);
  } catch {
    /* analytics must never break the app */
  }
}

/** Page view for client-side route changes. */
export function trackPageView(path: string, title?: string) {
  trackEvent("page_view", {
    page_path: path,
    page_title: title ?? (typeof document !== "undefined" ? document.title : ""),
  });
}
