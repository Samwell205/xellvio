# Running Xellvio in VS Code (and deploying it yourself)

The database, auth users, storage and all SQL functions already live on your own
Supabase project (see `migration-kit/STATUS.md`). This document covers the app
itself: running it locally, deploying it to Cloudflare Workers, and replacing the
four pieces that Lovable currently provides.

---

## 1. Local setup

```bash
git clone <your repo url>
cd <repo>
bun install            # or: npm install
cp .env.example .env   # then fill in real values
bun run dev:selfhost   # http://localhost:8080
```

Requirements: Bun 1.1+ (or Node 20+ with npm), and the Supabase CLI if you want
to regenerate types.

Regenerate database types after any schema change:

```bash
supabase gen types typescript --project-id <your-project-ref> \
  > src/integrations/supabase/types.ts
```

### Why there are two Vite configs

| File                      | Used by                                   |
| ------------------------- | ----------------------------------------- |
| `vite.config.ts`          | the Lovable editor/preview (keep as-is)   |
| `vite.config.selfhost.ts` | local dev + your own Cloudflare deploys   |

The self-hosted config declares explicitly what `@lovable.dev/vite-tanstack-config`
bundled implicitly: TanStack Start, React, Tailwind v4, tsconfig paths, the
`entities` aliases and the Cloudflare/nitro build target.

Once you have fully cut over, delete `vite.config.ts`, rename
`vite.config.selfhost.ts` to `vite.config.ts`, drop the `@lovable.dev/*`
dependencies you no longer use, and simplify the scripts back to `dev`/`build`.

---

## 2. Deploying to Cloudflare Workers

```bash
bun run build:selfhost     # -> .output/
bunx wrangler deploy -c .output/server/wrangler.json
```

Set every server secret once per environment:

```bash
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put TELNYX_API_KEY
# ...one per secret in .env.example
```

`.github/workflows/deploy.yml` does the same automatically on push to `main`.
It needs these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit)
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

---

## 3. Environment variables

Full list with comments: **`.env.example`**. Grouped:

- **Supabase** — `VITE_SUPABASE_*` (browser) and `SUPABASE_*` (server), plus
  `SUPABASE_SERVICE_ROLE_KEY` (server only, bypasses RLS).
- **Public URLs** — `PUBLIC_BASE_URL`, `PUBLIC_SITE_URL`, `SITE_URL`. These are
  baked into shortlinks, invites, opt-in proof links and webhook callbacks, so
  they must be the real origin in production.
- **Carrier** — `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` (webhook signature check).
- **Payments** — `PAYSTACK_SECRET_KEY`, `NOWPAYMENTS_API_KEY`,
  `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_IPN_URL`.
- **Push** — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Encryption** — `TENANT_TOKEN_ENCRYPTION_KEY`. **Must keep the same value**
  as today, or already-encrypted tenant carrier tokens become unreadable.
- **AI / email** — see section 4.

---

## 4. The four Lovable-only pieces

### a. Build config
Handled by `vite.config.selfhost.ts` (section 1).

### b. AI — content screening + support chat
Call sites: `src/lib/content-scanner.functions.ts`, `src/lib/chat.functions.ts`.
Both POST to `https://ai.gateway.lovable.dev/v1/chat/completions` with a
`Lovable-API-Key` header. To self-host, point them at your own provider:

```ts
// OpenAI-compatible drop-in replacement
const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({ model: "gpt-4o-mini", messages }),
});
```

Keep the system prompts and the screening thresholds byte-identical, otherwise
campaign screening starts flagging content differently.

### c. Email
`src/lib/email/send-internal.server.ts` and
`src/routes/lovable/email/queue/process.ts` call `sendLovableEmail` from
`@lovable.dev/email-js`. Replace that single function with your provider, e.g.
Resend:

```ts
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
  },
  body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
});
```

Everything else stays: the React Email templates in `src/lib/email-templates/`,
the PGMQ queue, the suppression table and `/email/unsubscribe`.

Supabase Auth emails (signup code, recovery, invite, email change) are configured
on your Supabase project: **Authentication → Emails** — set your SMTP provider
and paste the rendered templates.

Point the provider's bounce/complaint webhook at
`/lovable/email/suppression` so suppression keeps working.

### d. Google sign-in
`src/integrations/lovable/index.ts` brokers Google OAuth through Lovable's own
Google app. Off-platform:

1. Create a Google OAuth client (Web application) in Google Cloud Console.
2. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Enable the Google provider on your Supabase project and paste the client
   ID/secret.
4. Replace the helper call:

```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: window.location.origin },
});
```

Call sites to change: `src/routes/auth.tsx`, `src/routes/verify.auth.tsx`.

### e. Optional: MCP / `/connect`
`mcpPlugin()` from `@lovable.dev/mcp-js` serves `/mcp`. If you want to keep the
agent integration off-platform, the five tools in `src/lib/mcp/tools/` are plain
functions — expose them from a normal server route. Otherwise delete
`src/routes/mcp.ts`, `src/routes/[.mcp]/*`, `src/routes/connect.tsx` and the
`mcpPlugin()` line.

---

## 5. Cutover checklist

1. Pause campaign sending.
2. Run the final delta sync on the fast-moving tables listed in
   `migration-kit/STATUS.md`.
3. Deploy to Workers, smoke-test on the `*.workers.dev` URL:
   password sign-in, Google sign-in, one test SMS, one small campaign, one
   inbound reply, one payment webhook, one email of each auth type, admin
   finance + campaign pages.
4. Re-point external webhooks to the new domain:
   - carrier status → `/api/public/telnyx-status`
   - carrier inbound → `/api/public/telnyx-inbound`
   - Paystack → `/api/public/paystack-webhook`
   - NOWPayments IPN → `/api/public/nowpayments-ipn`
5. Update the `pg_cron` jobs on your Supabase project that call
   `/api/public/dispatch-campaign`, `/api/public/poll-verifications`,
   `/api/public/nowpayments-poll` and `/lovable/email/queue/process` so they hit
   the new origin.
6. Move DNS for `xellvio.com` / `www.xellvio.com` to the Worker.
7. Leave the Lovable deployment up but idle for a day as rollback.
