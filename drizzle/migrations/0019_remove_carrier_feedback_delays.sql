-- Owner decision 2026-10-22: retain confirmed carrier-spam pause + notice,
-- remove the added initial-canary/outstanding budgets and feedback timeouts.
-- Additive amendment to 0018; no historical migration rewrite, row backfill,
-- automatic resume, financial-function edit, or external send.

CREATE OR REPLACE FUNCTION public.spam_gate_claim(_campaign_id uuid,_limit integer)
RETURNS TABLE(id uuid,phone_e164 text,rendered_body text,country_code text,
              segments_count integer,cost numeric,attempt_number integer,force_sms boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c public.campaigns%ROWTYPE;
  m public.campaign_spam_monitors%ROWTYPE;
  on_hold boolean;
  claimed jsonb;
  rec record;
  fresh integer:=0;
  added integer;
BEGIN
  IF _limit IS NULL OR _limit<=0 THEN RETURN; END IF;
  -- The signed final-receipt transaction takes these locks in the same order.
  -- Once its confirmed spam pause commits, later chunks cannot claim work.
  SELECT * INTO c FROM public.campaigns WHERE campaigns.id=_campaign_id FOR UPDATE;
  IF NOT FOUND OR c.status NOT IN ('queued','sending','processing','scheduled') THEN RETURN; END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  -- Existing spam and historical feedback-timeout holds remain deliberate holds.
  IF m.state IN ('paused_spam','paused_timeout') THEN RETURN; END IF;
  SELECT a.sending_suspended_at IS NOT NULL OR a.onboarding_status<>'active'
    INTO on_hold FROM public.accounts a WHERE a.id=c.account_id;
  IF on_hold IS NULL OR on_hold THEN RETURN; END IF;
  IF m.campaign_id IS NOT NULL THEN
    -- Ordinary claims use counters maintained by the signed receipt transaction.
    -- Retry/reset is exceptional: correct stale provider IDs only when its
    -- indexed invalidation marker exists, without rescanning every batch.
    IF EXISTS(SELECT 1 FROM public.campaign_spam_receipt_invalidations
               WHERE campaign_id=_campaign_id) THEN
      PERFORM public.spam_gate_refresh(_campaign_id);
      SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id;
    END IF;
    -- A manual pause may have won the receipt transaction's campaign update.
    -- Known repeated-spam evidence must still stop a later resumed chunk.
    IF m.finalized_count>=20 AND m.spam_count>=CEIL(m.finalized_count*0.2) THEN
      PERFORM public.spam_gate_do_pause(_campaign_id,'spam');
      RETURN;
    END IF;
  END IF;

  -- Delegate the exact requested chunk size to the original financial RPC.
  -- That RPC retains its existing limit, prepaid recovery, pricing, balance,
  -- authorization and opt-out behavior. No feedback budget or routine receipt
  -- scan runs here. Only the returned batch is visited for reservation counts.
  -- Preserve message->account order shared with refund routines: lock/recheck
  -- account after the original claim, and roll all paid work back if hold won.
  BEGIN
    SELECT jsonb_agg(to_jsonb(x)) INTO claimed
      FROM public.claim_campaign_messages(_campaign_id,_limit) x;
    SELECT a.sending_suspended_at IS NOT NULL OR a.onboarding_status<>'active'
      INTO on_hold FROM public.accounts a WHERE a.id=c.account_id FOR UPDATE;
    IF on_hold IS NULL OR on_hold THEN
      RAISE SQLSTATE 'PT001' USING MESSAGE='Account hold won claim';
    END IF;
    IF m.campaign_id IS NOT NULL THEN
      FOR rec IN SELECT * FROM jsonb_to_recordset(COALESCE(claimed,'[]'::jsonb))
        AS x(id uuid,phone_e164 text,rendered_body text,country_code text,
             segments_count integer,cost numeric,attempt_number integer,force_sms boolean) LOOP
        INSERT INTO public.campaign_spam_reservations(message_id,attempt_number,campaign_id)
        VALUES(rec.id,rec.attempt_number,_campaign_id) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS added=ROW_COUNT;
        fresh:=fresh+added;
      END LOOP;
      IF fresh>0 THEN
        UPDATE public.campaign_spam_monitors
          SET submitted_count=submitted_count+fresh,updated_at=now()
          WHERE campaign_id=_campaign_id;
      END IF;
    END IF;
  EXCEPTION WHEN SQLSTATE 'PT001' THEN RETURN;
  END;
  RETURN QUERY SELECT * FROM jsonb_to_recordset(COALESCE(claimed,'[]'::jsonb))
    AS x(id uuid,phone_e164 text,rendered_body text,country_code text,
         segments_count integer,cost numeric,attempt_number integer,force_sms boolean);
END;
$function$;

-- Legacy feedback-timeout pauses are never resumed by this migration. An
-- explicit resume still requires fresh server content screening before this
-- exact-body/status/account CAS. Missing receipts no longer delay that action;
-- confirmed spam evidence and all active account holds still refuse it.
CREATE OR REPLACE FUNCTION public.spam_gate_resume_timeout(
  _campaign_id uuid,_account_id uuid,_body text,_status text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.campaigns%ROWTYPE;m public.campaign_spam_monitors%ROWTYPE;on_hold boolean;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND OR _status<>'paused' OR c.status IS DISTINCT FROM _status
    OR c.account_id IS DISTINCT FROM _account_id OR c.message_body IS DISTINCT FROM _body
    OR c.paused_reason IS NULL
    OR c.paused_reason NOT LIKE 'Paused: carrier feedback unavailable.%' THEN RETURN false; END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  IF NOT FOUND OR m.state<>'paused_timeout' THEN RETURN false; END IF;
  SELECT sending_suspended_at IS NOT NULL OR onboarding_status<>'active'
    INTO on_hold FROM public.accounts WHERE accounts.id=_account_id FOR UPDATE;
  IF on_hold IS NULL OR on_hold THEN RETURN false; END IF;
  -- Manual control only: current-ID correction is intentionally off the claim
  -- hot path. A verified repeated-spam hold may never be cleared by this RPC.
  PERFORM public.spam_gate_refresh(_campaign_id);
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id;
  IF m.finalized_count>=20 AND m.spam_count>=CEIL(m.finalized_count*0.2) THEN RETURN false; END IF;
  UPDATE public.campaign_spam_monitors SET state='released',waiting_since=NULL,updated_at=now()
   WHERE campaign_id=_campaign_id;
  UPDATE public.campaigns SET status='sending',paused_reason=NULL,paused_at=NULL,updated_at=now()
   WHERE id=_campaign_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.spam_gate_claim(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_resume_timeout(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spam_gate_claim(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_resume_timeout(uuid,uuid,text,text) TO service_role;
-- Keep direct callers from skipping the campaign/account/confirmed-spam checks.
REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
