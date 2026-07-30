## Goal

Get the whole app out of Lovable and into your own VS Code + GitHub + Cloudflare Workers setup, talking to the Supabase project you already migrated (schema, ~700k rows, 62 users, storage are all there per `migration-kit/STATUS.md`).

## What already works off-platform

Everything that is "just the app": TanStack Start routes, all `*.functions.ts` server functions, the Supabase clients, RLS, storage, PGMQ queues, cron jobs. These need only new environment variables pointing at your Supabase project.

## What is Lovable-only and must be replaced

Four things are provided by Lovable today, not by Supabase:

1. **Build config** — `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, a wrapper that bundles the TanStack Start plugin, React, Tailwind, path aliases, env injection and the Cloudflare/nitro build target.
2. **AI** — content screening (`src/lib/content-scanner.functions.ts`) and the support chat (`src/lib/chat.functions.ts`) call `ai.gateway.lovable.dev` with `LOVABLE_API_KEY`.
3. **Email** — every auth + transactional email goes through `@lovable.dev/email-js` and the `src/routes/lovable/email/*` routes (queue processor, auth webhook, suppression, previews).
4. **Google sign-in** — `src/integrations/lovable/index.ts` uses `@lovable.dev/cloud-auth-js`, which brokers OAuth through Lovable's Google app.

Also Lovable-only but optional: the MCP server plugin (`mcpPlugin()` + `@lovable.dev/mcp-js`) behind `/mcp` and `/connect`.

## Plan

**Phase 1 — Get the code into VS Code**
- Connect GitHub from the chat's **+ menu → GitHub → Connect project**, create the repo, then `git clone` it locally. (Only you can authorize this; I can't do it from here.)
- Add a `.env.example` documenting every variable the app reads, and a `README.local.md` with exact steps: `bun install`, `bun dev`, port, and the required env.
- Keep two-way sync on during the transition so we can keep fixing things here until you're happy.

**Phase 2 — Own the build config**
- Replace `@lovable.dev/vite-tanstack-config` with a plain `vite.config.ts` that declares the plugins it was hiding: `tanstackStart` (entry `src/server.ts`), `viteReact`, `@tailwindcss/vite`, `vite-tsconfig-paths`, the `entities` aliases, and the nitro Cloudflare preset.
- Drop the `componentTagger`/error-logger dev plugins and `src/lib/lovable-error-reporting.ts` wiring (keep `error-capture.ts`, it's ours).
- Add `wrangler.toml` (Workers name, compat date, `nodejs_compat`), plus `bun run deploy` and a GitHub Action that builds and deploys on push to `main`.
- Verify `bun run build` + `wrangler dev` boot locally.

**Phase 3 — Point at your Supabase**
- Swap the six `SUPABASE_*` / `VITE_SUPABASE_*` values in local `.env` and in Cloudflare Worker secrets to your project's URL, publishable key and service-role key.
- Move all runtime secrets into Cloudflare (Telnyx, Twilio, NOWPayments, Paystack, VAPID push keys, MCP/OAuth secrets, etc.). I'll produce the exact list from the code; you paste the values in the Cloudflare dashboard or via `wrangler secret put`.
- Re-point external webhooks (Telnyx status + inbound, Paystack, NOWPayments IPN) and the `pg_cron` jobs to your new Workers domain instead of `*.lovable.app`.
- Run the final delta sync on the fast-moving tables listed in `STATUS.md` immediately before cutover, with sending paused.

**Phase 4 — Replace the managed services with direct providers**
- **AI**: swap both call sites to your own provider key (`OPENAI_API_KEY` or `GEMINI_API_KEY`) behind a single `src/lib/ai-provider.server.ts`, keeping prompts and the screening thresholds identical so campaign screening behaves the same.
- **Email**: replace `sendLovableEmail` with a direct provider (Resend or Postmark) in `src/lib/email/send-internal.server.ts` and in the queue processor route. All React Email templates in `src/lib/email-templates/` stay as-is. Rewire Supabase Auth emails (signup code, recovery, invite, email change) to your own SMTP/provider settings in Supabase, and keep the bounce/suppression handler pointed at the new provider's webhook.
- **Google sign-in**: create your own Google OAuth client, enable the Google provider on your Supabase project, and replace `lovable.auth.signInWithOAuth` with `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` on `/auth`, `/verify/auth` and the seller/verifier entry points.
- **MCP**: keep or drop, your call — if kept, replace `mcpPlugin()` with plain server routes so `/mcp` still serves the five tools.

**Phase 5 — Verify before cutover**
- Local smoke test against your Supabase: sign in (password + Google), send a test SMS, dispatch a small campaign, receive an inbound reply, run one payment webhook, send one email of each auth type, load the admin finance + campaign pages.
- Then repoint DNS for `xellvio.com` / `www.xellvio.com` to the Worker, keep the Lovable deployment up but idle for a day as a rollback.

## Technical notes

- Nothing in this plan touches the live site until Phase 5's DNS switch; the Lovable deployment keeps running throughout.
- The published Lovable app's Supabase credentials are generated by Lovable Cloud and cannot be repointed from inside this project — that's why the app has to be running on your own Workers deploy before it uses your Supabase.
- `src/integrations/supabase/*` files are auto-generated here but become normal editable files once the repo is yours; only the URL/keys change.
- Types stay generated with `supabase gen types typescript --project-id <yours> > src/integrations/supabase/types.ts` via the Supabase CLI locally.
- Payment/credit logic, `claim_campaign_messages` fund reservation, MMS pricing and the recovery registry are all in SQL/server functions already on your Supabase — untouched by this move.

## What I need from you at each step

Phase 1: authorize GitHub. Phase 3: create Cloudflare account/project + paste secrets. Phase 4: Google OAuth client, and pick Resend vs Postmark for email. Everything else I do in the repo.