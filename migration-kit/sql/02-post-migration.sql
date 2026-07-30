-- ============================================================
-- Xellvio migration — Phase 2, step 3
-- Run AFTER 01-baseline-schema.sql, as the postgres/service role.
--
-- These are the settings that do NOT live in migration files.
-- Replace every <PLACEHOLDER> before running.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tenant credential encryption key
--    Used by public.encrypt_twilio_token / decrypt_twilio_token
--    (accounts.gorgias_api_key_enc and any other pgp_sym_encrypt column).
--    MUST be the same value as the old project, or existing encrypted
--    values become unreadable. If it cannot be recovered, tenants have to
--    re-enter their Gorgias API keys after cutover.
-- ------------------------------------------------------------
alter database postgres set app.encryption_key = '<ENCRYPTION_KEY>';
-- Reconnect after this, then verify:
--   select current_setting('app.encryption_key', true) is not null;

-- ------------------------------------------------------------
-- 2. Vault secret used by the email queue dispatcher
--    public.email_queue_wake() and public.email_queue_dispatch() read
--    this to authenticate their pg_net call back into the app.
-- ------------------------------------------------------------
select vault.create_secret('<NEW_SERVICE_ROLE_KEY>', 'email_queue_service_role_key');

-- ------------------------------------------------------------
-- 3. Point the email-queue functions at the new app URL
--    Both functions hard-code the old Lovable app URL. Swap it.
-- ------------------------------------------------------------
-- Replace https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a.lovable.app
-- with <NEW_APP_BASE_URL> inside:
--   public.email_queue_wake()
--   public.email_queue_dispatch()
-- (Re-run their CREATE OR REPLACE bodies from 01-baseline-schema.sql
--  with the URL substituted.)

-- ------------------------------------------------------------
-- 4. Scheduled jobs
--    The email dispatcher schedules itself on demand, so it needs no
--    manual entry. Any externally-driven job that hits the app must be
--    re-pointed at the new host:
--      POST <NEW_APP_BASE_URL>/api/public/dispatch-campaign
--      POST <NEW_APP_BASE_URL>/api/public/poll-verifications
--      POST <NEW_APP_BASE_URL>/api/public/nowpayments-poll
-- ------------------------------------------------------------
-- Example (only if you drive campaign dispatch from pg_cron):
-- select cron.schedule(
--   'dispatch-campaigns', '* * * * *',
--   $$ select net.http_post(
--        url := '<NEW_APP_BASE_URL>/api/public/dispatch-campaign',
--        headers := '{"Content-Type":"application/json"}'::jsonb,
--        body := '{}'::jsonb) $$);

-- ------------------------------------------------------------
-- 5. Storage buckets (all private)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('opt-in-assets',   'opt-in-assets',   false),
  ('payment-proofs',  'payment-proofs',  false),
  ('campaign-media',  'campaign-media',  false),
  ('academy-covers',  'academy-covers',  false)
on conflict (id) do nothing;
-- Bucket RLS policies are created by 01-baseline-schema.sql.
