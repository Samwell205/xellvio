import {
  siShopify, siWoocommerce, siBigcommerce, siStripe, siHubspot, siBrevo, siIntercom,
} from "simple-icons";
import acBlue from "@/assets/brands/activecampaign-logo-blue.svg.asset.json";
import acWhite from "@/assets/brands/activecampaign-logo-white.svg.asset.json";
import hlDark from "@/assets/brands/highlevel-logo-dark-text.png.asset.json";
import hlWhite from "@/assets/brands/highlevel-logo-white-text.png.asset.json";

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
  /** Official full wordmark files (light-background and dark-background variants), shown at natural proportions. */
  wordmark?: { onLight: string; onDark: string; ratio: number };
  /** Where the asset came from, for audit. */
  source?: string;
};

/* Asset sources (checked 2026-11-12):
   - Shopify, WooCommerce, BigCommerce, Stripe, HubSpot, Brevo, Intercom: Simple Icons
     package marks (single-colour glyphs). Shown at glyph size next to the name; still
     to be cross-checked against each owner's brand page.
   - ActiveCampaign: official "Download logos" pack, activecampaign.com/brand
     (ActiveCampaign-Logos.zip > ActiveCampaign Logo Blue / White SVG).
   - HighLevel: official brand kit, marketing.gohighlevel.com/brandkit (full-colour
     logo with navy text for light backgrounds, white text for dark backgrounds).
   - Paystack: paystack.com/brand blocked by a bot-verification wall (HTTP 403) — text only.
   - Pipedrive: press-kit logo files require an access request — text only.
   - Klaviyo: brand guidelines are a Figma deck with no downloadable logo file — text only. */

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
  { name: "ActiveCampaign", kind: "native", wordmark: { onLight: acBlue.url, onDark: acWhite.url, ratio: 516 / 53 }, source: "activecampaign.com/brand" },
  { name: "Brevo", kind: "native", ...mark(siBrevo) },
  { name: "Pipedrive", kind: "native" },
  { name: "GoHighLevel", kind: "native", wordmark: { onLight: hlDark.url, onDark: hlWhite.url, ratio: 800 / 180 }, source: "marketing.gohighlevel.com/brandkit" },
  { name: "Intercom", kind: "native", ...mark(siIntercom, false) },
  { name: "Webhooks & API", kind: "api" },
];

export const MISSING_BRAND_ASSETS = INTEGRATIONS.filter((i) => !i.path && !i.wordmark && i.kind === "native").map((i) => i.name);
