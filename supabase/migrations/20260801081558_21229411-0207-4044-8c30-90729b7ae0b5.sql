CREATE OR REPLACE FUNCTION public.refund_timed_out_message_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  acct uuid;
  new_balance numeric;
BEGIN
  IF NEW.status = 'failed'
     AND NEW.error_code = 'dispatch_timeout'
     AND NEW.provider_message_id IS NULL
     AND NEW.refunded_at IS NULL
     AND NEW.sent_at IS NOT NULL
     AND COALESCE(NEW.cost, 0) > 0 THEN
    SELECT account_id INTO acct FROM public.campaigns WHERE id = NEW.campaign_id;
    IF acct IS NOT NULL THEN
      UPDATE public.accounts SET credit_balance = credit_balance + NEW.cost WHERE id = acct RETURNING credit_balance INTO new_balance;
      IF new_balance IS NOT NULL THEN
        INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
        VALUES (acct, 'refund', NEW.cost, new_balance, NEW.campaign_id, 'Refund — SMS was not accepted for delivery');
        NEW.refunded_at := now();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.refund_timed_out_message_charge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_timed_out_message_charge() TO service_role;
DROP TRIGGER IF EXISTS messages_refund_dispatch_timeout ON public.messages;
CREATE TRIGGER messages_refund_dispatch_timeout
BEFORE UPDATE OF status, error_code ON public.messages
FOR EACH ROW
WHEN (NEW.status = 'failed' AND NEW.error_code = 'dispatch_timeout' AND NEW.provider_message_id IS NULL)
EXECUTE FUNCTION public.refund_timed_out_message_charge();