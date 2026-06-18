# Rebuild to SMS Marketing Platform (per spec)

Full rebuild per spec, shipped in phases. Each phase ends in a working app. Say "next" between phases.

## Phase 1 — Schema rebuild + Twilio Messaging Service wiring (this round)

**Database migration** (one big migration, drops/recreates app tables; keeps auth/user_roles intact):
- Rename existing `profiles` (auth user profile) → `accounts` (one row per logged-in user). Update `handle_new_user` trigger.
- Drop: `contacts`, `contact_groups`, `campaigns`, `messages`, `phone_verifications`, `verification_codes`, `sender_ids`, `phone_numbers`, `api_keys`, `transactions`, `notifications` (replaced or out-of-scope for v1).
- Create spec tables (all scoped by `account_id` = auth.uid):
  - `profiles` (contact records): account_id, phone_e164 (E.164 check), first_name, last_name, country_code, timezone, unique(account_id, phone_e164)
  - `consents`: profile_id, channel, status, source, proof, consented_at
  - `suppressions`: account_id, phone_e164, reason, source, unique(account_id, phone_e164)
  - `segments`: account_id, name, query jsonb
  - `campaigns`: account_id, name, status, audience jsonb, message_body, media_url, send_mode, schedule_at, smart_skip_hours
  - `messages`: campaign_id, profile_id, phone_e164, rendered_body, status, provider_message_id, error_code, segments_count, cost, sent_at, delivered_at
  - `events`: message_id, type, payload
- RLS on every table scoped by `account_id = auth.uid()` (or via campaign join for messages/events). GRANT to authenticated + service_role per house rules.
- Helper SQL function `eligible_profile_ids(account uuid, audience jsonb)` that resolves include/exclude segments minus suppressions minus non-subscribed (used by send-campaign + estimate-segment).

**Secrets** (request via add_secret):
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_AUTH_TOKEN` (needed for webhook signature validation)
- Existing `TWILIO_API_KEY` connector reused for Messaging API calls via gateway.

**Code cleanup**: delete now-orphaned files (`src/lib/sms.functions.ts`, `src/lib/numbers.functions.ts`, `src/routes/_authenticated.app.numbers.tsx`, `src/components/ImportContactsDialog.tsx`, old campaign/send routes, old dashboard). Replace with placeholder routes that say "coming in Phase 2" so build stays green.

**Deliverable**: clean schema in place, app builds, auth still works, ready for UI buildout.

## Phase 2 — Audience UI (Profiles + CSV import + Consents + Suppressions)

- `/app/audience` profiles table with consent status badges, manual add dialog.
- CSV import (Papa.parse): validate to E.164 with `libphonenumber-js`, derive country code from prefix, dedupe within file and against existing profiles, row-level error report, downloadable template, preview step.
- On import: create profile + consent row (status configurable per upload: implied subscribed vs pending).
- Opt-out/suppression management UI (view + manual add).
- Real-time count cards (subscribed / pending / unsubscribed / suppressed).

## Phase 3 — Segments (visual filter builder)

- Segments tab inside Audience.
- Filter builder UI: country in [...], consent status, created_at range, has phone prefix, custom name contains. Builder saves a structured jsonb query.
- Live estimated count via `estimate-segment` server fn (uses `eligible_profile_ids` helper).
- List/edit/delete segments.

## Phase 4 — Campaign Builder (the core screen) + Campaigns list

5-step stepper:
1. **Audience** — include/exclude segments, live recipient estimate.
2. **Message** — personalization tag inserter (`{{first_name|default:'there'}}`), live char + SMS-segment counter (GSM-7 160 / unicode 70), MMS media URL, auto-append "Reply STOP to opt out" if missing. Live phone mockup preview using a sample profile.
3. **Schedule** — Send now / Schedule (datetime-local) / Smart send time (skip-window input, default 16h).
4. **Review** — summary + REQUIRED Test Send (enter a number, dispatches single message via Twilio) before Schedule/Send button enables.
- Compliance gates: block save if no opt-out line AND audience contains anyone outside suppressions.
- Campaigns list with status badges, recipients, delivery rate, CTR.

## Phase 5 — Edge Functions (Twilio send + webhooks)

- `send-campaign` (Deno edge fn): resolves audience via `eligible_profile_ids`, batches 500, inserts `messages` rows pending, sends via Twilio Messaging Service (`MessagingServiceSid`), stores SID, sets statusCallback to dlr-webhook URL. Renders personalization. Updates campaign status sent/sending.
- `dlr-webhook` (public, no JWT): validates `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN`, looks up message by SID, updates status, inserts event. Idempotent.
- `inbound-webhook` (public, no JWT): validates signature, parses Body. STOP/UNSUBSCRIBE/CANCEL/END/QUIT → insert suppression + flip consent. Returns TwiML.
- `estimate-segment`: takes query jsonb, returns eligible count.
- `pg_cron` scheduled job (every minute): dispatches due scheduled/smart-send campaigns by invoking send-campaign.

## Phase 6 — Reports + Dashboard + Settings

- Campaign report page: recipients, sent, delivered, delivery rate, failed-with-reasons, opt-outs, opt-out rate, by-country breakdown.
- Dashboard: total subscribers, campaigns sent, avg delivery rate, avg opt-out rate, recent campaigns (auto-refresh).
- Settings page: Twilio connection status, Messaging Service SID display (masked), geo-permissions reminder banner.

## Technical notes

- Frontend: TanStack Start + Query, shadcn, Tailwind v4. Existing black/blue theme tokens preserved.
- Server functions for app reads/writes (`createServerFn` + `requireSupabaseAuth`).
- Edge functions ONLY for Twilio send loop + webhooks + cron (justified: heavy batching, public signature-validated endpoints).
- `account_id` everywhere = `auth.uid()`; single-tenant per user. RLS enforces this.
- E.164 validation via `libphonenumber-js` (added Phase 2).
- All compliance filtering centralized in `eligible_profile_ids` SQL function — single source of truth.

---

**Executing Phase 1 now**: migration + secret requests + code cleanup. Reply "next" after Phase 1 lands to start Phase 2.
