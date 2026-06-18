
-- ============ DROP OLD APP TABLES ============
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.phone_verifications CASCADE;
DROP TABLE IF EXISTS public.verification_codes CASCADE;
DROP TABLE IF EXISTS public.phone_numbers CASCADE;
DROP TABLE IF EXISTS public.sender_ids CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;
DROP TABLE IF EXISTS public.contact_groups CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;

-- ============ RENAME profiles -> accounts ============
ALTER TABLE public.profiles RENAME TO accounts;

-- Update handle_new_user trigger to match new schema (no wallets, accounts table)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.accounts (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

-- ============ profiles (contact records) ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  country_code TEXT,
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone_e164),
  CONSTRAINT profiles_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE INDEX profiles_account_id_idx ON public.profiles(account_id);
CREATE INDEX profiles_country_code_idx ON public.profiles(country_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners manage profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ consents ============
CREATE TABLE public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms')),
  status TEXT NOT NULL CHECK (status IN ('subscribed','unsubscribed','pending')),
  source TEXT,
  proof TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, channel)
);
CREATE INDEX consents_profile_id_idx ON public.consents(profile_id);
CREATE INDEX consents_status_idx ON public.consents(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners manage consents"
  ON public.consents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND p.account_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND p.account_id = auth.uid()));

CREATE TRIGGER consents_updated_at BEFORE UPDATE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ suppressions ============
CREATE TABLE public.suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  reason TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone_e164),
  CONSTRAINT suppressions_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE INDEX suppressions_account_id_idx ON public.suppressions(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppressions TO authenticated;
GRANT ALL ON public.suppressions TO service_role;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners manage suppressions"
  ON public.suppressions FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

-- ============ segments ============
CREATE TABLE public.segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX segments_account_id_idx ON public.segments(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT ALL ON public.segments TO service_role;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners manage segments"
  ON public.segments FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

CREATE TRIGGER segments_updated_at BEFORE UPDATE ON public.segments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ campaigns ============
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
  audience JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}'::jsonb,
  message_body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  send_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (send_mode IN ('immediate','scheduled','smart')),
  schedule_at TIMESTAMPTZ,
  smart_skip_hours INTEGER NOT NULL DEFAULT 16,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_account_id_idx ON public.campaigns(account_id);
CREATE INDEX campaigns_status_idx ON public.campaigns(status);
CREATE INDEX campaigns_schedule_at_idx ON public.campaigns(schedule_at) WHERE status = 'scheduled';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners manage campaigns"
  ON public.campaigns FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ messages ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL,
  rendered_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed','undelivered')),
  provider_message_id TEXT UNIQUE,
  error_code TEXT,
  segments_count INTEGER,
  cost NUMERIC(10,4),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_campaign_id_idx ON public.messages(campaign_id);
CREATE INDEX messages_provider_message_id_idx ON public.messages(provider_message_id);
CREATE INDEX messages_status_idx ON public.messages(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners read messages via campaign"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = messages.campaign_id AND c.account_id = auth.uid()));

-- ============ events ============
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sent','delivered','failed','clicked','opted_out')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_message_id_idx ON public.events(message_id);
CREATE INDEX events_type_idx ON public.events(type);

GRANT SELECT ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners read events via campaign"
  ON public.events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.campaigns c ON c.id = m.campaign_id
    WHERE m.id = events.message_id AND c.account_id = auth.uid()
  ));

-- ============ Helper: eligible_profile_ids ============
-- Resolves a campaign audience into the final eligible profile id set.
-- audience shape: {"include": [segment_id, ...], "exclude": [segment_id, ...]}
-- Each segment.query is a JSONB filter. Supported v1 keys:
--   { "all": true }                  -- all subscribed profiles
--   { "country_in": ["US","GB"] }    -- profile.country_code in list
--   { "consent_in": ["subscribed"] } -- override consent filter (defaults to subscribed only)
CREATE OR REPLACE FUNCTION public.profiles_match_query(_account_id UUID, _query JSONB)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND (
      CASE WHEN _query ? 'consent_in'
        THEN COALESCE(c.status,'pending') = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'consent_in')))
        ELSE COALESCE(c.status,'pending') = 'subscribed'
      END
    )
    AND (NOT (_query ? 'country_in')
         OR p.country_code = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'country_in'))))
$$;

CREATE OR REPLACE FUNCTION public.eligible_profile_ids(_account_id UUID, _audience JSONB)
RETURNS TABLE(profile_id UUID, phone_e164 TEXT, first_name TEXT, last_name TEXT, country_code TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  include_ids UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'include','[]'::jsonb))::uuid);
  exclude_ids UUID[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_audience->'exclude','[]'::jsonb))::uuid);
BEGIN
  RETURN QUERY
  WITH included AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(include_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  ),
  excluded AS (
    SELECT DISTINCT m.id AS pid
    FROM unnest(exclude_ids) AS seg_id
    JOIN public.segments s ON s.id = seg_id AND s.account_id = _account_id
    JOIN LATERAL public.profiles_match_query(_account_id, s.query) AS m(id) ON TRUE
  )
  SELECT p.id, p.phone_e164, p.first_name, p.last_name, p.country_code
  FROM included i
  JOIN public.profiles p ON p.id = i.pid
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND COALESCE(c.status,'pending') = 'subscribed'
    AND NOT EXISTS (SELECT 1 FROM public.suppressions sp WHERE sp.account_id = _account_id AND sp.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profiles_match_query(UUID, JSONB) TO authenticated, service_role;
