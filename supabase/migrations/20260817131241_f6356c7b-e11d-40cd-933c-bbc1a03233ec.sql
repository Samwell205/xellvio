CREATE OR REPLACE FUNCTION public.bulk_import_profiles(
  _account_id uuid,
  _list_id uuid,
  _rows jsonb
)
RETURNS TABLE(upserted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
BEGIN
  -- Signed-in callers must have workspace access. Trusted server-side callers
  -- (service_role, no JWT subject) authorize before calling.
  IF auth.uid() IS NOT NULL AND NOT public.has_account_access(_account_id, 'editor') THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;

  IF _list_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_lists cl WHERE cl.id = _list_id AND cl.account_id = _account_id
  ) THEN
    RAISE EXCEPTION 'List does not belong to this workspace';
  END IF;

  WITH src AS (
    SELECT DISTINCT ON (r.phone_e164)
      r.phone_e164,
      NULLIF(r.first_name, '') AS first_name,
      NULLIF(r.last_name, '') AS last_name,
      NULLIF(r.country_code, '') AS country_code,
      COALESCE(r.custom_fields, '{}'::jsonb) AS custom_fields
    FROM jsonb_to_recordset(_rows) AS r(
      phone_e164 text,
      first_name text,
      last_name text,
      country_code text,
      custom_fields jsonb
    )
    WHERE r.phone_e164 IS NOT NULL AND r.phone_e164 <> ''
  ), ins AS (
    INSERT INTO public.profiles (account_id, phone_e164, first_name, last_name, country_code, custom_fields)
    SELECT _account_id, s.phone_e164, s.first_name, s.last_name, s.country_code, s.custom_fields
    FROM src s
    ON CONFLICT (account_id, phone_e164) DO UPDATE SET
      first_name    = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name     = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      country_code  = COALESCE(EXCLUDED.country_code, public.profiles.country_code),
      custom_fields = public.profiles.custom_fields || EXCLUDED.custom_fields,
      updated_at    = now()
    RETURNING id
  )
  SELECT array_agg(id) INTO _ids FROM ins;

  _ids := COALESCE(_ids, ARRAY[]::uuid[]);

  INSERT INTO public.consents (profile_id, channel, status, source, consented_at)
  SELECT pid, 'sms', 'subscribed', 'csv_import', now()
  FROM unnest(_ids) AS pid
  ON CONFLICT (profile_id, channel) DO NOTHING;

  IF _list_id IS NOT NULL THEN
    INSERT INTO public.profile_list_members (list_id, profile_id, account_id)
    SELECT _list_id, pid, _account_id
    FROM unnest(_ids) AS pid
    ON CONFLICT (list_id, profile_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT array_length(_ids, 1)::integer;
END;
$$;