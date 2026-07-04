
-- accounts
ALTER TABLE public.accounts DROP COLUMN IF EXISTS twilio_subaccount_sid;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS twilio_subaccount_auth_token_enc;
ALTER TABLE public.accounts RENAME COLUMN subaccount_phone_sid TO telnyx_number_id;
ALTER TABLE public.accounts RENAME COLUMN subaccount_phone_number TO telnyx_phone_number;
UPDATE public.accounts
   SET telnyx_messaging_profile_id = COALESCE(telnyx_messaging_profile_id, subaccount_messaging_service_sid)
 WHERE telnyx_messaging_profile_id IS NULL AND subaccount_messaging_service_sid IS NOT NULL;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS subaccount_messaging_service_sid;

-- sender_assets
ALTER TABLE public.sender_assets DROP COLUMN IF EXISTS phone_sid;
UPDATE public.sender_assets
   SET telnyx_messaging_profile_id = COALESCE(telnyx_messaging_profile_id, messaging_service_sid)
 WHERE telnyx_messaging_profile_id IS NULL AND messaging_service_sid IS NOT NULL;
ALTER TABLE public.sender_assets DROP COLUMN IF EXISTS messaging_service_sid;
ALTER TABLE public.sender_assets RENAME COLUMN verification_sid TO telnyx_verification_id;

-- verifier_tfns
ALTER TABLE public.verifier_tfns RENAME COLUMN twilio_phone_sid TO telnyx_number_id;
ALTER TABLE public.verifier_tfns RENAME COLUMN twilio_verification_sid TO telnyx_verification_id;

-- Update triggers that referenced the old column names
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
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.sending_suspended_at IS DISTINCT FROM OLD.sending_suspended_at
     OR NEW.sending_suspended_reason IS DISTINCT FROM OLD.sending_suspended_reason
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
     OR NEW.telnyx_phone_number IS DISTINCT FROM OLD.telnyx_phone_number
     OR NEW.telnyx_number_id IS DISTINCT FROM OLD.telnyx_number_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
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

  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.telnyx_phone_number_id IS DISTINCT FROM OLD.telnyx_phone_number_id
     OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
     OR NEW.telnyx_verification_id IS DISTINCT FROM OLD.telnyx_verification_id
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;

  RETURN NEW;
END;
$function$;
