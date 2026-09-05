// ============================================================================
// Plain-English, step-by-step instructions for getting the details each app
// asks for. Shown in the connect dialog and on the app page so nobody has to
// guess where a token lives.
// ============================================================================

export type SetupGuide = {
  /** Numbered steps, written for someone who has never opened the provider's settings. */
  steps: string[];
  /** Official documentation for the credential being requested. */
  docsUrl?: string;
  docsLabel?: string;
};

const GUIDES: Record<string, SetupGuide> = {
  /* ── First-party ───────────────────────────────────────────────────────── */
  "xellvio-connect": {
    steps: [
      "Sign in to the other Xellvio workspace you want to link.",
      "Open Apps → Xellvio Connect in that workspace.",
      "Click Create workspace key and copy the key that starts with xvw_live_.",
      "Come back here and paste it below. The key only allows contact syncing.",
    ],
  },
  "xellvio-sms": {
    steps: [
      "Finish Sender setup so you have at least one verified number.",
      "Pick the number you want apps and automations to send from.",
      "Choose Verify & connect — nothing is sent until an automation runs.",
    ],
  },

  /* ── E-commerce ────────────────────────────────────────────────────────── */
  shopify: {
    steps: [
      "Sign in to your Shopify admin (admin.shopify.com).",
      "Go to Settings (bottom left) → Apps and sales channels.",
      "Click Develop apps → Allow custom app development if Shopify asks, then Create an app. Name it “Xellvio”.",
      "Open Configuration → Admin API integration → Configure, and tick read_customers and read_orders. Save.",
      "Open the API credentials tab and click Install app.",
      "Under Admin API access token click Reveal token once and copy it — it starts with shpat_ and Shopify shows it only one time.",
      "Paste your store address (example.myshopify.com) and that token below.",
    ],
    docsUrl: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    docsLabel: "Shopify: create and install a custom app",
  },
  woocommerce: {
    steps: [
      "Sign in to your WordPress admin.",
      "Go to WooCommerce → Settings → Advanced → REST API.",
      "Click Add key, describe it as “Xellvio”, choose your user and set Permissions to Read.",
      "Click Generate API key and copy both the Consumer key (ck_…) and Consumer secret (cs_…) before leaving the page.",
      "Paste your shop address and both values below.",
    ],
    docsUrl: "https://woocommerce.com/document/woocommerce-rest-api/",
    docsLabel: "WooCommerce REST API keys",
  },
  bigcommerce: {
    steps: [
      "In your BigCommerce control panel go to Settings → API → Store-level API accounts.",
      "Click Create API account, name it “Xellvio” and give Customers and Orders read-only scopes.",
      "Save — BigCommerce downloads a text file with your credentials.",
      "Copy the Access token from that file, and take the store hash from your API path (…/stores/STOREHASH/).",
    ],
    docsUrl: "https://support.bigcommerce.com/s/article/Store-API-Accounts",
    docsLabel: "BigCommerce API accounts",
  },

  /* ── Payments ──────────────────────────────────────────────────────────── */
  stripe: {
    steps: [
      "Sign in to the Stripe dashboard.",
      "Go to Developers → API keys.",
      "Click Create restricted key, name it “Xellvio” and set Customers to Read. Leave everything else at None.",
      "Create the key and copy it (rk_live_…). Paste it below.",
    ],
    docsUrl: "https://docs.stripe.com/keys#create-restricted-api-secret-key",
    docsLabel: "Stripe restricted keys",
  },
  paystack: {
    steps: [
      "Sign in to your Paystack dashboard.",
      "Go to Settings → API Keys & Webhooks.",
      "Copy the Secret key (sk_live_… for a live account) and paste it below.",
    ],
    docsUrl: "https://support.paystack.com/en/articles/2130754",
  },
  flutterwave: {
    steps: [
      "Sign in to the Flutterwave dashboard.",
      "Go to Settings → API.",
      "Copy the Secret key (FLWSECK-…) and paste it below.",
    ],
  },
  paypal: {
    steps: [
      "Go to developer.paypal.com and sign in.",
      "Open Apps & Credentials and choose Live (or Sandbox for testing).",
      "Click Create App, name it “Xellvio” and create it.",
      "Copy the Client ID, then click Show under Secret and copy the Client secret.",
      "Type live or sandbox in the environment field so we call the right PayPal.",
    ],
    docsUrl: "https://developer.paypal.com/api/rest/",
  },

  /* ── CRM / marketing ──────────────────────────────────────────────────── */
  hubspot: {
    steps: [
      "In HubSpot click the settings gear → Integrations → Private apps.",
      "Click Create a private app and name it “Xellvio”.",
      "On the Scopes tab tick crm.objects.contacts.read.",
      "Create the app, then click Show token and copy it (pat-…).",
    ],
    docsUrl: "https://developers.hubspot.com/docs/guides/apps/private-apps/overview",
    docsLabel: "HubSpot private apps",
  },
  klaviyo: {
    steps: [
      "In Klaviyo open the account menu → Settings → API keys.",
      "Click Create private API key, name it “Xellvio” and give it read access to Profiles.",
      "Copy the key (pk_…) and paste it below.",
    ],
    docsUrl: "https://help.klaviyo.com/hc/en-us/articles/7423954176283",
  },
  mailchimp: {
    steps: [
      "In Mailchimp click your profile → Account & billing → Extras → API keys.",
      "Click Create A Key and copy it.",
      "The key ends with your data centre, for example -us21. Paste the whole thing below.",
    ],
    docsUrl: "https://mailchimp.com/help/about-api-keys/",
  },
  activecampaign: {
    steps: [
      "In ActiveCampaign go to Settings → Developer.",
      "Copy the API URL (https://youraccount.api-us1.com) and the API key shown there.",
    ],
  },
  brevo: {
    steps: [
      "In Brevo open the account menu → SMTP & API → API keys.",
      "Click Generate a new API key, name it “Xellvio” and copy the key (xkeysib-…).",
    ],
  },
  pipedrive: {
    steps: [
      "In Pipedrive click your avatar → Personal preferences → API.",
      "Copy your personal API token and paste it below.",
    ],
  },
  gohighlevel: {
    steps: [
      "In GoHighLevel open Settings → Business Profile → API keys (or Private integrations).",
      "Create a token with contact read access and copy it.",
      "Optionally copy the Location ID from Settings → Business Profile if you manage several locations.",
    ],
  },

  /* ── Messaging ────────────────────────────────────────────────────────── */
  slack: {
    steps: [
      "Go to api.slack.com/apps and click Create New App → From scratch. Name it “Xellvio” and pick your workspace.",
      "Open Incoming Webhooks and switch Activate Incoming Webhooks on.",
      "Click Add New Webhook to Workspace, choose the channel and allow it.",
      "Copy the webhook URL (https://hooks.slack.com/services/…) and paste it below.",
    ],
    docsUrl: "https://api.slack.com/messaging/webhooks",
  },
  discord: {
    steps: [
      "In Discord open the channel's Edit Channel → Integrations → Webhooks.",
      "Click New Webhook, name it “Xellvio”, then Copy Webhook URL.",
    ],
  },
  twilio: {
    steps: [
      "Sign in to the Twilio console.",
      "On the dashboard copy the Account SID (starts with AC).",
      "Click to reveal the Auth token and copy it.",
    ],
  },

  /* ── Automation / webhooks ────────────────────────────────────────────── */
  webhooks: {
    steps: [
      "Decide which URL on your own system should receive Xellvio events.",
      "Make sure it accepts POST requests over https and replies with 200.",
      "Optionally choose any strong random string as a signing secret and store the same value on your side so you can verify our signature.",
      "Paste the URL below — we send one signed test payload before saving.",
    ],
  },
  zapier: {
    steps: [
      "In Zapier create a Zap with the Webhooks by Zapier trigger → Catch Hook.",
      "Copy the custom webhook URL Zapier shows you and paste it below.",
    ],
  },
  make: {
    steps: [
      "In Make create a scenario starting with the Custom webhook module.",
      "Click Add, name the hook and copy the generated URL.",
    ],
  },
  n8n: {
    steps: [
      "In n8n add a Webhook node to a workflow and set the method to POST.",
      "Copy the Production URL and activate the workflow.",
    ],
  },

  /* ── AI ───────────────────────────────────────────────────────────────── */
  openai: {
    steps: [
      "Sign in at platform.openai.com.",
      "Open Dashboard → API keys → Create new secret key.",
      "Copy the key (sk-…) — it is shown only once.",
    ],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  claude: {
    steps: [
      "Sign in at console.anthropic.com.",
      "Open Settings → API keys → Create key.",
      "Copy the key (sk-ant-…) straight away.",
    ],
  },
  gemini: {
    steps: [
      "Go to aistudio.google.com and sign in.",
      "Open Get API key → Create API key.",
      "Copy the key and paste it below.",
    ],
  },

  /* ── Support ──────────────────────────────────────────────────────────── */
  zendesk: {
    steps: [
      "In Zendesk go to Admin Center → Apps and integrations → APIs → Zendesk API.",
      "Turn Token access on, then click Add API token and copy it.",
      "Your subdomain is the first part of your Zendesk address (yourbrand.zendesk.com → yourbrand).",
      "Use the email address of an agent account below.",
    ],
    docsUrl: "https://support.zendesk.com/hc/en-us/articles/4408889192858",
  },
  intercom: {
    steps: [
      "Go to developers.intercom.com and open your developer hub.",
      "Create an app for your workspace, then open Authentication.",
      "Copy the access token with read access to contacts.",
    ],
  },
  notion: {
    steps: [
      "Go to notion.so/my-integrations and click New integration.",
      "Name it “Xellvio”, pick your workspace and submit.",
      "Copy the Internal Integration Token (ntn_…).",
      "In Notion open the page or database you want to share, click … → Connections → Xellvio.",
    ],
    docsUrl: "https://developers.notion.com/docs/create-a-notion-integration",
  },

  /* ── Forms & scheduling ───────────────────────────────────────────────── */
  typeform: {
    steps: [
      "In Typeform click your avatar → Settings → Personal tokens.",
      "Click Generate a new token, name it “Xellvio” and allow read access to responses.",
      "Copy the token — it is only shown once.",
    ],
  },
  jotform: {
    steps: [
      "In Jotform open Account → API (or click your avatar → Settings → API).",
      "Click Create new key and set it to Read only.",
      "Copy the key. If your account is EU-hosted type eu in the region field.",
    ],
  },
  calendly: {
    steps: [
      "In Calendly open Integrations & apps → API & webhooks.",
      "Under Personal access tokens click Generate new token, name it “Xellvio”.",
      "Copy the token before closing the window.",
    ],
  },

  /* ── Enterprise CRM ───────────────────────────────────────────────────── */
  salesforce: {
    steps: [
      "In Salesforce Setup search for App Manager and create a Connected App with the API (api) and refresh_token scopes.",
      "Use it to obtain an access token (your Salesforce admin or developer can run the OAuth flow).",
      "Your instance URL is shown in the browser address bar, for example https://yourorg.my.salesforce.com.",
      "Paste the instance URL and access token below.",
    ],
    docsUrl: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm",
  },
  "zoho-crm": {
    steps: [
      "Go to api-console.zoho.com and create a Self Client or Server-based app.",
      "Generate a token with the ZohoCRM.modules.contacts.READ scope.",
      "Copy the access token. If your account is not on .com, enter your API domain (for example www.zohoapis.eu).",
    ],
  },

  /* ── Meta ─────────────────────────────────────────────────────────────── */
  instagram: {
    steps: [
      "Go to developers.facebook.com and open (or create) your app.",
      "Add the Instagram product and connect the professional account.",
      "Use the Graph API Explorer or Access Token tool to generate a long-lived access token and copy it.",
    ],
  },
  whatsapp: {
    steps: [
      "Go to developers.facebook.com → your app → WhatsApp → API setup.",
      "Copy the Phone number ID shown for your sending number.",
      "Copy the temporary access token to test, or create a System User token in Business Settings for a permanent one.",
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  },
  "meta-pixel": {
    steps: [
      "Open Meta Events Manager (business.facebook.com/events_manager).",
      "Select your pixel — the ID is the long number shown under its name.",
      "Paste that number below.",
    ],
  },

  /* ── Website / analytics ──────────────────────────────────────────────── */
  wix: {
    steps: [
      "Go to manage.wix.com → Settings → API keys (Wix account level).",
      "Click Generate API key, allow the permissions you need and copy the key once.",
      "Your Site ID is shown on the same screen under Site selection, or in your dashboard URL.",
    ],
  },
  hotjar: {
    steps: [
      "Sign in to Hotjar and open Sites & organizations.",
      "Copy the Site ID number next to the site you want to track.",
    ],
  },
  "google-sheets": googleGuide("Sheets"),
  "google-calendar": googleGuide("Calendar"),
  "google-analytics": googleGuide("Analytics"),
  "google-ads": googleGuide("Ads"),
};

function googleGuide(product: string): SetupGuide {
  return {
    steps: [
      "Go to console.cloud.google.com and pick (or create) a project.",
      `Open APIs & Services → Library and enable the Google ${product} API.`,
      "Open APIs & Services → Credentials → Create credentials → OAuth client ID (Web application).",
      "Use the OAuth playground or your own flow to produce an access token for that client.",
      "Paste the access token below. Add the spreadsheet, calendar or property reference if we ask for one.",
    ],
    docsUrl: "https://developers.google.com/identity/protocols/oauth2",
    docsLabel: "Google OAuth 2.0 basics",
  };
}

const FALLBACKS: Record<string, string[]> = {
  api_key: [
    "Sign in to the app you want to connect.",
    "Open its settings and look for Developer, API or Integrations.",
    "Create a new API key with read access only and name it “Xellvio”.",
    "Copy the key immediately — most apps show it only once — and paste it below.",
  ],
  bearer_token: [
    "Sign in to the app and open its developer or API settings.",
    "Create an access token (sometimes called a personal token) with read access.",
    "Copy the token and paste it below. Add the base URL if your account is self-hosted.",
  ],
  oauth2: [
    "Sign in to the app and open its developer settings.",
    "Create an app or integration and copy the Client ID and Client secret.",
    "Add your account, store or location reference if you manage more than one.",
  ],
  webhook: [
    "Choose the URL on your side that should receive Xellvio events.",
    "Make sure it accepts POST over https and replies 200.",
    "Optionally set a signing secret so you can verify our requests.",
  ],
};

/** Step-by-step help for a marketplace app, falling back to its auth style. */
export function guideFor(slug: string, authType: string): SetupGuide {
  const guide = GUIDES[slug];
  if (guide) return guide;
  return { steps: FALLBACKS[authType] ?? FALLBACKS["api_key"]! };
}
