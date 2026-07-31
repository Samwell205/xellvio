-- The previous fix (20260730150000) repointed 'dispatch-campaigns' off the
-- dead Lovable URL, but used the bare https://xellvio.com host. That domain
-- 302/307-redirects to https://www.xellvio.com, and pg_net (like Telnyx) does
-- not follow redirects on POST — so every run of this job was silently
-- failing to ever reach the dispatcher, and queued campaigns were never
-- picked up. Repoint it at the non-redirecting www host, same reasoning
-- already applied to the Telnyx webhook URLs and the other scheduled jobs.
SELECT cron.unschedule('dispatch-campaigns')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-campaigns');

SELECT cron.schedule(
  'dispatch-campaigns',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.xellvio.com/api/public/dispatch-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHhzamNqc3h6dXVqbHNkc2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNTk2ODYsImV4cCI6MjA5ODYzNTY4Nn0.pukbyFvWPCPDg_Uq8HHVrFSxEgAYfk4dFvIdLYkMZE8'
    ),
    body := '{}'::jsonb
  );
  $$
);
