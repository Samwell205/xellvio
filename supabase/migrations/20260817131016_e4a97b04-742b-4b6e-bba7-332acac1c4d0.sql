-- 1) Import job tracking table
CREATE TABLE public.contact_import_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_import_jobs_account_status_idx
  ON public.contact_import_jobs (account_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_import_jobs TO authenticated;
GRANT ALL ON public.contact_import_jobs TO service_role;

ALTER TABLE public.contact_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members manage own import jobs"
  ON public.contact_import_jobs FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

CREATE TRIGGER contact_import_jobs_touch_updated_at
  BEFORE UPDATE ON public.contact_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Bulk import routine: one call per large batch
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
  IF NOT public.has_account_access(_account_id, 'editor') THEN
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

REVOKE ALL ON FUNCTION public.bulk_import_profiles(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_import_profiles(uuid, uuid, jsonb) TO authenticated, service_role;