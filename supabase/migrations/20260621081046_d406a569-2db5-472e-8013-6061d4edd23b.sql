-- Drop the permissive read policy and column-level grants on the base table
DROP POLICY IF EXISTS "country_rates safe column read" ON public.country_rates;
REVOKE SELECT (country_code, country_name, dial_prefix, sell_price, mms_multiplier, sender_supports_inbound, active)
  ON public.country_rates FROM anon, authenticated;

-- Restore admin/tenant table-level access on the raw table.
-- RLS still gates non-admin authenticated users via the existing
-- "country_rates admin read" / "country_rates admin write" policies,
-- so only admins can SELECT/UPDATE rows directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.country_rates TO authenticated;
GRANT ALL ON public.country_rates TO service_role;

-- The public-safe view runs with the view owner's privileges so
-- anon/authenticated can read ONLY the safe columns it projects.
ALTER VIEW public.country_rates_public SET (security_invoker = false);
GRANT SELECT ON public.country_rates_public TO anon, authenticated;