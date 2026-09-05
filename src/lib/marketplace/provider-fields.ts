// ============================================================================
// Client-safe connector metadata: which credentials each app needs, and what
// the integration engine can actually do once connected.
//
// The server runtime lives in providers.server.ts and is keyed by the same
// slugs, so the UI never has to know provider-specific details.
// ============================================================================

export type ProviderField = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
  help?: string;
  /** Shape the value must match before the form can continue. */
  pattern?: "domain" | "url";
};

const PATTERNS: Record<"domain" | "url", { test: (v: string) => boolean; message: string }> = {
  domain: {
    test: (v) => /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\/?$/i.test(v.trim()),
    message: "Enter a website address, for example example.myshopify.com — not an email address.",
  },
  url: {
    test: (v) => /^https?:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/.*)?$/i.test(v.trim()),
    message: "Enter a full link starting with https:// — not an email address.",
  },
};

/** Returns an error message when the value does not match the field's expected shape. */
export function fieldError(field: ProviderField, value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return field.optional ? null : "This field is required.";
  if (!field.pattern) return null;
  const rule = PATTERNS[field.pattern];
  return rule.test(v) ? null : rule.message;
}

export type ProviderCapabilities = {
  /** Credentials are checked against the provider before the connection is saved. */
  verified: boolean;
  /** The connection can pull contacts/customers into Xellvio on demand. */
  sync: boolean;
  /** The connection can send messages out of Xellvio. */
  send: boolean;
};

export type ProviderSpec = {
  fields: ProviderField[];
  capabilities: ProviderCapabilities;
  /** Short instruction shown above the credential fields. */
  hint?: string;
  /** Special connect experience instead of plain credential fields. */
  connectMode?: "credentials" | "xellvio_sms" | "xellvio_workspace";
  syncLabel?: string;
};

const caps = (verified: boolean, sync = false, send = false): ProviderCapabilities => ({
  verified,
  sync,
  send,
});

export const PROVIDER_SPECS: Record<string, ProviderSpec> = {
  // ── First-party Xellvio connectors ────────────────────────────────────────
  "xellvio-connect": {
    connectMode: "xellvio_workspace",
    capabilities: caps(true, true),
    syncLabel: "Pull contacts from the linked workspace",
    hint: "Paste a workspace key created in the Xellvio workspace you want to link.",
    fields: [
      {
        key: "workspace_key",
        label: "Workspace key",
        placeholder: "xvw_live_…",
        secret: true,
        help: "Created in the other workspace under Apps → Xellvio Connect.",
      },
    ],
  },
  "xellvio-sms": {
    connectMode: "xellvio_sms",
    capabilities: caps(true, false, true),
    hint: "Choose one of your verified Xellvio sending numbers.",
    fields: [],
  },

  // ── E-commerce ────────────────────────────────────────────────────────────
  shopify: {
    capabilities: caps(true, true),
    syncLabel: "Import Shopify customers as contacts",
    hint: "In Shopify: Settings → Apps and sales channels → Develop apps → create an app with read access to customers and orders, then install it and copy the Admin API access token.",
    fields: [
      { key: "shop_domain", label: "Store domain", placeholder: "example.myshopify.com", pattern: "domain" },
      { key: "access_token", label: "Admin API access token", placeholder: "shpat_…", secret: true },
    ],
  },
  woocommerce: {
    capabilities: caps(true, true),
    syncLabel: "Import WooCommerce customers as contacts",
    hint: "In WordPress: WooCommerce → Settings → Advanced → REST API → add a read-only key.",
    fields: [
      { key: "store_url", label: "Store URL", placeholder: "https://example.com", pattern: "url" },
      { key: "consumer_key", label: "Consumer key", placeholder: "ck_…", secret: true },
      { key: "consumer_secret", label: "Consumer secret", placeholder: "cs_…", secret: true },
    ],
  },
  bigcommerce: {
    capabilities: caps(true, true),
    syncLabel: "Import BigCommerce customers as contacts",
    fields: [
      { key: "store_hash", label: "Store hash", placeholder: "abc123" },
      { key: "access_token", label: "API access token", secret: true },
    ],
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  stripe: {
    capabilities: caps(true, true),
    syncLabel: "Import Stripe customers as contacts",
    hint: "Use a restricted key with read access to customers.",
    fields: [{ key: "secret_key", label: "Secret key", placeholder: "sk_live_… or rk_live_…", secret: true }],
  },
  paystack: {
    capabilities: caps(true, true),
    syncLabel: "Import Paystack customers as contacts",
    fields: [{ key: "secret_key", label: "Secret key", placeholder: "sk_live_…", secret: true }],
  },
  flutterwave: {
    capabilities: caps(true),
    fields: [{ key: "secret_key", label: "Secret key", placeholder: "FLWSECK-…", secret: true }],
  },
  paypal: {
    capabilities: caps(true),
    hint: "Create a REST app in the PayPal developer dashboard.",
    fields: [
      { key: "client_id", label: "Client ID" },
      { key: "client_secret", label: "Client secret", secret: true },
      { key: "environment", label: "Environment (live or sandbox)", placeholder: "live", optional: true },
    ],
  },

  // ── CRM / marketing ───────────────────────────────────────────────────────
  hubspot: {
    capabilities: caps(true, true),
    syncLabel: "Import HubSpot contacts",
    hint: "Create a private app in HubSpot with crm.objects.contacts.read scope.",
    fields: [{ key: "access_token", label: "Private app token", placeholder: "pat-…", secret: true }],
  },
  klaviyo: {
    capabilities: caps(true, true),
    syncLabel: "Import Klaviyo profiles as contacts",
    fields: [{ key: "api_key", label: "Private API key", placeholder: "pk_…", secret: true }],
  },
  mailchimp: {
    capabilities: caps(true),
    hint: "Mailchimp keys end with a data-centre suffix such as -us21.",
    fields: [{ key: "api_key", label: "API key", placeholder: "abc123…-us21", secret: true }],
  },
  activecampaign: {
    capabilities: caps(true, true),
    syncLabel: "Import ActiveCampaign contacts",
    fields: [
      { key: "base_url", label: "Account URL", placeholder: "https://youraccount.api-us1.com", pattern: "url" },
      { key: "api_key", label: "API key", secret: true },
    ],
  },
  brevo: {
    capabilities: caps(true, true),
    syncLabel: "Import Brevo contacts",
    fields: [{ key: "api_key", label: "API key", placeholder: "xkeysib-…", secret: true }],
  },
  pipedrive: {
    capabilities: caps(true, true),
    syncLabel: "Import Pipedrive people as contacts",
    fields: [{ key: "api_key", label: "API token", secret: true }],
  },
  gohighlevel: {
    capabilities: caps(true, true),
    syncLabel: "Import GoHighLevel contacts",
    fields: [
      { key: "access_token", label: "API / access token", secret: true },
      { key: "location_id", label: "Location ID", optional: true },
    ],
  },

  // ── Messaging / notifications ─────────────────────────────────────────────
  slack: {
    capabilities: caps(true, false, true),
    hint: "Create an incoming webhook for the channel Xellvio should post to.",
    fields: [
      { key: "webhook_url", label: "Incoming webhook URL", placeholder: "https://hooks.slack.com/services/…", secret: true, pattern: "url" },
    ],
  },
  discord: {
    capabilities: caps(true, false, true),
    fields: [{ key: "webhook_url", label: "Channel webhook URL", secret: true, pattern: "url" }],
  },
  twilio: {
    capabilities: caps(true),
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "AC…" },
      { key: "auth_token", label: "Auth token", secret: true },
    ],
  },

  // ── Automation / webhooks ─────────────────────────────────────────────────
  webhooks: {
    capabilities: caps(true, false, true),
    hint: "Xellvio sends a signed test payload to this URL to confirm it is reachable.",
    fields: [
      { key: "endpoint", label: "Endpoint URL", placeholder: "https://api.example.com/xellvio", pattern: "url" },
      { key: "secret", label: "Signing secret", secret: true, optional: true },
    ],
  },
  zapier: { capabilities: caps(true, false, true), fields: [{ key: "endpoint", label: "Zap webhook URL", placeholder: "https://hooks.zapier.com/…", pattern: "url" }] },
  make: { capabilities: caps(true, false, true), fields: [{ key: "endpoint", label: "Make webhook URL", placeholder: "https://hook.eu1.make.com/…", pattern: "url" }] },
  n8n: { capabilities: caps(true, false, true), fields: [{ key: "endpoint", label: "n8n webhook URL", pattern: "url" }] },

  // ── AI ────────────────────────────────────────────────────────────────────
  openai: { capabilities: caps(true), fields: [{ key: "api_key", label: "API key", placeholder: "sk-…", secret: true }] },
  claude: { capabilities: caps(true), fields: [{ key: "api_key", label: "API key", placeholder: "sk-ant-…", secret: true }] },
  gemini: { capabilities: caps(true), fields: [{ key: "api_key", label: "API key", secret: true }] },

  // ── Support ───────────────────────────────────────────────────────────────
  zendesk: {
    capabilities: caps(true),
    fields: [
      { key: "subdomain", label: "Zendesk subdomain", placeholder: "yourbrand" },
      { key: "email", label: "Agent email" },
      { key: "api_token", label: "API token", secret: true },
    ],
  },
  intercom: { capabilities: caps(true, true), syncLabel: "Import Intercom contacts", fields: [{ key: "access_token", label: "Access token", secret: true }] },
  notion: { capabilities: caps(true), fields: [{ key: "access_token", label: "Internal integration token", placeholder: "ntn_…", secret: true }] },
};

/** Fallback fields for apps without a bespoke connector yet. */
export function fallbackFields(authType: string, appName: string): ProviderField[] {
  switch (authType) {
    case "api_key":
      return [
        { key: "api_key", label: `${appName} API key`, placeholder: "Paste your API key", secret: true },
        { key: "account_id", label: "Account or store reference", placeholder: "Optional", optional: true },
      ];
    case "bearer_token":
      return [
        { key: "access_token", label: "Access token", secret: true },
        { key: "base_url", label: "Base URL", placeholder: "https://your-instance.example.com", optional: true, pattern: "url" },
      ];
    case "oauth2":
      return [
        { key: "client_id", label: "Client ID" },
        { key: "client_secret", label: "Client secret", secret: true },
        { key: "account_id", label: "Account reference", placeholder: "Workspace, store or location id", optional: true },
      ];
    case "none":
      return [];
    default:
      return [
        { key: "endpoint", label: "Endpoint URL", placeholder: "https://api.example.com", pattern: "url" },
        { key: "secret", label: "Signing secret", secret: true, optional: true },
      ];
  }
}

export function specFor(slug: string, authType: string, appName: string): ProviderSpec {
  const spec = PROVIDER_SPECS[slug];
  if (spec) return spec;
  return {
    fields: fallbackFields(authType, appName),
    capabilities: caps(false),
    connectMode: "credentials",
  };
}
