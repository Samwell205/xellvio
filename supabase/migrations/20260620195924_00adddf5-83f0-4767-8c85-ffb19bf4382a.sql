
-- 1) country_rates: drop broad authenticated read; allow admins only
DROP POLICY IF EXISTS "country_rates readable to authenticated" ON public.country_rates;

CREATE POLICY "country_rates admin read"
  ON public.country_rates
  FOR SELECT
  USING (has_role('admin'::app_role));

-- Ensure tenants can read the safe view
GRANT SELECT ON public.country_rates_public TO authenticated, anon;

-- 2) payments: tighten tenant INSERT policy to validate credits/amount
DROP POLICY IF EXISTS "tenant creates own payments" ON public.payments;

CREATE POLICY "tenant creates own payments"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    account_id = auth.uid()
    AND status = 'pending'
    AND amount >= 0
    AND credits >= 0
    AND (
      EXISTS (
        SELECT 1 FROM public.credit_packs cp
        WHERE cp.id = payments.pack_id
          AND cp.is_active = true
          AND cp.currency = payments.currency
          AND cp.price = payments.amount
          AND cp.credits = payments.credits
      )
      OR (
        payments.pack_id IS NULL
        AND payments.currency = 'USD'
        AND payments.amount = payments.credits
        AND payments.amount BETWEEN 1 AND 10000
      )
    )
  );
