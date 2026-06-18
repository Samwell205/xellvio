
CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids(_audience jsonb)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.eligible_profile_ids(auth.uid(), _audience);
$$;

REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) TO authenticated;
