ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.refund_message_charge(_message_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  m RECORD;
  acct uuid;
  new_balance numeric;
BEGIN
  SELECT id, campaign_id, cost, sent_at, refunded_at, phone_e164, country_code
    INTO m
    FROM public.messages
    WHERE id = _message_id
    FOR UPDATE;
  IF NOT FOUND OR m.refunded_at IS NOT NULL OR m.sent_at IS NULL OR COALESCE(m.cost, 0) <= 0 THEN RETURN 0; END IF;
  SELECT account_id INTO acct FROM public.campaigns WHERE id = m.campaign_id;
  IF acct IS NULL THEN RETURN 0; END IF;
  UPDATE public.accounts SET credit_balance = credit_balance + m.cost WHERE id = acct RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
  VALUES (acct, 'refund', m.cost, new_balance, m.campaign_id, 'Refund — SMS was not accepted for delivery');
  UPDATE public.messages SET refunded_at = now() WHERE id = m.id;
  RETURN m.cost;
END;
$function$;
REVOKE ALL ON FUNCTION public.refund_message_charge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_message_charge(uuid) TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.messages WHERE campaign_id='b9c1d447-7765-4026-887b-68ae0ecd8f05' AND status='failed' AND error_code='dispatch_timeout' AND provider_message_id IS NULL
  LOOP PERFORM public.refund_message_charge(r.id); END LOOP;
  UPDATE public.messages SET status='queued', error_code=NULL, failure_reason=NULL, dispatch_started_at=NULL, charged_at=NULL, charged_amount=NULL
   WHERE campaign_id='b9c1d447-7765-4026-887b-68ae0ecd8f05' AND status='failed' AND error_code='dispatch_timeout' AND provider_message_id IS NULL;
  UPDATE public.campaigns SET status='sending', paused_reason=NULL WHERE id='b9c1d447-7765-4026-887b-68ae0ecd8f05';
END $$;