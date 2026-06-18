
REVOKE EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_match_query(uuid, jsonb) FROM PUBLIC, anon, authenticated;
