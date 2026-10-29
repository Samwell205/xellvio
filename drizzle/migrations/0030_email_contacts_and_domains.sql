-- Contacts may have a phone, an email, or both (at least one required).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_has_contact_detail CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_format CHECK (email IS NULL OR (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_email_key ON public.profiles (account_id, email);

-- Email consent is tracked separately from SMS consent.
ALTER TABLE public.consents DROP CONSTRAINT IF EXISTS consents_channel_check;
ALTER TABLE public.consents ADD CONSTRAINT consents_channel_check CHECK (channel IN ('sms','email'));

CREATE OR REPLACE FUNCTION public.bulk_import_profiles(_account_id uuid, _list_id uuid, _rows jsonb)
 RETURNS TABLE(upserted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _phone_ids uuid[];
  _email_ids uuid[];
  _ids uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_account_access(_account_id, 'editor') THEN
    RAISE EXCEPTION 'Not authorized for this workspace';
  END IF;
  IF _list_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_lists cl WHERE cl.id = _list_id AND cl.account_id = _account_id
  ) THEN
    RAISE EXCEPTION 'List does not belong to this workspace';
  END IF;

  CREATE TEMP TABLE _src ON COMMIT DROP AS
  SELECT
    NULLIF(trim(r.phone_e164), '') AS phone_e164,
    NULLIF(lower(trim(r.email)), '') AS email,
    NULLIF(r.first_name, '') AS first_name,
    NULLIF(r.last_name, '') AS last_name,
    NULLIF(r.country_code, '') AS country_code,
    COALESCE(r.custom_fields, '{}'::jsonb) AS custom_fields
  FROM jsonb_to_recordset(_rows) AS r(phone_e164 text, email text, first_name text, last_name text, country_code text, custom_fields jsonb);

  UPDATE _src SET email = NULL WHERE email IS NOT NULL AND email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

  -- Rows with a phone: match on phone. Only attach an email not already used by another contact.
  WITH src AS (
    SELECT DISTINCT ON (s.phone_e164) s.* FROM _src s WHERE s.phone_e164 IS NOT NULL
  ), ins AS (
    INSERT INTO public.profiles (account_id, phone_e164, email, first_name, last_name, country_code, custom_fields)
    SELECT _account_id, s.phone_e164,
      CASE WHEN s.email IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.account_id = _account_id AND p.email = s.email
          AND p.phone_e164 IS DISTINCT FROM s.phone_e164
      ) AND (SELECT count(*) FROM src s2 WHERE s2.email = s.email) = 1 THEN s.email END,
      s.first_name, s.last_name, s.country_code, s.custom_fields
    FROM src s
    ON CONFLICT (account_id, phone_e164) DO UPDATE SET
      email         = COALESCE(public.profiles.email, EXCLUDED.email),
      first_name    = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name     = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      country_code  = COALESCE(EXCLUDED.country_code, public.profiles.country_code),
      custom_fields = public.profiles.custom_fields || EXCLUDED.custom_fields,
      updated_at    = now()
    RETURNING id
  )
  SELECT array_agg(id) INTO _phone_ids FROM ins;

  -- Email-only rows: match on email.
  WITH src AS (
    SELECT DISTINCT ON (s.email) s.* FROM _src s WHERE s.phone_e164 IS NULL AND s.email IS NOT NULL
  ), ins AS (
    INSERT INTO public.profiles (account_id, email, first_name, last_name, country_code, custom_fields)
    SELECT _account_id, s.email, s.first_name, s.last_name, s.country_code, s.custom_fields FROM src s
    ON CONFLICT (account_id, email) DO UPDATE SET
      first_name    = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name     = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      country_code  = COALESCE(EXCLUDED.country_code, public.profiles.country_code),
      custom_fields = public.profiles.custom_fields || EXCLUDED.custom_fields,
      updated_at    = now()
    RETURNING id
  )
  SELECT array_agg(id) INTO _email_ids FROM ins;

  _ids := COALESCE(_phone_ids, ARRAY[]::uuid[]) || COALESCE(_email_ids, ARRAY[]::uuid[]);

  INSERT INTO public.consents (profile_id, channel, status, source, consented_at)
  SELECT p.id, 'sms', 'subscribed', 'csv_import', now()
  FROM public.profiles p WHERE p.id = ANY(_ids) AND p.phone_e164 IS NOT NULL
  ON CONFLICT (profile_id, channel) DO NOTHING;

  INSERT INTO public.consents (profile_id, channel, status, source, consented_at)
  SELECT p.id, 'email', 'subscribed', 'csv_import', now()
  FROM public.profiles p WHERE p.id = ANY(_ids) AND p.email IS NOT NULL
  ON CONFLICT (profile_id, channel) DO NOTHING;

  IF _list_id IS NOT NULL THEN
    INSERT INTO public.profile_list_members (list_id, profile_id, account_id)
    SELECT _list_id, pid, _account_id FROM unnest(_ids) AS pid
    ON CONFLICT (list_id, profile_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT COALESCE(array_length(_ids, 1), 0)::integer;
END;
$function$;

-- Sending domains each business connects for email.
CREATE TABLE public.email_sending_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  domain text NOT NULL,
  provider_domain_id bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failed')),
  dns_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, domain)
);
GRANT SELECT ON public.email_sending_domains TO authenticated;
GRANT ALL ON public.email_sending_domains TO service_role;
ALTER TABLE public.email_sending_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their sending domains" ON public.email_sending_domains
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
