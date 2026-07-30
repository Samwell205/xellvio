# Xellvio — migration to your own Supabase project

Everything needed to move this app's backend off Lovable Cloud and onto a
Supabase project you own.

```
migration-kit/
  sql/
    00-prelude.sql          extensions, schemas, message queues
    01-baseline-schema.sql  the whole schema (175 migrations, in order)
    02-post-migration.sql   encryption key, vault secret, buckets, cron
    03-verify.sql           row counts + balance reconciliation
  scripts/
    export-data.sh          old DB  -> data/*.csv
    import-data.sh          data/*.csv -> new DB
    migrate-users.mjs       recreate the 62 auth users with the same ids
    copy-storage.mjs        copy all four storage buckets
  data/                     CSVs land here (git-ignored)
```

## Two things to know first

1. **This project keeps using Lovable Cloud until you point it elsewhere.**
   Cloud cannot be swapped in place, and disconnecting it permanently deletes
   the Cloud database. Do not disconnect anything until Phase 6 has passed.

2. **Passwords do not migrate.** Lovable Cloud does not expose the database
   password or the service-role key, so the `auth` schema (where password
   hashes live) cannot be read from here. Users are recreated with their
   original ids — so all their data still resolves — but each one sets a new
   password on first sign-in.

## Phase 1 — Create your Supabase project

1. Create the project, pick a region close to your tenants.
2. Note down: project URL, `anon`/publishable key, `service_role` key, and
   the database connection string (Project Settings -> Database).
3. Apply the prelude:

   ```bash
   psql "$NEW_DB_URL" -f migration-kit/sql/00-prelude.sql
   ```

   If `pg_cron` or `pgmq` is unavailable on your plan, enable them under
   Database -> Extensions first.

## Phase 2 — Schema

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f migration-kit/sql/01-baseline-schema.sql
```

This replays all 175 migrations in timestamp order, which reproduces the
schema exactly: 61 tables, 11 enums, ~48 functions, every RLS policy, grant,
trigger and index.

Then edit `02-post-migration.sql`, fill in the placeholders, and run it:

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f migration-kit/sql/02-post-migration.sql
```

Placeholders to fill:

| Placeholder | Where it comes from |
|---|---|
| `<ENCRYPTION_KEY>` | The current `app.encryption_key`. If lost, tenants re-enter Gorgias API keys. |
| `<NEW_SERVICE_ROLE_KEY>` | Your new project's service-role key. |
| `<NEW_APP_BASE_URL>` | Where the app will be served from after cutover. |

## Phase 3 — Data (~700k rows)

```bash
bash migration-kit/scripts/export-data.sh                # writes data/*.csv
bash migration-kit/scripts/import-data.sh "$NEW_DB_URL"  # loads them
```

The import runs with `session_replication_role = replica`, so foreign keys
and triggers do not fire and table order does not matter. Ids and timestamps
are preserved verbatim.

Storage:

```bash
OLD_SUPABASE_URL=... OLD_SERVICE_KEY=... \
NEW_SUPABASE_URL=... NEW_SERVICE_KEY=... \
node migration-kit/scripts/copy-storage.mjs
```

(The `OLD_*` pair is only obtainable if you first export via
Cloud -> Advanced settings -> Export data; see the note in Phase 4.)

Then reconcile:

```bash
psql "$NEW_DB_URL" -f migration-kit/sql/03-verify.sql > new.txt
psql                -f migration-kit/sql/03-verify.sql > old.txt   # in the sandbox
diff old.txt new.txt
```

Anything other than an empty diff on the balance and count sections is a
blocker — do not continue.

## Phase 4 — Users

Produce `migration-kit/data/_auth_users.json` (an array of `{id, email,
email_confirmed_at, created_at, raw_user_meta_data}`) from the Cloud data
export, then:

```bash
NEW_SUPABASE_URL=... NEW_SERVICE_KEY=... DRY_RUN=true \
  node migration-kit/scripts/migrate-users.mjs      # preview

NEW_SUPABASE_URL=... NEW_SERVICE_KEY=... \
  node migration-kit/scripts/migrate-users.mjs      # create + email resets
```

Set `SEND_RESET=false` if you would rather announce the cutover before the
reset emails go out.

Afterwards, confirm every account still resolves:

```sql
select count(*) from public.accounts a
  where not exists (select 1 from auth.users u where u.id = a.id);   -- must be 0
select count(*) from public.user_roles r
  where not exists (select 1 from auth.users u where u.id = r.user_id); -- must be 0
```

## Phase 5 — Point the app at your project

1. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_SUPABASE_PROJECT_ID` and their server-side twins
   (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
   to the new project.
2. Regenerate `src/integrations/supabase/types.ts` against the new schema.
3. Re-add every runtime secret: `TELNYX_PUBLIC_KEY`, `TWILIO_API_KEY`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
   `NOWPAYMENTS_API_KEY`, `VAPID_PUBLIC_KEY` (+ its private counterpart),
   `LOVABLE_API_KEY` if you keep using the AI gateway.
4. Enable auth providers on the new project to match: email/password, Google,
   and the redirect URLs for `/auth`, `/auth/callback`, `/reset-password`,
   `/verify/reset-password`.
5. Update `src/lib/mcp/index.ts` — the OAuth issuer is derived from
   `VITE_SUPABASE_PROJECT_ID`, so it follows automatically once step 1 is done.

## Phase 6 — Cutover

Run in this order, with sending paused throughout:

1. Pause campaign dispatch (stop the cron caller hitting
   `/api/public/dispatch-campaign`).
2. Wait for every message in `sending` status to finalise:
   `select count(*) from messages where status in ('sending','queued');`
3. Re-export and re-import the fast-moving tables only:
   `messages`, `events`, `credit_transactions`, `sms_thread_messages`,
   `link_clicks`, `message_send_attempts`, `payments`, `accounts`.
4. Re-run `03-verify.sql` on both sides and diff again.
5. Switch the app's env to the new project and deploy.
6. Re-point external webhooks at the new host:
   - Telnyx inbound  -> `<NEW_APP_BASE_URL>/api/public/telnyx-inbound`
   - Telnyx status   -> `<NEW_APP_BASE_URL>/api/public/telnyx-status`
   - NOWPayments IPN -> `<NEW_APP_BASE_URL>/api/public/nowpayments-ipn`
   - Paystack        -> `<NEW_APP_BASE_URL>/api/public/paystack-webhook`
7. Smoke test — all must pass before resuming sending:
   - sign in as an admin, and as a tenant
   - tenant balance matches the pre-cutover figure
   - Admin -> Finance analysis totals match the pre-cutover figures
   - send one test SMS, confirm delivery status updates
   - receive one inbound reply, confirm it lands in the right tenant's inbox
   - open a campaign report and export a phone-number CSV
   - upload one campaign media file (checks storage + RLS)
8. Resume dispatch.

## Rollback

Until step 5, nothing is destructive — the Cloud database is untouched and
still live. If verification fails at any point, revert the env vars and the
old system keeps running. Keep the Cloud project alive for at least two weeks
after cutover.
