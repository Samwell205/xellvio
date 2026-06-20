
-- 1) Remove anon access to country_rates (which exposes cost_price/markup_percent).
DROP POLICY IF EXISTS "Public can read active country rates" ON public.country_rates;
REVOKE SELECT ON public.country_rates FROM anon;

-- Expose only the safe public view to anon.
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

-- 2) Tighten billing_settings: scope the ALL policy to authenticated admins only.
DROP POLICY IF EXISTS "admins manage settings" ON public.billing_settings;
CREATE POLICY "admins manage settings"
  ON public.billing_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role));

-- 3) Allow tenants to read their own toll-free verification attempt rows.
CREATE POLICY "Tenants can read own tollfree verification attempts"
  ON public.tollfree_verification_attempts
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());
