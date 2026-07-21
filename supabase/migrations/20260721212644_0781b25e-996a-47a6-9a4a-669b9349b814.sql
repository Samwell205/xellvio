
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP FUNCTION IF EXISTS public.eligible_profile_ids_page(uuid, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.my_eligible_profile_ids_page(jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.eligible_profile_ids(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.eligible_profile_ids(_account_id uuid, _audience jsonb)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  include_ids UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'include','[]'::jsonb))::uuid);
  exclude_ids UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'exclude','[]'::jsonb))::uuid);
  direct_ids  UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'profile_ids','[]'::jsonb))::uuid);
BEGIN
  RETURN QUERY
  WITH included_seg AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(include_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  ),
  included AS (
    SELECT pid FROM included_seg
    UNION
    SELECT unnest(direct_ids) AS pid
  ),
  excluded AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(exclude_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  )
  SELECT p.id, p.phone_e164, p.first_name, p.last_name, p.country_code, COALESCE(p.custom_fields, '{}'::jsonb)
  FROM included i
  JOIN public.profiles p ON p.id = i.pid
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND COALESCE(c.status,'pending') = 'subscribed'
    AND NOT EXISTS (SELECT 1 FROM public.suppressions sp WHERE sp.account_id = _account_id AND sp.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.eligible_profile_ids_page(
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb)
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

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids_page(_audience jsonb, _limit integer DEFAULT 1000, _offset integer DEFAULT 0)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.eligible_profile_ids_page(public.get_acting_account_id(auth.uid()), _audience, _limit, _offset);
$$;

REVOKE ALL ON FUNCTION public.eligible_profile_ids(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids_page(uuid, jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) TO authenticated;
