## Goal

Stop end users from ever seeing the `donotreply@twilio.com` email, and instead notify them with your own Xellvio-branded emails from `admin@xellvio.com`.

## How it works (plain English)

1. When a user submits a toll-free verification, we send Twilio our internal email (`admin@xellvio.com`) as the contact — so Twilio's emails (submitted / approved / rejected / follow-up questions) go to you, not the customer.
2. The customer instead receives Xellvio-branded emails from `admin@xellvio.com` at each stage: submitted, approved, rejected (with the friendly reason), and an info notice if Twilio asks for more info.
3. To send branded email from your own domain we need to set up `xellvio.com` (or a subdomain like `notify.xellvio.com`) as a verified email domain. You'll add a few DNS records once.

## What changes in the app

### 1. Twilio submission — internal contact email
- File: `src/lib/tollfree-verification.functions.ts`
- In the submit flow, replace the user-supplied `notificationEmail` we send to Twilio with the constant `admin@xellvio.com` (kept in a single `INTERNAL_TFV_CONTACT_EMAIL` constant for easy change later).
- Still store the customer's own email on the request so we can notify them with branded emails.

### 2. Branded email domain (Lovable Emails)
- Set up an email sender domain for Xellvio. You'll be prompted to add NS records at your DNS provider (one-time). DNS can take up to 72h to verify but we can scaffold templates immediately.
- Set up email infrastructure (queue, send log, suppression list) — automatic.

### 3. Branded email templates (React Email, Xellvio brand)
New templates in `src/lib/email-templates/`:
- `tollfree-submitted.tsx` — "We've submitted your toll-free verification"
- `tollfree-approved.tsx` — "Your toll-free number is approved"
- `tollfree-rejected.tsx` — "Action needed on your toll-free verification" (shows the friendly rejection reason + link back to the Set up SMS page)
- `tollfree-info-requested.tsx` — "We need a bit more info" (used if you forward Twilio follow-ups)

Each template uses Xellvio colors/logo, white background, sent from `admin@xellvio.com`.

### 4. Triggering branded emails
- On TFV submit success → enqueue `tollfree-submitted` to the customer's email.
- In `src/routes/api.public.twilio-tollfree-status.ts` (webhook from Twilio): after updating `sender_assets.verification_status`, enqueue `tollfree-approved` or `tollfree-rejected` to the customer's email (looked up from the request row / account).
- All sends use an `idempotencyKey` like `tfv-{verification_sid}-{status}` so retries don't duplicate.

### 5. Admin-side follow-up flow (optional but recommended)
- Add a small "Forward to customer" action on the existing admin TFV attempts page (`src/routes/_authenticated.admin.tollfree-attempts.tsx`) that sends the `tollfree-info-requested` branded email with a custom note — so when Twilio emails you at admin@xellvio.com with a question, one click relays it to the customer under your brand.

## What you'll need to do
1. Approve this plan.
2. When prompted, complete the email-domain setup dialog (add the NS records Lovable shows you at your DNS registrar for xellvio.com).
3. That's it — everything else is code I'll write.

## Notes / caveats
- Until DNS verifies, branded emails will be queued but won't actually deliver. The Twilio contact-email change works immediately and is independent of DNS.
- The customer's email is still saved on the TFV request so the branded notifications can reach them; only Twilio sees `admin@xellvio.com`.
- Twilio approval is unaffected — they only care that someone answers if they ask a question. As long as you monitor admin@xellvio.com, approval timelines stay the same.
