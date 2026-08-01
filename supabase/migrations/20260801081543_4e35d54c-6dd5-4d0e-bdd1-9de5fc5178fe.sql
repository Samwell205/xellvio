CREATE OR REPLACE FUNCTION public.refund_timed_out_message_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF NEW.status = 'failed'
     AND NEW.error_code = 'dispatch_timeout'
     AND NEW.provider_message_id IS NULL
     AND NEW.refunded_at IS NULL
     AND NEW.sent_at IS NOT NULL
     AND COALESCE(NEW.cost, 0) > 0 THEN
    PERFORM public.refund_message_charge(NEW.id);
    SELECT refunded_at INTO NEW.refunded_at FROM public.messages WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.refund_timed_out_message_charge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_timed_out_message_charge() TO service_role;
DROP TRIGGER IF EXISTS messages_refund_dispatch_timeout ON public.messages;
CREATE TRIGGER messages_refund_dispatch_timeout
AFTER UPDATE OF status, error_code ON public.messages
FOR EACH ROW
WHEN (NEW.status = 'failed' AND NEW.error_code = 'dispatch_timeout' AND NEW.provider_message_id IS NULL)
EXECUTE FUNCTION public.refund_timed_out_message_charge();