# Switch email sending to Resend (no behaviour change for tenants)

Goal: emails (invites, password resets, verification, toll-free notifications, team invites) go out through your Resend account and verified domain, while everything tenants see and use on the site stays exactly as it is.

## What changes

1. **Save your Resend API key** securely as a project secret. Nothing is hardcoded, nothing is exposed to the browser.
2. **No code changes needed to switch.** The mailer already prefers Resend automatically as soon as the key exists, and falls back to the managed sender if it is ever missing. So the switch is configuration-only.
3. **Confirm the From address matches your verified Resend domain.** Right now emails are sent as `Xellvio <admin@xellvio.com>`. If your Resend-verified domain is `xellvio.com`, nothing changes. If you verified a subdomain instead, I adjust that one line so Resend accepts the send.
4. **Send one test email to your own address** and confirm it delivers, then report the result.

Nothing else is touched: no UI, no pricing, no dispatcher, no database schema, no tenant-visible behaviour.

## What I would use Supabase for

Read-only, unless you ask me to change data:

- **Diagnostics**: inspect campaigns, message delivery status, credit balances, payments, email send logs when you report a problem.
- **Verification**: after any fix, confirm the actual rows look right instead of guessing.
- **Reports**: answer questions like "how much did tenant X spend" or "how many messages are stuck".

I only write to the database when you explicitly ask (refunds, credit adjustments, requeueing stuck messages), and always with a migration or a clearly described data change you approve first.

## What I would use Resend for

Only outbound app and auth email from your own domain:

- Account signup / email verification codes
- Password reset and magic links
- Team and workspace invites
- Toll-free verification status notifications (submitted / approved / rejected / info requested)
- Admin notifications

No marketing or bulk email goes through it. Your SMS sending path is completely separate and untouched.

## Technical notes

- `src/lib/email/mailer.server.ts` already branches on `RESEND_API_KEY`; adding the secret activates the Resend path, including `List-Unsubscribe` headers and idempotency keys.
- Self-hosted deploys read the same variable, so the key must also be mirrored as a Cloudflare Worker secret for the live site to use Resend.
- `SENDER_DOMAIN` / `FROM_DOMAIN` live in `src/lib/email/send-internal.server.ts`; only `FROM_DOMAIN` matters to Resend.
