CREATE OR REPLACE FUNCTION public.unplanned_recipients_page(
  _campaign_id uuid,
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 500
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb, remaining bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH elig AS (
    SELECT e.*
    FROM public.eligible_profile_ids(_account_id, _audience) e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.campaign_id = _campaign_id AND m.profile_id = e.profile_id
    )
  ), total AS (
    SELECT count(*) AS c FROM elig
  ), page AS (
    SELECT * FROM elig ORDER BY profile_id LIMIT GREATEST(_limit, 1)
  )
  SELECT p.profile_id, p.phone_e164, p.first_name, p.last_name, p.country_code, p.custom_fields,
         (SELECT c FROM total) AS remaining
  FROM page p;
$function$;

GRANT EXECUTE ON FUNCTION public.unplanned_recipients_page(uuid, uuid, jsonb, integer) TO service_role;
