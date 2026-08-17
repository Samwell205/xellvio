REVOKE EXECUTE ON FUNCTION public.my_eligible_country_counts(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_eligible_country_counts(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) TO authenticated, service_role;