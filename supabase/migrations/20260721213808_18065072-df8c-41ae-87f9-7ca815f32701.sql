
-- The public wrappers my_eligible_profile_count / my_eligible_profile_ids_page
-- run as SECURITY INVOKER and internally call public.eligible_profile_ids,
-- but execute privilege on that helper had been revoked from authenticated,
-- so every call from the campaign builder failed with permission denied and
-- the UI silently rendered 0 eligible recipients.
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO authenticated;
