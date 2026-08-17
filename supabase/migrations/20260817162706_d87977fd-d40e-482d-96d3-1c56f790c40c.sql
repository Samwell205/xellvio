DO $$
DECLARE
  target_jobid bigint;
  base_url constant text := 'https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a.lovable.app/api/public/dispatch-campaign';
  publishable_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhcGFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw';
BEGIN
  SELECT jobid INTO target_jobid FROM cron.job WHERE jobname = 'dispatch-campaigns';
  IF target_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(target_jobid);
  END IF;
  PERFORM cron.schedule(
    'dispatch-campaigns',
    '* * * * *',
    format(
      'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'',''application/json'',''apikey'',%L), body := ''{}''::jsonb, timeout_milliseconds := 60000);',
      base_url,
      publishable_key
    )
  );
END $$;