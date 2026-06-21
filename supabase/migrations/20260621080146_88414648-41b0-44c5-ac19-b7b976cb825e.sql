ALTER VIEW public.country_rates_public SET (security_invoker = false);
GRANT SELECT ON public.country_rates_public TO authenticated, anon;