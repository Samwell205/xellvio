
-- 1) accounts: block tenants from updating sensitive system-managed columns
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin') THEN
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

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update_trg ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_update_trg
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_update();

-- Also add an explicit WITH CHECK on the self-update policy
DROP POLICY IF EXISTS "profile self update" ON public.accounts;
CREATE POLICY "profile self update" ON public.accounts
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2) payments: restrict policies to authenticated role
DROP POLICY IF EXISTS "tenant creates own payments" ON public.payments;
CREATE POLICY "tenant creates own payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (account_id = auth.uid());

DROP POLICY IF EXISTS "tenant reads own payments" ON public.payments;
CREATE POLICY "tenant reads own payments" ON public.payments
  FOR SELECT TO authenticated
  USING ((account_id = auth.uid()) OR has_role('admin'::app_role));

DROP POLICY IF EXISTS "admins update payments" ON public.payments;
CREATE POLICY "admins update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (has_role('admin'::app_role))
  WITH CHECK (has_role('admin'::app_role));

-- 3) sender_assets: restrict update policy to authenticated, and prevent tenants
--    from rewriting carrier-managed fields on their own rows
DROP POLICY IF EXISTS "tenant updates own sender assets" ON public.sender_assets;
CREATE POLICY "tenant updates own sender assets" ON public.sender_assets
  FOR UPDATE TO authenticated
  USING ((account_id = auth.uid()) OR has_role('admin'::app_role))
  WITH CHECK (
    has_role('admin'::app_role)
    OR ((account_id = auth.uid()) AND (verification_status = 'pending'))
  );

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.phone_sid IS DISTINCT FROM OLD.phone_sid
     OR NEW.messaging_service_sid IS DISTINCT FROM OLD.messaging_service_sid
     OR NEW.verification_sid IS DISTINCT FROM OLD.verification_sid
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes_trg ON public.sender_assets;
CREATE TRIGGER sender_assets_block_tenant_carrier_writes_trg
  BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.sender_assets_block_tenant_carrier_writes();
