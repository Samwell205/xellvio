CREATE OR REPLACE FUNCTION public.unplanned_recipients_page(
  _campaign_id uuid,
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 500
)
RETURNS TABLE(
  profile_id uuid,
  phone_e164 text,
  first_name text,
  last_name text,
  country_code text,
  custom_fields jsonb,
  remaining bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH page AS MATERIALIZED (
    SELECT e.profile_id, e.phone_e164, e.first_name, e.last_name, e.country_code, e.custom_fields
    FROM public.eligible_profile_ids(_account_id, _audience) e
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.campaign_id = _campaign_id
        AND m.profile_id = e.profile_id
    )
    ORDER BY e.profile_id
    LIMIT LEAST(GREATEST(_limit, 1), 5000) + 1
  ), bounded AS (
    SELECT p.*, row_number() OVER (ORDER BY p.profile_id) AS rn
    FROM page p
  )
  SELECT b.profile_id, b.phone_e164, b.first_name, b.last_name, b.country_code, b.custom_fields,
         (SELECT count(*) FROM page)::bigint AS remaining
  FROM bounded b
  WHERE b.rn <= LEAST(GREATEST(_limit, 1), 5000)
  ORDER BY b.profile_id;
$function$;

REVOKE ALL ON FUNCTION public.unplanned_recipients_page(uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unplanned_recipients_page(uuid, uuid, jsonb, integer) TO service_role;