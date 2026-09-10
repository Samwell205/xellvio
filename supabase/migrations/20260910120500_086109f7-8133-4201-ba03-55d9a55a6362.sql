select cron.schedule(
  'lifecycle-checks-hourly',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a.lovable.app/api/public/lifecycle-tick',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw'),
    body := '{}'::jsonb
  );
  $$
);