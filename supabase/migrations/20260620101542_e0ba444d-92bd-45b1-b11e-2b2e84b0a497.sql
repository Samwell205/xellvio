CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
     OR NEW.twilio_subaccount_auth_token_enc IS DISTINCT FROM OLD.twilio_subaccount_auth_token_enc
     OR NEW.subaccount_phone_number IS DISTINCT FROM OLD.subaccount_phone_number
     OR NEW.subaccount_phone_sid IS DISTINCT FROM OLD.subaccount_phone_sid
     OR NEW.subaccount_messaging_service_sid IS DISTINCT FROM OLD.subaccount_messaging_service_sid
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.phone_sid IS DISTINCT FROM OLD.phone_sid
     OR NEW.messaging_service_sid IS DISTINCT FROM OLD.messaging_service_sid
     OR NEW.verification_sid IS DISTINCT FROM OLD.verification_sid
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accounts_block_sensitive_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sender_assets_block_tenant_carrier_writes() FROM PUBLIC, anon, authenticated;

UPDATE public.sender_assets
SET verification_status = 'rejected',
    rejection_reason = 'The earlier submission was not registered with Twilio because the carrier phone ID was not saved. Click Resubmit to continue with the reserved toll-free number; no new number will be purchased.',
    friendly_rejection_reason = 'The earlier submission did not reach Twilio. Click Resubmit to continue with the reserved toll-free number; no new number will be purchased.',
    last_synced_at = now()
WHERE country_code = 'US'
  AND sender_kind = 'toll_free'
  AND verification_sid IS NULL
  AND verification_status = 'pending';