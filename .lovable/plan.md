## Goal

Move the backend from Lovable Cloud (the managed database this app currently uses) onto a Supabase project you own and control directly.

## Important reality check before we start

Two constraints shape everything below — please read these first:

1. **This project cannot be "switched" from Lovable Cloud to your own Supabase in place.** Once Cloud is enabled on a project, it stays. Disconnecting Cloud permanently deletes the Cloud database and cannot be undone. The realistic route is: stand up your own Supabase project, replicate schema + data into it, then point the app at it (either this project reconfigured, or a fresh Lovable project connected to your Supabase via the Supabase integration).

2. **User logins are the hard part.** Lovable Cloud does not expose the database password or the service-role key, and the `auth` schema (where the 62 user accounts and their password hashes live) is not exportable from here. In practice this means existing users will need to reset their passwords on the new project. Their app data survives because it's keyed by user id — as long as we recreate users with the *same* ids, which requires the Supabase Admin API on the new project.

If either of those is a dealbreaker, tell me now and I'll stop here.

## What has to move

- **Schema**: 175 migration files, ~60 public tables, 11 enum types, ~48 database functions (several `SECURITY DEFINER`), RLS policies and grants on every table, plus triggers.
- **Data**: roughly 700k rows. The heavy tables are `events` (179k), `consents` (112k), `profiles` (112k), `profile_list_members` (90k), `messages` (72k), `credit_transactions` (67k), `link_clicks` (38k). Financial tables (`accounts`, `payments`, `credit_transactions`, `seller_ledger`, `verifier_*`) must move with zero loss — balances are derived from them.
- **Auth**: 62 accounts and their role rows.
- **Storage**: the buckets used by campaign media uploads and academy assets.
- **Extensions / scheduled work**: `pgmq` email queues, `pg_cron` jobs, `pg_net` calls, `pgcrypto` (used by the Twilio token encryption functions), and the `app.encryption_key` database setting.
- **Secrets**: Telnyx/Twilio, NOWPayments, VAPID, and the AI gateway key all need to exist in the new environment.

## Proposed steps

**Phase 1 — Set up your Supabase project**
1. You create the project in your own Supabase account and choose a region.
2. Enable the required extensions (`pgcrypto`, `pgmq`, `pg_cron`, `pg_net`).
3. You provide the project URL, publishable/anon key, service-role key, and database connection string.

**Phase 2 — Schema**
4. Consolidate the 175 migrations into a single ordered baseline script (enums → tables → grants → RLS → policies → functions → triggers → indexes) and apply it to your project.
5. Re-apply the non-migration settings: the `app.encryption_key` value, cron schedules, and the vault secret used by the email queue.

**Phase 3 — Data**
6. Export each table from Cloud (CSV per table, in foreign-key dependency order) and load it into your project with RLS bypassed, preserving all ids and timestamps.
7. Reconcile: row counts per table, plus a balance check that `accounts.credit_balance` and `seller_balance` match their ledgers on both sides.

**Phase 4 — Users**
8. Recreate the 62 auth users on your project via the Admin API using their existing ids and emails, with password reset required at first login.
9. Verify `user_roles`, `account_members`, and `accounts` still resolve for each user.

**Phase 5 — App wiring**
10. Point the app's Supabase URL/keys at your project, regenerate the database types, and re-add every secret.
11. Re-point external callbacks that are configured outside the app: Telnyx inbound/status webhooks, NOWPayments IPN, and the cron endpoints that hit `/api/public/*`.

**Phase 6 — Cutover**
12. Freeze sending, run a final incremental data sync of the tables that change constantly (`messages`, `events`, `credit_transactions`, `sms_thread_messages`, `link_clicks`), switch DNS/keys, then smoke-test: sign in, view balance, send a test SMS, receive an inbound reply, run a campaign report, and confirm an admin finance figure matches the old system.

## Technical notes

- Storage objects must be copied bucket-by-bucket; object paths are referenced in `campaigns.media_url`, opt-in proof URLs, and academy cover images, so paths must be preserved or rewritten consistently.
- `SECURITY DEFINER` functions must be owned by the right role on the new project or `has_role`/`is_admin_or_service` checks will misbehave.
- `debit_account`, `claim_campaign_messages`, and `topup_account` must be verified after migration before any real send — a silent failure there causes billing errors.
- Sequence/identity state doesn't apply (all ids are UUIDs), which removes one common migration hazard.

## What I need from you to proceed

- Confirmation that "users must reset passwords" is acceptable.
- Whether you want the migrated app to be **this** project reconfigured, or a **new** Lovable project connected to your Supabase.
- An acceptable downtime window for the cutover (sending must be paused during the final sync).
