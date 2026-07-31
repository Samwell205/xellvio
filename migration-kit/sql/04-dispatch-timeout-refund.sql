-- ============================================================
-- Fix: "dispatch_timeout" failures on outbound campaigns
--
-- Symptom: recipients show `Failed / dispatch_timeout` with a cost charged,
-- even though nothing ever reached the carrier.
--
-- Cause: the dispatcher reserves (debits) the send, marks the row `sending`,
-- then calls the carrier. If the HTTP caller (pg_cron -> pg_net) hangs up
-- before the run finishes, the serverless worker is cancelled mid-flight and
-- those rows stay `sending` with no provider id. The next run writes them off
-- as `dispatch_timeout` — but the reservation was never refunded.
--
-- This script does two things:
--   1. Refunds every historical dispatch_timeout row that is still charged.
--   2. Replaces the timeout write-off inside claim_campaign_messages so the
--      reservation is always refunded going forward.
--
-- Run this on the live database, then re-schedule the cron job with a longer
-- pg_net timeout (see the bottom of this file).
-- ============================================================

-- ── 1. Refund historical write-offs ─────────────────────────
DO $$
DECLARE r record; new_balance numeric;
BEGIN
  FOR r IN
    SELECT id, account_id, campaign_id, phone_e164, charged_amount
    FROM public.messages
    WHERE error_code = 'dispatch_timeout'
      AND charged_at IS NOT NULL
      AND COALESCE(charged_amount, 0) > 0
      AND provider_message_id IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.accounts
       SET credit_balance = credit_balance + r.charged_amount
     WHERE id = r.account_id
    RETURNING credit_balance INTO new_balance;

    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (r.account_id, 'credit', r.charged_amount, new_balance, r.campaign_id,
            'Refund — message never dispatched (dispatch_timeout) → ' || r.phone_e164);

    UPDATE public.messages
       SET charged_at = NULL, charged_amount = 0, cost = 0
     WHERE id = r.id;
  END LOOP;
END $$;

-- ── 2. Always refund on future timeouts ─────────────────────
CREATE OR REPLACE FUNCTION public.refund_dispatch_timeouts(_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; new_balance numeric; n integer := 0;
BEGIN
  FOR r IN
    SELECT id, account_id, campaign_id, phone_e164, COALESCE(charged_amount, cost, 0) AS amt
    FROM public.messages
    WHERE campaign_id = _campaign_id
      AND status = 'sending'
      AND provider_message_id IS NULL
      AND (dispatch_started_at IS NULL OR dispatch_started_at < now() - interval '2 minutes')
    FOR UPDATE
  LOOP
    IF r.amt > 0 THEN
      UPDATE public.accounts SET credit_balance = credit_balance + r.amt
       WHERE id = r.account_id RETURNING credit_balance INTO new_balance;
      INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
      VALUES (r.account_id, 'credit', r.amt, new_balance, r.campaign_id,
              'Refund — message never dispatched (dispatch_timeout) → ' || r.phone_e164);
    END IF;

    UPDATE public.messages
       SET status = 'failed',
           error_code = 'dispatch_timeout',
           failure_reason = 'The send was interrupted before it reached the carrier. Nothing was sent and the charge was refunded — you can safely resend.',
           charged_at = NULL,
           charged_amount = 0,
           cost = 0
     WHERE id = r.id;

    UPDATE public.message_send_attempts
       SET provider_status = 'refunded',
           error_code = 'dispatch_timeout',
           failure_reason = 'Interrupted before carrier hand-off; tenant charge refunded.',
           tenant_charge = 0,
           finalized_at = now()
     WHERE message_id = r.id AND finalized_at IS NULL;

    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.refund_dispatch_timeouts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_dispatch_timeouts(uuid) TO service_role;

-- Swap the inline write-off inside claim_campaign_messages for the refunding
-- version above (everything else in the function is unchanged).
CREATE OR REPLACE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
 RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  campaign_account uuid;
  current_balance numeric;
  profitable_price numeric;
  carrier_cost numeric;
  next_attempt integer;
BEGIN
  SELECT account_id INTO campaign_account FROM public.campaigns WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  PERFORM public.refund_dispatch_timeouts(_campaign_id);

  FOR rec IN
    SELECT m.id, m.phone_e164, m.rendered_body, m.country_code,
           COALESCE(m.segments_count, 1) AS segments_count,
           COALESCE(m.is_mms, false) AS is_mms,
           COALESCE(m.attempt_number, 0) AS previous_attempt,
           m.retry_authorization_source, m.retry_authorized_by, m.retry_authorized_at,
           cr.sell_price, cr.cost_price, cr.passthrough_fee,
           cr.mms_multiplier, cr.mms_cost_multiplier
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code AND cr.active = true
    WHERE m.campaign_id = _campaign_id
      AND m.status = 'queued'
      AND m.charged_at IS NULL
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE OF m SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  LOOP
    next_attempt := rec.previous_attempt + 1;
    IF next_attempt > 1 AND (rec.retry_authorized_by IS NULL OR rec.retry_authorized_at IS NULL OR rec.retry_authorized_at < now() - interval '24 hours') THEN
      UPDATE public.messages SET status='failed', error_code='retry_authorization_required', failure_reason='Retry requires a fresh explicit approval.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    IF rec.sell_price IS NULL THEN
      UPDATE public.messages SET status='failed', error_code='rate_unavailable', failure_reason='No active price is available for this destination.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    profitable_price := ROUND(rec.sell_price * rec.segments_count * CASE WHEN rec.is_mms THEN COALESCE(rec.mms_multiplier, 1) ELSE 1 END, 4);
    carrier_cost := ROUND((COALESCE(rec.cost_price,0) + COALESCE(rec.passthrough_fee,0)) * rec.segments_count * CASE WHEN rec.is_mms THEN COALESCE(rec.mms_cost_multiplier, rec.mms_multiplier, 1) ELSE 1 END, 6);

    UPDATE public.accounts SET credit_balance = credit_balance - profitable_price
    WHERE accounts.id = campaign_account AND credit_balance >= profitable_price
    RETURNING credit_balance INTO current_balance;

    IF current_balance IS NULL THEN
      UPDATE public.messages SET status='failed', error_code='insufficient_balance', failure_reason='Insufficient account credit for this send attempt.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (campaign_account, 'debit', profitable_price, current_balance, _campaign_id,
      'Reserved SMS attempt ' || next_attempt || ' → ' || rec.phone_e164 || ' (' || COALESCE(rec.country_code,'??') || ') × ' || rec.segments_count);

    UPDATE public.messages
    SET status='sending', dispatch_started_at=now(), cost=profitable_price, charged_at=now(), charged_amount=profitable_price,
        attempt_number=next_attempt, retry_authorization_source=NULL, retry_authorized_by=NULL, retry_authorized_at=NULL
    WHERE messages.id=rec.id;

    INSERT INTO public.message_send_attempts(message_id, campaign_id, account_id, attempt_number, authorization_source, authorized_by, reason, tenant_charge, estimated_carrier_cost, provider_status)
    VALUES (rec.id, _campaign_id, campaign_account, next_attempt,
      CASE WHEN next_attempt = 1 THEN 'original_campaign' ELSE COALESCE(rec.retry_authorization_source, 'manual_retry') END,
      CASE WHEN next_attempt = 1 THEN NULL ELSE rec.retry_authorized_by END,
      CASE WHEN next_attempt = 1 THEN 'Original campaign send' ELSE 'Explicitly approved retry' END,
      profitable_price, carrier_cost, 'reserved');

    id := rec.id; phone_e164 := rec.phone_e164; rendered_body := rec.rendered_body; country_code := rec.country_code;
    segments_count := rec.segments_count; cost := profitable_price; attempt_number := next_attempt;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- ── 3. Re-schedule the dispatcher with a real timeout ───────
-- pg_net defaults to a 5 second timeout. The dispatcher needs longer, and a
-- premature hang-up is exactly what produced the dispatch_timeout rows.
-- Replace <LIVE_APP_BASE_URL> and <SUPABASE_PUBLISHABLE_KEY> below, then run.

select cron.unschedule('dispatch-campaigns');
select cron.schedule(
  'dispatch-campaigns', '* * * * *',
  $$ select net.http_post(
       url := '<LIVE_APP_BASE_URL>/api/public/dispatch-campaign',
       headers := jsonb_build_object('Content-Type','application/json','apikey','<SUPABASE_PUBLISHABLE_KEY>'),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000) $$);
