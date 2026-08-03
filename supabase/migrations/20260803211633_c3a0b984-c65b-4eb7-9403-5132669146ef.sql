CREATE OR REPLACE FUNCTION public.record_link_click(_code text)
RETURNS TABLE(url text, message_id uuid, campaign_id uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.link_clicks
     SET clicks = clicks + 1,
         first_click_at = COALESCE(first_click_at, now()),
         last_click_at = now()
   WHERE short_code = _code
  RETURNING link_clicks.url, link_clicks.message_id, link_clicks.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.record_link_click(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_link_click(text) TO service_role;

SELECT cron.unschedule('reconcile-carrier-receipts-60s')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-carrier-receipts-60s');

SELECT cron.schedule(
  'reconcile-carrier-receipts-60s',
  '* * * * *',
  $cron$SELECT net.http_post(
    url := 'https://xellvio.com/api/public/dispatch-campaign?mode=reconcile',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );$cron$
);

SELECT cron.unschedule('reconcile-carrier-receipts-60s-b')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-carrier-receipts-60s-b');

SELECT cron.schedule(
  'reconcile-carrier-receipts-60s-b',
  '* * * * *',
  $cron$SELECT pg_sleep(30); SELECT net.http_post(
    url := 'https://xellvio.com/api/public/dispatch-campaign?mode=reconcile',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );$cron$
);