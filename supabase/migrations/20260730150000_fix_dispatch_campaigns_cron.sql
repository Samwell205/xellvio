-- The 'dispatch-campaigns' cron job was created against the old
-- Lovable-hosted app (samwell-reach-global.lovable.app) using the old
-- (dbyqktfecfbukglciihc) Supabase project's anon key. Both are dead now
-- that the app is self-hosted on Cloudflare Workers under the
-- natxsjcjsxzuujlsdsav project — repoint it.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('dispatch-campaigns')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-campaigns');

SELECT cron.schedule(
  'dispatch-campaigns',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xellvio.com/api/public/dispatch-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHhzamNqc3h6dXVqbHNkc2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTk2ODYsImV4cCI6MjA5ODYzNTY4Nn0.pukbyFvWPCPDg_Uq8HHVrFSxEgAYfk4dFvIdLYkMZE8'
    ),
    body := '{}'::jsonb
  );
  $$
);
