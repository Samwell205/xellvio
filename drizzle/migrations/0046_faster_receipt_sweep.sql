SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sweep-missed-receipts'),
  schedule := '*/5 * * * *',
  command := $cmd$
  SELECT net.http_post(
    url := 'https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a.lovable.app/api/public/sweep-receipts',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', (SELECT value FROM public.internal_job_secrets WHERE name = 'cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$
);