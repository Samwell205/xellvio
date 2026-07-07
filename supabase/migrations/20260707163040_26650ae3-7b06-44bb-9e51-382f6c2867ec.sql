
-- 1) Extend accounts self-update guard to cover seller/credit fields
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
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- Also guard against tenants promoting themselves via INSERT (self-insert policy exists)
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_insert()
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

  NEW.credit_balance := 0;
  NEW.seller_balance := 0;
  NEW.seller_lifetime_earnings := 0;
  NEW.is_seller := false;
  NEW.suspended_at := NULL;
  NEW.sending_suspended_at := NULL;
  NEW.sending_suspended_reason := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_insert ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_insert
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_insert();

-- 2) Tighten marketplace_listings seller-insert policy: force safe defaults
DROP POLICY IF EXISTS "Sellers insert own listings" ON public.marketplace_listings;
CREATE POLICY "Sellers insert own listings"
  ON public.marketplace_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_account_id = auth.uid()
    AND status = 'verifying'
    AND buyer_account_id IS NULL
    AND buyer_price_amount IS NULL
    AND seller_payout_amount IS NULL
    AND sold_at IS NULL
  );

-- 3) Revoke EXECUTE from anon on SECURITY DEFINER functions that must not be public
REVOKE EXECUTE ON FUNCTION public.claim_and_sell_verified_tfn(uuid, numeric, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_verifier_wallet(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_verifier_withdrawal_paid(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_verifier_withdrawal(uuid, text) FROM anon, PUBLIC;
