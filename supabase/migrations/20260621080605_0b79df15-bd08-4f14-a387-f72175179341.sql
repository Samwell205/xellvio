-- 1) Drop the permissive policy that exposed cost/margin via the raw table
DROP POLICY IF EXISTS "country_rates public safe read" ON public.country_rates;

-- 2) Revoke the broad column grants we previously gave anon/authenticated
REVOKE SELECT ON public.country_rates FROM anon;
REVOKE SELECT ON public.country_rates FROM authenticated;

-- 3) Switch the public view to SECURITY DEFINER mode so it runs as the
--    view owner and tenants can read safe columns without direct table access
ALTER VIEW public.country_rates_public SET (security_invoker = false);
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

-- 4) Remove country_rates from the Realtime publication so row-change
--    events (which include cost_price/markup_percent) are not broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.country_rates;