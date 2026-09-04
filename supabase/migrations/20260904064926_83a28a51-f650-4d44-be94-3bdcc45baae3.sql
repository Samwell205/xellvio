ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS click_domain text;

CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.seller_balance IS DISTINCT FROM OLD.seller_balance
     OR NEW.seller_lifetime_earnings IS DISTINCT FROM OLD.seller_lifetime_earnings
     OR NEW.is_seller IS DISTINCT FROM OLD.is_seller
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.sending_suspended_at IS DISTINCT FROM OLD.sending_suspended_at
     OR NEW.sending_suspended_reason IS DISTINCT FROM OLD.sending_suspended_reason
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
     OR NEW.telnyx_phone_number IS DISTINCT FROM OLD.telnyx_phone_number
     OR NEW.telnyx_number_id IS DISTINCT FROM OLD.telnyx_number_id
     OR NEW.click_domain IS DISTINCT FROM OLD.click_domain
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;