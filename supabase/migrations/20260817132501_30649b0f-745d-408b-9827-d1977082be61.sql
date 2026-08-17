-- 1) Audience can reference contact lists directly (no client-side expansion)
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
  list_ids    UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'list_ids','[]'::jsonb))::uuid);
BEGIN
  RETURN QUERY
  WITH included_seg AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(include_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  ),
  included_list AS (
    SELECT DISTINCT plm.profile_id AS pid
    FROM public.profile_list_members plm
    JOIN public.contact_lists cl ON cl.id = plm.list_id AND cl.account_id = _account_id
    WHERE plm.list_id = ANY (list_ids)
  ),
  included AS (
    SELECT pid FROM included_seg
    UNION
    SELECT pid FROM included_list
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
    AND NOT EXISTS (SELECT 1 FROM public.unroutable_numbers un WHERE un.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$function$;

-- 2) Per-country recipient counts in a single round trip
CREATE OR REPLACE FUNCTION public.eligible_country_counts(_account_id uuid, _audience jsonb)
 RETURNS TABLE(country_code text, recipients integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(e.country_code, ''), pref.country_code, '??') AS country_code,
         count(*)::integer AS recipients
  FROM public.eligible_profile_ids(_account_id, _audience) e
  LEFT JOIN LATERAL (
    SELECT cr.country_code
    FROM public.country_rates cr
    WHERE cr.dial_prefix IS NOT NULL
      AND e.phone_e164 LIKE cr.dial_prefix || '%'
    ORDER BY length(cr.dial_prefix) DESC
    LIMIT 1
  ) pref ON e.country_code IS NULL OR e.country_code = ''
  GROUP BY 1
  ORDER BY 2 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.my_eligible_country_counts(_audience jsonb)
 RETURNS TABLE(country_code text, recipients integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.eligible_country_counts(public.get_acting_account_id(auth.uid()), _audience);
$function$;

REVOKE ALL ON FUNCTION public.eligible_country_counts(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_eligible_country_counts(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eligible_country_counts(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_country_counts(jsonb) TO authenticated, service_role;