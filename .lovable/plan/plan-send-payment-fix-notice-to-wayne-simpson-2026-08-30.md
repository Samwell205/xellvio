# Plan: Send payment-fix notice to Wayne Simpson

## Goal
Email `scottiesimpson13@gmail.com` (Wayne Simpson) to let him know the checkout issue that blocked his $50 Paystack payment on Aug 29 is now resolved and that international card payments are live.

## What happened
- Wayne Simpson signed up Aug 29, 2026 and attempted a $50 USD top-up via Paystack; the payment was cancelled (status: `cancelled`).
- The checkout was subsequently fixed — Stripe international card support and tax-code handling were added.

## Action
Send the drafted tenant notice to Wayne Simpson via the existing `adminSendTenantNotice` server function (the Admin → Tenant notices tool at `/admin/email`).

### Message content
- **Subject:** Your payment is ready to go — international checkout is now live
- **Heading:** We've fixed checkout — pay from anywhere
- **Body:** Personalized with `{{name}}` (resolves to "Wayne"). Explains the failed payment, confirms the fix, announces international card support, and invites him to top up from the dashboard. Includes a support fallback ("reply to this email").
- **CTA:** button labelled "Add credits" linking to `https://www.xellvio.com/app/checkout`

## Recipient
- Single tenant: `4212ba16-5f39-45aa-9c4d-47a7f36e7936` (Wayne Simpson)

## Delivery
- Uses the `generic` email template through the existing transactional email pipeline (`sendBrandedEmail`).
- The email is queued and delivered through the platform's sender domain.
- An entry will appear in the "Recent email activity" table on the Admin → Tenant notices page.

## Verification
- After sending, confirm a `pending`/`sent` row appears in `email_send_log` for this recipient.
- Report the send status back to the user.
