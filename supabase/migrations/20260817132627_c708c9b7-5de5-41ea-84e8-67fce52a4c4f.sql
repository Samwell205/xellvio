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
  excl_cc     TEXT[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'excluded_countries','[]'::jsonb)));
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
  LEFT JOIN LATERAL (
    SELECT cr.country_code
    FROM public.country_rates cr
    WHERE cardinality(excl_cc) > 0
      AND (p.country_code IS NULL OR p.country_code = '')
      AND cr.dial_prefix IS NOT NULL
      AND p.phone_e164 LIKE cr.dial_prefix || '%'
    ORDER BY length(cr.dial_prefix) DESC
    LIMIT 1
  ) pref ON TRUE
  WHERE p.account_id = _account_id
    AND COALESCE(c.status,'pending') = 'subscribed'
    AND NOT EXISTS (SELECT 1 FROM public.suppressions sp WHERE sp.account_id = _account_id AND sp.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM public.unroutable_numbers un WHERE un.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id)
    AND (
      cardinality(excl_cc) = 0
      OR COALESCE(NULLIF(p.country_code, ''), pref.country_code, '??') <> ALL (excl_cc)
    );
END;
$function$;