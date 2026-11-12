import {
  siShopify, siWoocommerce, siBigcommerce, siStripe, siHubspot, siBrevo, siIntercom,
} from "simple-icons";

/* Central brand-asset map for integration names shown on the public website.
   Marks come from Simple Icons (CC0 collection of official brand SVGs). Names
   without an entry render as clean text; never substitute favicons, AI art or
   letter badges. Showing a mark does not imply partnership or endorsement. */

export type IntegrationKind = "native" | "api";

export type BrandEntry = {
  name: string;
  kind: IntegrationKind;
  /** 24x24 SVG path, when an official asset is available. */
  path?: string;
  /** Brand colour; omitted where the brand mark is near-black or too light for both themes. */
  hex?: string;
};

const mark = (i: { path: string; hex: string }, useColour = true) => ({ path: i.path, hex: useColour ? `#${i.hex}` : undefined });

/** Apps currently live in the Xellvio app directory (see migration 0058). */
export const INTEGRATIONS: BrandEntry[] = [
  { name: "Shopify", kind: "native", ...mark(siShopify) },
  { name: "WooCommerce", kind: "native", ...mark(siWoocommerce) },
  { name: "BigCommerce", kind: "native", ...mark(siBigcommerce, false) },
  { name: "Stripe", kind: "native", ...mark(siStripe) },
  { name: "Paystack", kind: "native" },
  { name: "HubSpot", kind: "native", ...mark(siHubspot) },
  { name: "Klaviyo", kind: "native" },
  { name: "ActiveCampaign", kind: "native" },
  { name: "Brevo", kind: "native", ...mark(siBrevo) },
  { name: "Pipedrive", kind: "native" },
  { name: "GoHighLevel", kind: "native" },
  { name: "Intercom", kind: "native", ...mark(siIntercom, false) },
  { name: "Webhooks & API", kind: "api" },
];

export const MISSING_BRAND_ASSETS = INTEGRATIONS.filter((i) => !i.path && i.kind === "native").map((i) => i.name);
