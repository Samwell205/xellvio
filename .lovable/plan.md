# Tenant bulk email campaigns

Goal: let each tenant compose one email, pick an audience from their contact lists, and send it to thousands of recipients — each personalized, each tracked as sent / failed / bounced / opened / clicked / unsubscribed. Mirrors your SMS campaign model, but on the email channel.

## Why a separate transport (not Lovable's built-in email)

Lovable's built-in email (`notify.xellvio.com`) is transactional-only by policy: one recipient who expects the email from a specific action. Bulk campaigns to contact lists are marketing email and must not go through it — mixing the two damages deliverability for your auth/receipt emails.

So bulk email campaigns route through **Resend** (a dedicated marketing provider). Your code already integrates it (`src/lib/email/mailer.server.ts` branches on `RESEND_API_KEY`); the key just isn't set yet. This keeps auth/receipt emails on Lovable's reliable path and puts marketing blasts on Resend, exactly as email best practice recommends.

## Prerequisite you complete first (configuration only)

1. **Add a Resend API key** as a project secret (`RESEND_API_KEY`). I'll add it once you give me the key, or you can paste it into the Secrets panel.
2. **Verify a sending subdomain in Resend** — because `notify.xellvio.com` is delegated to Lovable, Resend can't verify it. Verify a different subdomain (e.g. `mail.xellvio.com`) in your Resend account and add the DNS records Resend shows you at your registrar. Bulk campaigns send from `Xellvio <mail@mail.xellvio.com>` (or whatever you verify).

These are the only steps that need you. Everything below I build.

## Schema (one migration)

- `profiles.email` — new nullable `text` column + index. Right now emails only live inside `custom_fields`, so bulk email isn't possible until contacts have a real email field.
- `consents` — already flexible (`channel` is free-text). Email opt-in is stored as `channel = 'email'` rows. No enum change. (You chose separate email opt-in, so a contact subscribed to SMS is not emailed unless they also have an email consent row.)
- `email_campaigns` — new table: `id`, `account_id`, `name`, `subject`, `preheader`, `html_body`, `text_body`, `from_name`, `cta_text`, `cta_url`, `status` (draft/sending/sent/paused/failed), `audience` (jsonb: list_ids / segment / profile ids), counters (sent/failed/bounced/opened/clicked/unsubscribed), `created_by`, timestamps. RLS account-scoped, like `campaigns`.
- `email_campaign_messages` — new table: `id`, `campaign_id`, `profile_id`, `recipient_email`, `status` (queued/sending/sent/failed/bounced/opened/clicked/unsubscribed/dropped), `resend_message_id`, `error_message`, timestamps. RLS account-scoped, like `messages`.
- Reuse the existing `suppressed_emails` table for bounce/complaint/unsubscribe suppression across email campaigns (it already keys by address).
- `GRANT` + RLS on every new public table (account-scoped, `has_account_access` like the SMS tables).

## Sending path (Resend-direct, dedicated queue)

- A dedicated `email_campaigns` pgmq queue, separate from the Lovable `transactional_emails` queue. This keeps marketing traffic off the transactional path entirely.
- A `/api/public/dispatch-email-campaign` worker route, mirroring your SMS dispatcher: triggered on enqueue + by pg_cron, drains in batches, respects a per-campaign and platform throttle.
- Per recipient: suppression check → personalize (`{{name}}`) → render HTML + plain text → mint an unsubscribe token → enqueue with idempotency key `email-<campaignId>-<profileId>`. The worker calls Resend directly through the existing `sendMail` (Resend branch), with `List-Unsubscribe` one-click headers.
- Pause/resume and "Stop & mark as sent" controls, exactly like SMS campaigns.

## Tracking (opens + link clicks)

You chose opens + clicks. Two options, I'll use whichever is simpler at build time:

- **Resend native tracking** — enable Resend's open pixel + click tracking on each send, then receive events via a webhook.
- **Self-hosted tracking domain** — rewrite links to a click-redirect on a tracking subdomain and embed an open pixel; more control, more DNS setup.

Either way: a `/api/public/resend-webhook` route verifies the Resend signature and handles `delivered`, `opened`, `clicked`, `bounced`, `complained`, `failed` events — updating `email_campaign_messages` status and campaign counters. Bounce/complaint → insert into `suppressed_emails` so that address is never emailed again.

## Compliance (can't skip)

- **Unsubscribe** — one-click unsubscribe per recipient (reuse your unsubscribe-token flow + the `/email/unsubscribe` page).
- **Suppression** — checked before every send; bounces/complaints/unsubscribes permanently suppress the address.
- **Physical address** — CAN-SPAM requires a real postal address in the footer of marketing email. I'll add a platform setting for the company address and inject it into the campaign footer.
- **Content screening** — run the existing content scanner (gambling/spam) on the campaign body before sending, so tenants can't blast prohibited content over email either.
- **Throttling** — per-campaign and platform-wide rate limits to protect deliverability and your Resend quota.

## UI (tenant-facing, mirrors SMS campaigns)

- New **Email campaigns** section under `/app`: composer (subject, preheader, rich-text/HTML body, optional CTA, optional image), audience picker filtered to email-consented contacts who have an email, live recipient count, send/schedule, pause/resume, stop & mark sent.
- **Report page**: sent / delivered / failed / bounced / opened / clicked / unsubscribed counts, open rate, click rate, per-recipient table.
- **Admin oversight** (optional, can defer): aggregate view of all tenants' email campaigns.

## Pricing: decided later

No per-send billing in v1 — tenant balances are not debited for email sends. We wire pricing in a follow-up once you decide the model.

## What's reused vs new

- **Reused**: branded email layout, content scanner, suppression table, unsubscribe-token flow, account/acting-account + permission guards, `sendMail` Resend branch.
- **New**: `email_campaigns` + `email_campaign_messages` tables, dedicated queue + dispatcher route, Resend webhook route, tenant Email campaigns UI, physical-address setting.

## Build order

1. Resend key + verified marketing subdomain (you).
2. Migration: `profiles.email`, consent rows, `email_campaigns`, `email_campaign_messages`, grants + RLS.
3. Dispatcher queue + worker route (Resend-direct, throttle, suppression, unsubscribe).
4. Resend webhook route → status + counters + suppression.
5. Content screening + CAN-SPAM footer (postal address).
6. Tenant Email campaigns UI (compose → audience → send → report, pause/resume/stop).
7. Verify one real send end-to-end (sent → delivered → opened → clicked → unsubscribed).
