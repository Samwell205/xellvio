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
  ORDER BY profile_id
  OFFSET GREATEST(_offset, 0)
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
$$;