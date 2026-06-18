
-- Switch to SECURITY INVOKER (RLS will scope reads to the caller automatically)
CREATE OR REPLACE FUNCTION public.profiles_match_query(_account_id UUID, _query JSONB)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND (
      CASE WHEN _query ? 'consent_in'
        THEN COALESCE(c.status,'pending') = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'consent_in')))
        ELSE COALESCE(c.status,'pending') = 'subscribed'
      END
    )
    AND (NOT (_query ? 'country_in')
         OR p.country_code = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'country_in'))))
$$;

CREATE OR REPLACE FUNCTION public.eligible_profile_ids(_account_id UUID, _audience JSONB)
RETURNS TABLE(profile_id UUID, phone_e164 TEXT, first_name TEXT, last_name TEXT, country_code TEXT)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  include_ids UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'include','[]'::jsonb))::uuid);
  exclude_ids UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'exclude','[]'::jsonb))::uuid);
BEGIN
  RETURN QUERY
  WITH included AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(include_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  ),
  excluded AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(exclude_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  )
  SELECT p.id, p.phone_e164, p.first_name, p.last_name, p.country_code
  FROM included i
  JOIN public.profiles p ON p.id = i.pid
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND COALESCE(c.status,'pending') = 'subscribed'
    AND NOT EXISTS (SELECT 1 FROM public.suppressions sp WHERE sp.account_id = _account_id AND sp.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_match_query(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eligible_profile_ids(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_match_query(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(UUID, JSONB) TO authenticated, service_role;
