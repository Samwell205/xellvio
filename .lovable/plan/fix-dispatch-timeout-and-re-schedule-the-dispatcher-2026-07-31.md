# Fix dispatch_timeout and re-schedule the dispatcher

## Goal
Stop `dispatch_timeout` failures on outbound campaigns by (1) refunding every tenant that was charged for a message that never reached the carrier, and (2) re-scheduling the dispatcher cron job with a long enough HTTP timeout so the worker is not cancelled mid-flight.

## Prerequisites
You need two values before running the SQL:
1. Your live app base URL (the domain the Cloudflare Worker is deployed to), e.g. `https://xellvio.lovable.app` or your custom domain.
2. Your Supabase project's **publishable/anon key** (starts with `eyJ...`).

## Step 1 — Run the refund / fix script
1. Open your Supabase SQL Editor (or any Postgres client connected to your project).
2. Copy the entire contents of `migration-kit/sql/04-dispatch-timeout-refund.sql`.
3. Paste it into the editor and run it.
4. The script will:
   - Refund every historical `dispatch_timeout` row that was charged but never sent.
   - Replace the inline timeout write-off in `claim_campaign_messages` with a refunding version, so future timeouts automatically credit the tenant back.

## Step 2 — Re-schedule the dispatcher with a 60-second timeout
1. In the same SQL Editor, run the following, replacing `<LIVE_APP_BASE_URL>` and `<SUPABASE_PUBLISHABLE_KEY>` with your real values:

```sql
select cron.unschedule('dispatch-campaigns');
select cron.schedule(
  'dispatch-campaigns', '* * * * *',
  $$ select net.http_post(
       url := '<LIVE_APP_BASE_URL>/api/public/dispatch-campaign',
       headers := jsonb_build_object('Content-Type','application/json','apikey','<SUPABASE_PUBLISHABLE_KEY>'),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000) $$);
```

2. Verify the job is registered:

```sql
select jobname, schedule, command from cron.job where jobname = 'dispatch-campaigns';
```

## Step 3 — Verify the fix
1. Go to your admin dashboard and confirm no campaigns are stuck in `paused_low_balance` unless there is a real low-balance issue.
2. Retry one of the failed campaigns (or send a small test campaign).
3. Watch the campaign report for a few minutes. Messages should move to `Sent` / `Delivered` instead of `Failed / dispatch_timeout`.
4. Check `cron.job_run_details` if you want to confirm the dispatcher is being invoked every minute:

```sql
select jobid, jobname, status, start_time, end_time
from cron.job_run_details
where jobname = 'dispatch-campaigns'
order by start_time desc
limit 10;
```

## What changed in the code
- `src/routes/api.public.dispatch-campaign.ts` now uses smaller batches (`120` per worker, `30` concurrent) and a 40-second soft wall-clock budget, so it stops gracefully before the caller hangs up.
- `migration-kit/sql/04-dispatch-timeout-refund.sql` refunds historical charges and makes future `dispatch_timeout` rows auto-refund with a clear failure reason.

## Notes
- The script is safe to run more than once; the refund loop only touches rows where `error_code = 'dispatch_timeout'` and `charged_at IS NOT NULL`.
- If you do not know your Supabase publishable key, you can find it in your Supabase project settings under **Project Settings → API → Project API keys → anon / public**.
