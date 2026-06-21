-- Revert view to caller's privileges (linter best practice)
ALTER VIEW public.country_rates_public SET (security_invoker = true);

-- Grant SELECT only on safe public columns (cost_price/markup_percent excluded)
GRANT SELECT (
  country_code,
  country_name,
  dial_prefix,
  sell_price,
  mms_multiplier,
  sender_supports_inbound,
  active
) ON public.country_rates TO anon, authenticated;

-- Re-add a SELECT RLS policy; column grants prevent reading cost/margin
DROP POLICY IF EXISTS "country_rates safe column read" ON public.country_rates;
CREATE POLICY "country_rates safe column read"
  ON public.country_rates
  FOR SELECT
  TO anon, authenticated
  USING (true);