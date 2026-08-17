ALTER FUNCTION public.my_eligible_country_counts(jsonb) SECURITY DEFINER;
ALTER FUNCTION public.my_eligible_profile_count(jsonb) SECURITY DEFINER;
ALTER FUNCTION public.my_eligible_profile_ids(jsonb) SECURITY DEFINER;
ALTER FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.my_eligible_country_counts(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) TO authenticated;

CREATE INDEX IF NOT EXISTS consents_sms_subscribed_idx ON public.consents (profile_id) WHERE channel = 'sms' AND status = 'subscribed';
CREATE INDEX IF NOT EXISTS profiles_account_country_idx ON public.profiles (account_id, country_code);