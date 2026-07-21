# Prohibited Content — Public Page

Xellvio already defines the prohibited list in code (`src/lib/tos.ts` → `TOS_PROHIBITED_CATEGORIES`, plus the SHAFT + fraud/lender categories in `src/lib/content-scanner.ts`). Right now it's only surfaced inside the Terms of Service. This plan exposes it as a first-class public page that tenants and prospects can read directly, and makes it easy for you to share the link.

## What people can't send (the list I'll publish)

Grouped for readability on the page:

**SHAFT & regulated goods**
- Sexual, adult, or explicit content
- Hate speech, harassment, threats, extremist content
- Alcohol promotions/sales
- Firearms, ammunition, weapon accessories
- Tobacco, vaping, e-cigarettes, nicotine products
- Cannabis, CBD, THC, delta-8/9/10, hemp derivatives
- Prescription pharmaceuticals or illegal drugs

**Financial / high-risk**
- Payday, high-APR, tax-relief, or predatory lending
- Debt collection, debt relief, credit repair
- Gambling, sports betting, lotteries, casino promotions
- Cryptocurrency promotions, airdrops, giveaways, OTP-relay
- "Get rich quick", MLM, pyramid schemes, guaranteed-income offers

**Fraud & deception**
- Phishing, account-verification scams, "urgent action required"
- Fake prize / package / IRS / refund notices
- Impersonation of banks, carriers, government, or brands
- Unsolicited real estate outreach

**Legal catch-all**
- Anything violating TCPA (US), CASL (Canada), GDPR/ePrivacy (EU/UK), CTIA/TCR, or the destination country's telecom regulator
- Anything violating the upstream carrier's Acceptable Use Policy
- Messages sent without documented opt-in consent

## Changes

1. **New route** `src/routes/prohibited-content.tsx`
   - Uses existing `LegalPage` component style so it matches `/terms`, `/aup`, etc.
   - Renders the grouped list above with short explanations, plus a note that violations trigger automatic screening, holds, or suspension (matches `content-scanner.ts` behavior).
   - Head metadata: title "Prohibited Content — Xellvio", description under 160 chars, og:title/og:description.

2. **Content source** `src/content/legal.ts`
   - Add a `prohibited-content` entry so the page reuses the shared legal renderer and stays consistent with TOS wording.

3. **Navigation surfaces**
   - Add "Prohibited content" link to the marketing footer (`src/components/MarketingFooter.tsx`) under the Legal column, next to AUP / Anti-Spam.
   - Add it to `public/llms.txt` under Optional so it's discoverable.
   - Link to it from the Setup SMS page and the Campaign compose page ("See what you can't send") so tenants see it before sending.

4. **Sitemap** `src/routes/sitemap[.]xml.ts`
   - Add `/prohibited-content` so search engines index it.

No backend, schema, or business-logic changes — this is presentation only. The prohibited list already drives screening; this just makes it publicly visible at `https://xellvio.com/prohibited-content` so you can share one link.

## Deliverable link

After build: `https://xellvio.com/prohibited-content` (also reachable from the footer of every marketing page).
