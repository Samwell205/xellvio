
-- Restrict billing_settings reads to admins (contains payout details)
DROP POLICY IF EXISTS "authenticated read settings" ON public.billing_settings;
CREATE POLICY "admins read settings" ON public.billing_settings
  FOR SELECT TO authenticated
  USING (has_role('admin'::app_role));

-- Remove anonymous access to country_rates (was exposing internal cost_price).
-- Authenticated users (logged-in app) still read via the existing policy.
DROP POLICY IF EXISTS "country_rates anon read active" ON public.country_rates;
REVOKE SELECT ON public.country_rates FROM anon;

-- Allow tenants to delete their own sender assets
CREATE POLICY "tenant deletes own sender assets" ON public.sender_assets
  FOR DELETE TO authenticated
  USING ((account_id = auth.uid()) OR has_role('admin'::app_role));
