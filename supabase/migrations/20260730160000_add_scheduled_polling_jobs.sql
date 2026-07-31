-- Background polling jobs that previously only ran on admin manual-refresh.
-- Mirrors the auth pattern already used by dispatch-campaigns: apikey header
-- checked against the app's own SUPABASE_PUBLISHABLE_KEY, URL pointed at the
-- non-redirecting www.xellvio.com host (pg_net does not follow 3xx redirects,
-- same reasoning as the Telnyx webhook fix).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- Storage for periodic finance snapshots (freezes admin_finance_summary()
-- output + live carrier balance so trends can be charted over time).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot jsonb NOT NULL,
  carrier_balance numeric,
  carrier_balance_currency text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_snapshots TO authenticated;
GRANT ALL ON public.finance_snapshots TO service_role;
ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view finance snapshots" ON public.finance_snapshots FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX IF NOT EXISTS finance_snapshots_created_at_idx ON public.finance_snapshots(created_at DESC);

-- ------------------------------------------------------------
-- poll-carrier-balance — every 10 minutes
-- ------------------------------------------------------------
SELECT cron.unschedule('poll-carrier-balance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-carrier-balance');

SELECT cron.schedule(
  'poll-carrier-balance',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.xellvio.com/api/public/poll-carrier-balance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHhzamNqc3h6dXVqbHNkc2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTk2ODYsImV4cCI6MjA5ODYzNTY4Nn0.pukbyFvWPCPDg_Uq8HHVrFSxEgAYfk4dFvIdLYkMZE8'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- poll-verifications — every 30 minutes (toll-free/10DLC verification status
-- changes over days, not minutes; no need to hammer Telnyx faster than this)
-- ------------------------------------------------------------
SELECT cron.unschedule('poll-verifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-verifications');

SELECT cron.schedule(
  'poll-verifications',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.xellvio.com/api/public/poll-verifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHhzamNqc3h6dXVqbHNkc2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTk2ODYsImV4cCI6MjA5ODYzNTY4Nn0.pukbyFvWPCPDg_Uq8HHVrFSxEgAYfk4dFvIdLYkMZE8'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- poll-nowpayments — every 2 minutes (matches the interval already
-- documented in src/routes/api/public/nowpayments-poll.ts's own comment)
-- ------------------------------------------------------------
SELECT cron.unschedule('poll-nowpayments')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-nowpayments');

SELECT cron.schedule(
  'poll-nowpayments',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.xellvio.com/api/public/nowpayments-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHhzamNqc3h6dXVqbHNkc2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTk2ODYsImV4cCI6MjA5ODYzNTY4Nn0.pukbyFvWPCPDg_Uq8HHVrFSxEgAYfk4dFvIdLYkMZE8'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- snapshot-finance-metrics — hourly
-- ------------------------------------------------------------
SELECT cron.unschedule('snapshot-finance-metrics')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snapshot-finance-metrics');

SELECT cron.schedule(
  'snapshot-finance-metrics',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.xellvio.com/api/public/snapshot-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHhzamNqc3h6dXVqbHNkc2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTk2ODYsImV4cCI6MjA5ODYzNTY4Nn0.pukbyFvWPCPDg_Uq8HHVrFSxEgAYfk4dFvIdLYkMZE8'
    ),
    body := '{}'::jsonb
  );
  $$
);
