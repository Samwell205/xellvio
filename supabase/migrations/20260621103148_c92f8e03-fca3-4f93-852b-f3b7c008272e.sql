CREATE OR REPLACE FUNCTION public.eligible_profile_ids_page(
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.eligible_profile_ids(_account_id, _audience)
  OFFSET GREATEST(_offset, 0)
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids_page(
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.eligible_profile_ids_page(auth.uid(), _audience, _limit, _offset);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_count(_audience jsonb)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.eligible_profile_ids(auth.uid(), _audience);
$$;

REVOKE EXECUTE ON FUNCTION public.eligible_profile_ids_page(uuid, jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids_page(uuid, jsonb, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) TO authenticated;