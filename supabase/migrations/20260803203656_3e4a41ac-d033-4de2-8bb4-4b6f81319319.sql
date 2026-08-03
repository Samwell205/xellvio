CREATE TABLE IF NOT EXISTS public.unroutable_numbers (
  phone_e164 text PRIMARY KEY,
  error_code text NOT NULL,
  reason text,
  hits integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.unroutable_numbers TO authenticated;
GRANT ALL ON public.unroutable_numbers TO service_role;

ALTER TABLE public.unroutable_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view unroutable numbers" ON public.unroutable_numbers;
CREATE POLICY "Admins can view unroutable numbers"
  ON public.unroutable_numbers FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

CREATE OR REPLACE FUNCTION public.record_unroutable_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.error_code IN ('40001','40012') AND NEW.phone_e164 IS NOT NULL THEN
    INSERT INTO public.unroutable_numbers (phone_e164, error_code, reason)
    VALUES (NEW.phone_e164, NEW.error_code,
      CASE WHEN NEW.error_code = '40001' THEN 'Landline or non-routable number'
           ELSE 'Invalid or unreachable number' END)
    ON CONFLICT (phone_e164) DO UPDATE
      SET hits = public.unroutable_numbers.hits + 1,
          error_code = EXCLUDED.error_code,
          reason = EXCLUDED.reason,
          last_seen_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_record_unroutable ON public.messages;
CREATE TRIGGER messages_record_unroutable
  AFTER INSERT OR UPDATE OF error_code ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.record_unroutable_number();

INSERT INTO public.unroutable_numbers (phone_e164, error_code, reason, hits, first_seen_at, last_seen_at)
SELECT m.phone_e164,
       max(m.error_code),
       CASE WHEN max(m.error_code) = '40001' THEN 'Landline or non-routable number'
            ELSE 'Invalid or unreachable number' END,
       count(*)::int,
       min(m.created_at),
       max(m.created_at)
FROM public.messages m
WHERE m.error_code IN ('40001','40012') AND m.phone_e164 IS NOT NULL
GROUP BY m.phone_e164
ON CONFLICT (phone_e164) DO NOTHING;

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
    AND NOT EXISTS (SELECT 1 FROM public.unroutable_numbers un WHERE un.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$function$;