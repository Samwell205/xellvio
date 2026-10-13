SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'support-tickets-sweep';

SELECT cron.schedule(
  'support-tickets-sweep',
  '7 * * * *',
  $cron$SELECT net.http_post(
    url := 'https://xellvio.com/api/public/support/sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 1202f33779a808982634eeef7c9c5c4e22a7425ad7f2f9a5'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );$cron$
);