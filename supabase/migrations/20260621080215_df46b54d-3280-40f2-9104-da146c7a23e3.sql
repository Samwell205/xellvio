ALTER VIEW public.country_rates_public SET (security_invoker = true);

GRANT SELECT (country_code, country_name, dial_prefix, sell_price, mms_multiplier, sender_supports_inbound, active)
  ON public.country_rates TO authenticated, anon;

DROP POLICY IF EXISTS "country_rates public safe read" ON public.country_rates;
CREATE POLICY "country_rates public safe read"
  ON public.country_rates
  FOR SELECT
  TO authenticated, anon
  USING (true);