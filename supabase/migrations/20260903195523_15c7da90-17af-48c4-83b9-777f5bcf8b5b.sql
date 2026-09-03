CREATE OR REPLACE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
 RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer, force_sms boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  campaign_account uuid;
BEGIN
  SELECT account_id INTO campaign_account FROM public.campaigns WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  UPDATE public.messages
     SET status='failed', error_code='dispatch_timeout',
         failure_reason='The send result is uncertain after a dispatcher timeout. Explicit approval is required before retrying.'
   WHERE campaign_id=_campaign_id AND status='sending' AND provider_message_id IS NULL
     AND (dispatch_started_at IS NULL OR dispatch_started_at < now()-interval '2 minutes');

  RETURN QUERY
  WITH prepaid AS (
    SELECT m.id
      FROM public.messages m
     WHERE m.campaign_id=_campaign_id AND m.status='queued' AND m.charged_at IS NOT NULL
     ORDER BY m.created_at ASC
     LIMIT LEAST(1000, GREATEST(0,_limit))
     FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.messages m
       SET status='sending', dispatch_started_at=now(),
           attempt_number=GREATEST(COALESCE(m.attempt_number,0),1)
      FROM prepaid p WHERE m.id = p.id
    RETURNING m.id, m.phone_e164, m.rendered_body, m.country_code,
              COALESCE(m.segments_count,1) AS seg, COALESCE(m.cost,0) AS price,
              COALESCE(m.attempt_number,1) AS next_attempt, COALESCE(m.force_sms,false) AS force_sms
  )
  SELECT c.id, c.phone_e164, c.rendered_body, c.country_code, c.seg, c.price, c.next_attempt, c.force_sms
    FROM claimed c;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cand AS (
    SELECT m.id, m.phone_e164, m.rendered_body, m.country_code,
           COALESCE(m.segments_count,1) AS seg,
           COALESCE(m.is_mms,false) AS is_mms,
           COALESCE(m.force_sms,false) AS force_sms,
           COALESCE(m.attempt_number,0) AS prev_attempt,
           m.retry_authorization_source, m.retry_authorized_by, m.retry_authorized_at
      FROM public.messages m
     WHERE m.campaign_id=_campaign_id AND m.status='queued' AND m.charged_at IS NULL
     ORDER BY m.created_at ASC
     LIMIT LEAST(1000, GREATEST(0,_limit))
     FOR UPDATE SKIP LOCKED
  ),
  priced AS (
    SELECT c.*,
           c.prev_attempt + 1 AS next_attempt,
           cr.sell_price,
           ROUND(cr.sell_price * c.seg * CASE WHEN c.is_mms AND NOT c.force_sms THEN COALESCE(cr.mms_multiplier,1) ELSE 1 END, 4) AS price,
           ROUND((COALESCE(cr.cost_price,0)+COALESCE(cr.passthrough_fee,0)) * c.seg * CASE WHEN c.is_mms AND NOT c.force_sms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 1) ELSE 1 END, 6) AS carrier_cost,
           EXISTS (
             SELECT 1 FROM public.messages recent
              WHERE recent.phone_e164 = c.phone_e164
                AND recent.created_at >= now()-interval '24 hours'
                AND recent.campaign_id <> _campaign_id
              OFFSET 9 LIMIT 1
           ) AS freq_capped
      FROM cand c
      LEFT JOIN public.country_rates cr ON cr.country_code=c.country_code AND cr.active=true
  ),
  classified AS (
    SELECT p.*,
      CASE
        WHEN p.freq_capped THEN 'frequency_cap'
        WHEN p.next_attempt > 1 AND (p.retry_authorized_by IS NULL OR p.retry_authorized_at IS NULL OR p.retry_authorized_at < now()-interval '24 hours')
          THEN 'retry_authorization_required'
        WHEN p.sell_price IS NULL THEN 'rate_unavailable'
        ELSE 'ok'
      END AS verdict
      FROM priced p
  ),
  bal AS (
    SELECT credit_balance FROM public.accounts WHERE accounts.id = campaign_account FOR UPDATE
  ),
  ranked AS (
    SELECT c.*, SUM(c.price) OVER (ORDER BY c.price ASC, c.id ASC ROWS UNBOUNDED PRECEDING) AS running
      FROM classified c WHERE c.verdict='ok'
  ),
  affordable AS (
    SELECT r.* FROM ranked r WHERE r.running <= (SELECT credit_balance FROM bal)
  ),
  unaffordable AS (
    SELECT r.* FROM ranked r WHERE r.running > (SELECT credit_balance FROM bal)
  ),
  total AS (
    SELECT COALESCE(SUM(price),0) AS amount, COUNT(*) AS n FROM affordable
  ),
  debit AS (
    UPDATE public.accounts a
       SET credit_balance = a.credit_balance - (SELECT amount FROM total)
     WHERE a.id = campaign_account AND (SELECT n FROM total) > 0
    RETURNING a.credit_balance
  ),
  ledger AS (
    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    SELECT campaign_account, 'debit', (SELECT amount FROM total), (SELECT credit_balance FROM debit), _campaign_id,
           'Reserved ' || (SELECT n FROM total) || ' message(s) for dispatch'
     WHERE (SELECT n FROM total) > 0
    RETURNING 1
  ),
  mark_ok AS (
    UPDATE public.messages m
       SET status='sending', dispatch_started_at=now(), cost=a.price, charged_at=now(),
           charged_amount=a.price, attempt_number=a.next_attempt,
           retry_authorization_source=CASE WHEN a.next_attempt=1 THEN 'original_campaign' ELSE COALESCE(a.retry_authorization_source,'manual_retry') END,
           retry_authorized_by=CASE WHEN a.next_attempt=1 THEN NULL ELSE a.retry_authorized_by END,
           retry_authorized_at=CASE WHEN a.next_attempt=1 THEN NULL ELSE a.retry_authorized_at END
      FROM affordable a
     WHERE m.id = a.id
    RETURNING m.id
  ),
  attempts AS (
    INSERT INTO public.message_send_attempts(message_id, campaign_id, account_id, attempt_number, authorization_source, authorized_by, reason, tenant_charge, estimated_carrier_cost, provider_status)
    SELECT a.id, _campaign_id, campaign_account, a.next_attempt,
           CASE WHEN a.next_attempt=1 THEN 'original_campaign' ELSE COALESCE(a.retry_authorization_source,'manual_retry') END,
           CASE WHEN a.next_attempt=1 THEN NULL ELSE a.retry_authorized_by END,
           CASE WHEN a.next_attempt=1 THEN 'Original campaign send' WHEN a.force_sms THEN 'Explicitly approved retry as SMS without media' ELSE 'Explicitly approved retry' END,
           a.price, a.carrier_cost, 'reserved'
      FROM affordable a
    RETURNING 1
  ),
  mark_broke AS (
    UPDATE public.messages m
       SET status='failed', error_code='insufficient_balance',
           failure_reason='Insufficient account credit for this send attempt.'
      FROM unaffordable u WHERE m.id = u.id
    RETURNING m.id
  ),
  mark_bad AS (
    UPDATE public.messages m
       SET status='failed', error_code=c.verdict,
           failure_reason = CASE
             WHEN c.verdict='rate_unavailable' THEN 'No active price is available for this destination.'
             WHEN c.verdict='frequency_cap' THEN 'Recipient already received the maximum number of messages allowed in 24 hours.'
             ELSE 'Retry requires a fresh explicit approval.' END
      FROM classified c WHERE m.id = c.id AND c.verdict <> 'ok'
    RETURNING m.id
  )
  SELECT a.id, a.phone_e164, a.rendered_body, a.country_code, a.seg, a.price, a.next_attempt, a.force_sms
    FROM affordable a;
END;
$function$;