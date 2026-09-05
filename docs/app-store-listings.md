# Getting Xellvio listed on external app stores

Xellvio's own App Marketplace (inside the product) is separate from the public
app stores run by Shopify, BigCommerce, WooCommerce and others. To be listed
there, Xellvio has to be submitted as a public app on each platform. Each one
has its own account, review process and technical requirements.

## What every store requires

1. A partner/developer account for that platform.
2A public OAuth flow (install link → provider consent → callback) instead of
   pasting API keys. Users must never be asked for a raw token.
3. A public app listing: name, tagline, long description, category, pricing,
   screenshots, icon, support email, privacy policy URL, terms URL.
4. Webhook handling for app uninstall / data-deletion requests.
5. Review by the platform (days to weeks).

Existing Xellvio pieces that satisfy some of this:

- Public endpoints live under `src/routes/api/public/*` (no site auth, verify
  the caller inside the handler).
- `app_oauth_states` already exists for OAuth state round-trips.
- Credentials are encrypted server-side (`src/lib/tenant-crypto.server.ts`).
- Connector runtimes live in `src/lib/marketplace/providers.server.ts`.

## Per-platform status

| Store | What is needed next |
| --- | --- |
| Shopify App Store | Shopify Partner account, public app with OAuth + `app/uninstalled` and GDPR mandatory webhooks, billing API if paid. Current Shopify connector uses an Admin API token (custom-app style), which works today but is not accepted for a public listing. |
| BigCommerce Marketplace | BigCommerce Partner account, single-click app OAuth (`/auth`, `/load`, `/uninstall` callbacks). |
| WooCommerce Marketplace | WooCommerce.com vendor account. Requires a distributable WordPress plugin, not just an API integration. |
| Wix App Market | Wix Dev Center app with OAuth and webhooks. |
| HubSpot / Klaviyo / Zendesk / Intercom / Slack / Notion | Public app in each developer console with OAuth; listings reviewed individually. |

## Information needed from the business

- Legal company name and support email for listings.
- Public privacy policy and terms URLs (Xellvio already hosts legal pages).
- Pricing model to declare for each store.
- Logo/icon at each store's required sizes and 3-6 product screenshots.
- Confirmation of which stores to pursue first (Shopify usually has the best
  return for SMS marketing).

Once a partner account exists for a platform, the OAuth install flow for that
platform is implemented as public routes plus a connector runtime, then the
listing is submitted for review.
