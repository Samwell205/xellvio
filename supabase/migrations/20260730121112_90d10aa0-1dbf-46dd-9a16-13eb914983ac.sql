ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.refund_message_charge(_message_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF NOT FOUND THEN RETURN 0; END IF;
  IF m.refunded_at IS NOT NULL THEN RETURN 0; END IF;
  IF m.sent_at IS NULL THEN RETURN 0; END IF;
  IF COALESCE(m.cost, 0) <= 0 THEN RETURN 0; END IF;

  SELECT account_id INTO acct FROM public.campaigns WHERE id = m.campaign_id;
  IF acct IS NULL THEN RETURN 0; END IF;

  UPDATE public.accounts
    SET credit_balance = credit_balance + m.cost
    WHERE id = acct
    RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
  VALUES (acct, 'refund', m.cost, new_balance, m.campaign_id,
          'Refund — undelivered SMS to ' || COALESCE(m.phone_e164, '') || ' (' || COALESCE(m.country_code, '??') || ')');

  UPDATE public.messages SET refunded_at = now() WHERE id = m.id;

  RETURN m.cost;
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_message_charge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_message_charge(uuid) TO service_role;