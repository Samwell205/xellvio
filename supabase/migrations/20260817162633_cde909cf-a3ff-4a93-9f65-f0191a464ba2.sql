DO $$
DECLARE
  j record;
  base_url constant text := 'https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a.lovable.app/api/public/dispatch-campaign';
  publishable_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw';
  delays integer[] := ARRAY[0,10,20,30,40,50];
  delay_seconds integer;
  job_name text;
  command_sql text;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname LIKE 'dispatch-campaigns%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  FOREACH delay_seconds IN ARRAY delays LOOP
    job_name := CASE WHEN delay_seconds = 0 THEN 'dispatch-campaigns' ELSE format('dispatch-campaigns-%ss', delay_seconds) END;
    command_sql := format(
      'SELECT %s SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'',''application/json'',''apikey'',%L), body := ''{}''::jsonb, timeout_milliseconds := 60000);',
      CASE WHEN delay_seconds = 0 THEN '' ELSE format('pg_sleep(%s);', delay_seconds) END,
      base_url,
      publishable_key
    );
    PERFORM cron.schedule(job_name, '* * * * *', command_sql);
  END LOOP;
END $$;