CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove prior version if re-running
SELECT cron.unschedule('dispatch-campaigns')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-campaigns');

SELECT cron.schedule(
  'dispatch-campaigns',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://samwell-reach-global.lovable.app/api/public/dispatch-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw'
    ),
    body := '{}'::jsonb
  );
  $$
);