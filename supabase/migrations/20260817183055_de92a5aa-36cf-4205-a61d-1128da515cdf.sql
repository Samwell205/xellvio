CREATE OR REPLACE FUNCTION public.unplanned_recipients_page(_campaign_id uuid, _account_id uuid, _audience jsonb, _limit integer DEFAULT 500)
 RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb, remaining bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(_limit, 1), 5000);
  v_after uuid;
  v_list_ids uuid[] := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(_audience->'list_ids', '[]'::jsonb))::uuid
  );
  v_excl_cc text[] := ARRAY(
    SELECT upper(jsonb_array_elements_text(COALESCE(_audience->'excluded_countries', '[]'::jsonb)))
  );
  v_is_list_only boolean :=
    jsonb_array_length(COALESCE(_audience->'list_ids', '[]'::jsonb)) > 0
    AND jsonb_array_length(COALESCE(_audience->'include', '[]'::jsonb)) = 0
    AND jsonb_array_length(COALESCE(_audience->'exclude', '[]'::jsonb)) = 0
    AND jsonb_array_length(COALESCE(_audience->'profile_ids', '[]'::jsonb)) = 0;
BEGIN
  -- Keyset cursor: highest profile_id already planned. max(uuid) does not exist
  -- on this Postgres version, so take it with an ordered index read instead.
  SELECT m.profile_id INTO v_after
  FROM public.messages m
  WHERE m.campaign_id = _campaign_id
  ORDER BY m.profile_id DESC
  LIMIT 1;

  IF v_is_list_only THEN
    RETURN QUERY
    WITH page AS MATERIALIZED (
      SELECT DISTINCT ON (p.id)
        p.id,
        p.phone_e164,
        p.first_name,
        p.last_name,
        p.country_code,
        COALESCE(p.custom_fields, '{}'::jsonb) AS custom_fields
      FROM public.profile_list_members plm
      JOIN public.contact_lists cl
        ON cl.id = plm.list_id
       AND cl.account_id = _account_id
      JOIN public.profiles p
        ON p.id = plm.profile_id
       AND p.account_id = _account_id
      LEFT JOIN public.consents c
        ON c.profile_id = p.id
       AND c.channel = 'sms'
      WHERE plm.list_id = ANY(v_list_ids)
        AND (v_after IS NULL OR plm.profile_id > v_after)
        AND COALESCE(c.status, 'pending') = 'subscribed'
        AND (cardinality(v_excl_cc) = 0 OR upper(COALESCE(p.country_code, '??')) <> ALL(v_excl_cc))
        AND NOT EXISTS (
          SELECT 1 FROM public.suppressions s
          WHERE s.account_id = _account_id AND s.phone_e164 = p.phone_e164
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.unroutable_numbers u
          WHERE u.phone_e164 = p.phone_e164
        )
      ORDER BY p.id
      LIMIT v_limit + 1
    ), numbered AS (
      SELECT page.*, row_number() OVER (ORDER BY page.id) AS rn FROM page
    )
    SELECT n.id, n.phone_e164, n.first_name, n.last_name, n.country_code, n.custom_fields,
           (SELECT count(*) FROM page)::bigint
    FROM numbered n
    WHERE n.rn <= v_limit
    ORDER BY n.id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH page AS MATERIALIZED (
    SELECT e.profile_id, e.phone_e164, e.first_name, e.last_name, e.country_code, e.custom_fields
    FROM public.eligible_profile_ids(_account_id, _audience) e
    WHERE (v_after IS NULL OR e.profile_id > v_after)
      AND NOT EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.campaign_id = _campaign_id AND m.profile_id = e.profile_id
      )
    ORDER BY e.profile_id
    LIMIT v_limit + 1
  ), numbered AS (
    SELECT page.*, row_number() OVER (ORDER BY page.profile_id) AS rn FROM page
  )
  SELECT n.profile_id, n.phone_e164, n.first_name, n.last_name, n.country_code, n.custom_fields,
         (SELECT count(*) FROM page)::bigint
  FROM numbered n
  WHERE n.rn <= v_limit
  ORDER BY n.profile_id;
END;
$function$;