GRANT SELECT ON public.country_rates TO anon;

CREATE POLICY "Public can read active country rates"
ON public.country_rates
FOR SELECT
TO anon
USING (active = true);