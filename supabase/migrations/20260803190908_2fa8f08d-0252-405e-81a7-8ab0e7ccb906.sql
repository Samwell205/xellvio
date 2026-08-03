CREATE OR REPLACE FUNCTION public.refund_timed_out_message_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  acct uuid;
  refund_amount numeric;
  new_balance numeric;
BEGIN
  refund_amount := COALESCE(NEW.charged_amount, NEW.cost, 0);

  IF NEW.status = 'failed'
     AND NEW.error_code = 'dispatch_timeout'
     AND NEW.provider_message_id IS NULL
     AND NEW.refunded_at IS NULL
     AND NEW.charged_at IS NOT NULL
     AND refund_amount > 0 THEN
    SELECT account_id INTO acct
    FROM public.campaigns
    WHERE id = NEW.campaign_id;

    IF acct IS NOT NULL THEN
      UPDATE public.accounts
      SET credit_balance = credit_balance + refund_amount
      WHERE id = acct
      RETURNING credit_balance INTO new_balance;

      IF new_balance IS NOT NULL THEN
        INSERT INTO public.credit_transactions(
          account_id, type, amount, balance_after, campaign_id, description
        ) VALUES (
          acct,
          'refund',
          refund_amount,
          new_balance,
          NEW.campaign_id,
          'Automatic refund — dispatch interrupted before provider acceptance (' || NEW.id || ')'
        );
        NEW.refunded_at := now();
        NEW.charged_at := NULL;
        NEW.charged_amount := NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;