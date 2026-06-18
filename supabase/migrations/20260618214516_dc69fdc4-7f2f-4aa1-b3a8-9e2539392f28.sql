
DROP POLICY IF EXISTS "credit_tx insert own" ON public.credit_transactions;

DROP POLICY IF EXISTS "tenant updates own sender assets" ON public.sender_assets;
CREATE POLICY "tenant updates own sender assets"
  ON public.sender_assets FOR UPDATE
  USING ((account_id = auth.uid()) OR public.has_role('admin'))
  WITH CHECK (
    public.has_role('admin')
    OR (account_id = auth.uid() AND verification_status = 'pending')
  );

DROP POLICY IF EXISTS "country_rates readable to all" ON public.country_rates;
CREATE POLICY "country_rates readable to authenticated"
  ON public.country_rates FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.country_rates_public
WITH (security_invoker = true) AS
SELECT id, country_code, country_name, dial_prefix, sell_price,
       mms_multiplier, active, sender_supports_inbound
FROM public.country_rates
WHERE active = true;

CREATE POLICY "country_rates anon read active"
  ON public.country_rates FOR SELECT TO anon USING (active = true);

REVOKE SELECT (cost_price) ON public.country_rates FROM anon;
GRANT SELECT (id, country_code, country_name, dial_prefix, sell_price,
              mms_multiplier, active, sender_supports_inbound) ON public.country_rates TO anon;
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

CREATE POLICY "tenants delete own payment proofs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'payment-proofs'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.has_role('admin'))
  );

CREATE POLICY "tenants update own payment proofs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'payment-proofs'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.has_role('admin'))
  )
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
