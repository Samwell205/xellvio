GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_match_query(uuid, jsonb) TO authenticated;