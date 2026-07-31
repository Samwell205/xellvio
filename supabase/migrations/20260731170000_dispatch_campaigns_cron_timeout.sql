-- Root cause of the intermittent dispatch_timeout failures: the
-- dispatch-campaigns cron job's net.http_post call never set
-- timeout_milliseconds, so it used pg_net's short default (~5s). A
-- delivery-heavy tick (concurrent real Telnyx API calls) can legitimately
-- take longer than that; when it does, pg_net gives up waiting and records
-- a response row with a null status_code and null body. Since nothing is
-- listening for the response anymore, Cloudflare cancels the in-flight
-- Worker invocation — abandoning any messages it had already claimed and
-- charged mid-run. Those sit in 'sending' until the 2-minute staleness
-- sweep in claim_campaign_messages writes them off as dispatch_timeout.
-- Giving pg_net a generous timeout removes the trigger for this entirely.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
