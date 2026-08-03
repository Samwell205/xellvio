CREATE OR REPLACE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rec record; campaign_account uuid; current_balance numeric; profitable_price numeric; carrier_cost numeric; next_attempt integer;
BEGIN
  SELECT account_id INTO campaign_account FROM public.campaigns WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  UPDATE public.messages SET status='failed', error_code='dispatch_timeout', failure_reason='The send result is uncertain after a dispatcher timeout. Explicit approval is required before retrying.'
  WHERE campaign_id=_campaign_id AND status='sending' AND provider_message_id IS NULL AND (dispatch_started_at IS NULL OR dispatch_started_at < now()-interval '2 minutes');

  FOR rec IN
    SELECT m.id,m.phone_e164,m.rendered_body,m.country_code,COALESCE(m.segments_count,1) AS segments_count,
      COALESCE(m.is_mms,false) AS is_mms,COALESCE(m.attempt_number,0) AS previous_attempt,
      m.retry_authorization_source,m.retry_authorized_by,m.retry_authorized_at,
      cr.sell_price,cr.cost_price,cr.passthrough_fee,cr.mms_multiplier,cr.mms_cost_multiplier
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code=m.country_code AND cr.active=true
    LEFT JOIN public.profiles p ON p.id=m.profile_id
    WHERE m.campaign_id=_campaign_id AND m.status='queued' AND m.charged_at IS NULL
      AND (COALESCE(p.two_way_opt_in,false)=true OR NOT EXISTS (
        SELECT 1 FROM public.messages recent
        JOIN public.campaigns recent_campaign ON recent_campaign.id=recent.campaign_id
        WHERE recent_campaign.account_id=campaign_account
          AND recent.phone_e164=m.phone_e164
          AND recent.created_at >= now()-interval '24 hours'
        OFFSET 9 LIMIT 1
      ))
    ORDER BY m.cost ASC NULLS FIRST,m.created_at ASC
    FOR UPDATE OF m SKIP LOCKED
    LIMIT LEAST(720,GREATEST(0,_limit))
  LOOP
    next_attempt:=rec.previous_attempt+1;
    IF next_attempt>1 AND (rec.retry_authorized_by IS NULL OR rec.retry_authorized_at IS NULL OR rec.retry_authorized_at<now()-interval '24 hours') THEN
      UPDATE public.messages SET status='failed',error_code='retry_authorization_required',failure_reason='Retry requires a fresh explicit approval.' WHERE messages.id=rec.id; CONTINUE;
    END IF;
    IF rec.sell_price IS NULL THEN
      UPDATE public.messages SET status='failed',error_code='rate_unavailable',failure_reason='No active price is available for this destination.' WHERE messages.id=rec.id; CONTINUE;
    END IF;
    profitable_price:=ROUND(rec.sell_price*rec.segments_count*CASE WHEN rec.is_mms THEN COALESCE(rec.mms_multiplier,1) ELSE 1 END,4);
    carrier_cost:=ROUND((COALESCE(rec.cost_price,0)+COALESCE(rec.passthrough_fee,0))*rec.segments_count*CASE WHEN rec.is_mms THEN COALESCE(rec.mms_cost_multiplier,rec.mms_multiplier,1) ELSE 1 END,6);
    current_balance:=NULL;
    UPDATE public.accounts SET credit_balance=credit_balance-profitable_price WHERE accounts.id=campaign_account AND credit_balance>=profitable_price RETURNING credit_balance INTO current_balance;
    IF current_balance IS NULL THEN
      UPDATE public.messages SET status='failed',error_code='insufficient_balance',failure_reason='Insufficient account credit for this send attempt.' WHERE messages.id=rec.id; CONTINUE;
    END IF;
    INSERT INTO public.credit_transactions(account_id,type,amount,balance_after,campaign_id,description)
    VALUES(campaign_account,'debit',profitable_price,current_balance,_campaign_id,'Reserved SMS attempt '||next_attempt||' → '||rec.phone_e164||' ('||COALESCE(rec.country_code,'??')||') × '||rec.segments_count);
    UPDATE public.messages SET status='sending',dispatch_started_at=now(),cost=profitable_price,charged_at=now(),charged_amount=profitable_price,attempt_number=next_attempt,retry_authorization_source=NULL,retry_authorized_by=NULL,retry_authorized_at=NULL WHERE messages.id=rec.id;
    INSERT INTO public.message_send_attempts(message_id,campaign_id,account_id,attempt_number,authorization_source,authorized_by,reason,tenant_charge,estimated_carrier_cost,provider_status)
    VALUES(rec.id,_campaign_id,campaign_account,next_attempt,CASE WHEN next_attempt=1 THEN 'original_campaign' ELSE COALESCE(rec.retry_authorization_source,'manual_retry') END,CASE WHEN next_attempt=1 THEN NULL ELSE rec.retry_authorized_by END,CASE WHEN next_attempt=1 THEN 'Original campaign send' ELSE 'Explicitly approved retry' END,profitable_price,carrier_cost,'reserved');
    id:=rec.id; phone_e164:=rec.phone_e164; rendered_body:=rec.rendered_body; country_code:=rec.country_code; segments_count:=rec.segments_count; cost:=profitable_price; attempt_number:=next_attempt; RETURN NEXT;
  END LOOP;
END;$function$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='dispatch-campaigns-fast-30s';
SELECT cron.schedule('dispatch-campaigns-fast-30s','* * * * *',$cron$SELECT pg_sleep(30); SELECT net.http_post(url := 'https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a.lovable.app/api/public/dispatch-campaign', headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhcGFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw'), body := '{}'::jsonb, timeout_milliseconds := 60000);$cron$);