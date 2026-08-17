CREATE INDEX IF NOT EXISTS country_rates_dial_prefix_idx ON public.country_rates (dial_prefix);

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
    WHERE cr.dial_prefix = ANY (ARRAY[
      substr(e.phone_e164, 1, 2),
      substr(e.phone_e164, 1, 3),
      substr(e.phone_e164, 1, 4),
      substr(e.phone_e164, 1, 5)
    ])
    ORDER BY length(cr.dial_prefix) DESC
    LIMIT 1
  ) pref ON e.country_code IS NULL OR e.country_code = ''
  GROUP BY 1
  ORDER BY 2 DESC;
$function$;