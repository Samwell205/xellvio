-- Drop the SECURITY DEFINER view; tenants now read pricing via server fns
DROP VIEW IF EXISTS public.country_rates_public;

-- Tighten table access: only admins (via RLS) and service_role can touch country_rates.
-- The "country_rates admin read" / "country_rates admin write" RLS policies remain
-- and gate non-admin authenticated users out entirely.
-- (authenticated table grants remain so admins, who are 'authenticated', can read/update.)