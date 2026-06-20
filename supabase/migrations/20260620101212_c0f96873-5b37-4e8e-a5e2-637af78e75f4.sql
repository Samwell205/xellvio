CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
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
  IF COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
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

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update_trg ON public.accounts;
DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes_trg ON public.sender_assets;

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_update
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_update();

DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes ON public.sender_assets;
CREATE TRIGGER sender_assets_block_tenant_carrier_writes
  BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.sender_assets_block_tenant_carrier_writes();