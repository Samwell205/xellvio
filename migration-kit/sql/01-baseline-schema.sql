-- Baseline schema for Xellvio — generated from 175 Lovable Cloud migrations.
-- Apply AFTER 00-prelude.sql on a fresh Supabase project.


-- ============================================================
-- migration: 20260618150154_75f5fbdb-6622-4873-9154-e83b119d9803.sql
-- ============================================================

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  company TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Wallets
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_credits NUMERIC(14,4) NOT NULL DEFAULT 50,
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet self read" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- topup | charge | refund
  amount NUMERIC(14,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx self read" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Contact groups
CREATE TABLE public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO authenticated;
GRANT ALL ON public.contact_groups TO service_role;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups self all" ON public.contact_groups FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.contact_groups(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT NOT NULL,
  country TEXT,
  tags TEXT[] DEFAULT '{}',
  opted_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contacts_user_idx ON public.contacts(user_id);
CREATE INDEX contacts_group_idx ON public.contacts(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts self all" ON public.contacts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  sender_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|running|completed|failed
  scheduled_at TIMESTAMPTZ,
  group_id UUID REFERENCES public.contact_groups(id) ON DELETE SET NULL,
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns self all" ON public.campaigns FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  to_phone TEXT NOT NULL,
  country TEXT,
  body TEXT NOT NULL,
  sender_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|sent|delivered|failed
  provider TEXT,
  provider_sid TEXT,
  error TEXT,
  cost NUMERIC(10,4) NOT NULL DEFAULT 0,
  segments INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX messages_user_idx ON public.messages(user_id, created_at DESC);
CREATE INDEX messages_campaign_idx ON public.messages(campaign_id);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages self read" ON public.messages FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- API keys
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api keys self all" ON public.api_keys FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif self" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif self update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER campaigns_touch BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile, wallet, role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));
  INSERT INTO public.wallets (user_id) VALUES (NEW.id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- migration: 20260618150211_223c5b2f-9485-45ad-af1c-eee1462e1c58.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;


-- ============================================================
-- migration: 20260618150227_06603c66-31fb-488a-a969-bf3437bfa4e5.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- ============================================================
-- migration: 20260618154016_4778fd19-7397-4192-afa7-99f433048322.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- migration: 20260618154032_3c6f06cc-2b3a-4166-a51f-011867cb7cb9.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- migration: 20260618154702_b82585d0-f979-4ae9-aa22-40b285fd6ffd.sql
-- ============================================================
CREATE POLICY "messages self insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "messages self update" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- migration: 20260618160625_8261424e-b002-4c39-b412-f64618742b73.sql
-- ============================================================

-- Phone numbers (toll-free purchased, plus verified personal numbers used as caller ID / reply-to)
CREATE TYPE public.phone_number_type AS ENUM ('toll_free', 'personal');
CREATE TYPE public.phone_number_status AS ENUM ('active', 'pending', 'released');

CREATE TABLE public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  e164 text NOT NULL,
  type public.phone_number_type NOT NULL,
  country text NOT NULL DEFAULT 'US',
  status public.phone_number_status NOT NULL DEFAULT 'active',
  twilio_sid text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, e164)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_numbers TO authenticated;
GRANT ALL ON public.phone_numbers TO service_role;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own phone_numbers" ON public.phone_numbers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_phone_numbers_touch BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sender IDs (alphanumeric) requiring admin approval
CREATE TYPE public.sender_id_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.sender_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  countries text[] NOT NULL DEFAULT '{}',
  use_case text,
  status public.sender_id_status NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sender_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_ids TO authenticated;
GRANT ALL ON public.sender_ids TO service_role;
ALTER TABLE public.sender_ids ENABLE ROW LEVEL SECURITY;

-- Users manage their own
CREATE POLICY "own sender_ids select" ON public.sender_ids FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own sender_ids insert" ON public.sender_ids FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sender_ids delete" ON public.sender_ids FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- Users can only update their own pending requests (e.g. edit before review). Admins can update any.
CREATE POLICY "sender_ids update" ON public.sender_ids FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (auth.uid() = user_id AND status = 'pending'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR (auth.uid() = user_id AND status = 'pending'));

CREATE TRIGGER trg_sender_ids_touch BEFORE UPDATE ON public.sender_ids
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Phone OTP verifications (for adding a personal number)
CREATE TABLE public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_verifications TO authenticated;
GRANT ALL ON public.phone_verifications TO service_role;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own phone_verifications" ON public.phone_verifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_phone_verifications_user_phone ON public.phone_verifications(user_id, e164);
CREATE INDEX idx_phone_numbers_user ON public.phone_numbers(user_id);
CREATE INDEX idx_sender_ids_status ON public.sender_ids(status);


-- ============================================================
-- migration: 20260618163233_22fe5d66-ce53-4c3d-88bb-3740937c113a.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));

  INSERT INTO public.wallets (user_id) VALUES (NEW.id);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: if no admin exists, promote earliest user
DO $$
DECLARE
  first_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF first_user IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (first_user, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
      DELETE FROM public.user_roles WHERE user_id = first_user AND role = 'user';
    END IF;
  END IF;
END $$;


-- ============================================================
-- migration: 20260618163338_47f38f3e-dafc-40ac-a7b6-8d0a2b273512.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_codes_user_e164_idx
  ON public.verification_codes (user_id, e164, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.verification_codes TO authenticated;
GRANT ALL ON public.verification_codes TO service_role;

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own verification codes"
  ON public.verification_codes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Backfill from legacy phone_verifications if present
INSERT INTO public.verification_codes (id, user_id, e164, code_hash, attempts, consumed_at, expires_at, created_at)
SELECT id, user_id, e164, code_hash, attempts, consumed_at, expires_at, created_at
FROM public.phone_verifications
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- migration: 20260618164008_2d8a7c2c-7673-4fc3-b69b-e55dcfbcf94b.sql
-- ============================================================

-- Revoke client write privileges; service_role retains ALL via existing grants
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.notifications FROM authenticated, anon;

-- Explicit deny policies for authenticated role (defense in depth)
CREATE POLICY "tx no client insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "tx no client update" ON public.transactions FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "tx no client delete" ON public.transactions FOR DELETE TO authenticated USING (false);

CREATE POLICY "wallet no client insert" ON public.wallets FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "wallet no client update" ON public.wallets FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "wallet no client delete" ON public.wallets FOR DELETE TO authenticated USING (false);

CREATE POLICY "roles no client insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "roles no client update" ON public.user_roles FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "roles no client delete" ON public.user_roles FOR DELETE TO authenticated USING (false);

CREATE POLICY "notif no client insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "notif no client delete" ON public.notifications FOR DELETE TO authenticated USING (false);


-- ============================================================
-- migration: 20260618170550_5d8a9c09-a281-402b-947a-25f9c6ab8592.sql
-- ============================================================

-- Fix 1: Remove SELECT access to verification code hashes from client policies
DROP POLICY IF EXISTS "own phone_verifications" ON public.phone_verifications;
CREATE POLICY "phone_verifications_insert_own" ON public.phone_verifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "phone_verifications_update_own" ON public.phone_verifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "phone_verifications_delete_own" ON public.phone_verifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own verification codes" ON public.verification_codes;
CREATE POLICY "verification_codes_insert_own" ON public.verification_codes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "verification_codes_update_own" ON public.verification_codes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "verification_codes_delete_own" ON public.verification_codes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix 2: Replace has_role with a single-arg variant that resolves the user from auth.uid()
-- Drop policies that depend on the 2-arg form first
DROP POLICY IF EXISTS "own sender_ids select" ON public.sender_ids;
DROP POLICY IF EXISTS "sender_ids update" ON public.sender_ids;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  )
$$;

-- Recreate sender_ids policies using the new function signature
CREATE POLICY "own sender_ids select" ON public.sender_ids
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role('admin'::public.app_role));

CREATE POLICY "sender_ids update" ON public.sender_ids
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'::public.app_role) OR (auth.uid() = user_id AND status = 'pending'::sender_id_status))
  WITH CHECK (public.has_role('admin'::public.app_role) OR (auth.uid() = user_id AND status = 'pending'::sender_id_status));

-- Also update handle_new_user to use the new signature (it referenced direct table, keep as-is)


-- ============================================================
-- migration: 20260618172642_20c827c3-32da-4e04-851a-3092cb286aa7.sql
-- ============================================================

-- Extend contacts to support email/external_id + first/last name (Klaviyo-style identifiers)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS external_id text;

-- Allow phone to be null when only email/external_id is provided
ALTER TABLE public.contacts ALTER COLUMN phone DROP NOT NULL;

-- Require at least one identifier per row
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_identifier_required;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_identifier_required
  CHECK (phone IS NOT NULL OR email IS NOT NULL OR external_id IS NOT NULL);

-- Dedup indexes (per user) for upsert on import
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_phone_unique
  ON public.contacts (user_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_unique
  ON public.contacts (user_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_external_unique
  ON public.contacts (user_id, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts (user_id, lower(email));


-- ============================================================
-- migration: 20260618174629_957a7a09-c524-4d64-8eb1-1d33972d7de2.sql
-- ============================================================

-- Prevent non-admins from escalating sender_id status
DROP POLICY IF EXISTS "sender_ids update" ON public.sender_ids;

CREATE POLICY "sender_ids update" ON public.sender_ids
FOR UPDATE
USING (
  public.has_role('admin'::app_role)
  OR (auth.uid() = user_id AND status = 'pending'::sender_id_status)
)
WITH CHECK (
  public.has_role('admin'::app_role)
  OR (auth.uid() = user_id AND status = 'pending'::sender_id_status)
);

-- Lock down SECURITY DEFINER trigger/helper functions so they can't be called
-- directly via the Data API by anon/authenticated. Triggers run as table owner
-- regardless of EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- has_role() is referenced from RLS policies — authenticated must keep EXECUTE,
-- but anon does not need it.
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;


-- ============================================================
-- migration: 20260618185421_abafc649-699b-44ca-85eb-3614b135d262.sql
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_phone_upsert_key
  ON public.contacts (user_id, phone);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_upsert_key
  ON public.contacts (user_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_external_id_upsert_key
  ON public.contacts (user_id, external_id);

-- ============================================================
-- migration: 20260618195301_aad3caff-a617-4a4e-9c75-cc4f5c2146d5.sql
-- ============================================================

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


-- ============================================================
-- migration: 20260618195333_5dc9ef74-107f-4c46-b83a-2849b266b406.sql
-- ============================================================

-- Switch to SECURITY INVOKER (RLS will scope reads to the caller automatically)
CREATE OR REPLACE FUNCTION public.profiles_match_query(_account_id UUID, _query JSONB)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
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
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
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

REVOKE ALL ON FUNCTION public.profiles_match_query(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eligible_profile_ids(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_match_query(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(UUID, JSONB) TO authenticated, service_role;


-- ============================================================
-- migration: 20260618195408_34a8e651-a203-446a-90a8-5c3439354715.sql
-- ============================================================

-- touch_updated_at is invoked by triggers; only the table owner needs to run it.
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260618201153_bbd5b221-57a2-4fd0-9207-2856c558068d.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION public.profiles_match_query(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO authenticated, service_role;

-- ============================================================
-- migration: 20260618201700_9e4511a7-be75-41ca-943d-f3eec7358425.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove prior version if re-running
SELECT cron.unschedule('dispatch-campaigns')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-campaigns');

SELECT cron.schedule(
  'dispatch-campaigns',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://samwell-reach-global.lovable.app/api/public/dispatch-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- migration: 20260618202746_be766042-880c-453f-9f73-fd714028f2c9.sql
-- ============================================================

-- country_rates
CREATE TABLE public.country_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  dial_prefix TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_price NUMERIC(10,6) NOT NULL DEFAULT 0,
  sell_price NUMERIC(10,6) NOT NULL DEFAULT 0,
  mms_multiplier NUMERIC(6,2) NOT NULL DEFAULT 3.0,
  sender_supports_inbound BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.country_rates TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.country_rates TO authenticated;
GRANT ALL ON public.country_rates TO service_role;

ALTER TABLE public.country_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "country_rates readable to all" ON public.country_rates
  FOR SELECT USING (true);
CREATE POLICY "country_rates admin write" ON public.country_rates
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER country_rates_updated_at BEFORE UPDATE ON public.country_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.country_rates (country_code, country_name, dial_prefix, sell_price, cost_price, sender_supports_inbound) VALUES
('US','United States','+1',0.015,0.009,true),
('CA','Canada','+1',0.015,0.009,true),
('GB','United Kingdom','+44',0.040,0.024,true),
('NG','Nigeria','+234',0.045,0.027,false),
('DE','Germany','+49',0.085,0.051,false),
('FR','France','+33',0.075,0.045,false),
('NL','Netherlands','+31',0.080,0.048,false),
('AU','Australia','+61',0.055,0.033,true),
('IN','India','+91',0.010,0.006,false),
('AE','United Arab Emirates','+971',0.090,0.054,false),
('ZA','South Africa','+27',0.035,0.021,false),
('BR','Brazil','+55',0.050,0.030,false),
('ES','Spain','+34',0.070,0.042,false),
('IT','Italy','+39',0.065,0.039,false),
('SE','Sweden','+46',0.075,0.045,false);

-- accounts: balance + auto-recharge
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_recharge_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_recharge_threshold NUMERIC(12,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_recharge_amount NUMERIC(12,2) NOT NULL DEFAULT 25;

-- credit_transactions ledger
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup','debit','rollover','refund')),
  amount NUMERIC(12,4) NOT NULL,
  balance_after NUMERIC(12,4) NOT NULL,
  campaign_id UUID NULL REFERENCES public.campaigns(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_tx select own" ON public.credit_transactions
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "credit_tx insert own" ON public.credit_transactions
  FOR INSERT TO authenticated WITH CHECK (account_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_credit_tx_account_created
  ON public.credit_transactions(account_id, created_at DESC);

-- messages.country_code
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- atomic debit
CREATE OR REPLACE FUNCTION public.debit_account(
  _account_id UUID, _amount NUMERIC, _campaign_id UUID, _description TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.accounts
    SET credit_balance = credit_balance - _amount
    WHERE id = _account_id
    RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF new_balance < 0 THEN
    UPDATE public.accounts SET credit_balance = credit_balance + _amount WHERE id = _account_id;
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (_account_id, 'debit', _amount, new_balance, _campaign_id, _description);
  RETURN new_balance;
END;
$$;

-- atomic topup
CREATE OR REPLACE FUNCTION public.topup_account(
  _account_id UUID, _amount NUMERIC, _description TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.accounts SET credit_balance = credit_balance + _amount
    WHERE id = _account_id
    RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, description)
    VALUES (_account_id, 'topup', _amount, new_balance, _description);
  RETURN new_balance;
END;
$$;


-- ============================================================
-- migration: 20260618202802_f0fbdfd1-69b9-4240-bada-1342bee152cd.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.debit_account(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.topup_account(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_account(UUID, NUMERIC, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.topup_account(UUID, NUMERIC, TEXT) TO service_role;


-- ============================================================
-- migration: 20260618204822_87a6f5f8-86e8-4ddf-950f-9191716111bc.sql
-- ============================================================
-- Enable pgcrypto for token encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extend accounts with multi-tenant business profile + Twilio subaccount fields
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS legal_business_name TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS business_reg_number TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT,
  ADD COLUMN IF NOT EXISTS terms_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS twilio_subaccount_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_subaccount_auth_token_enc BYTEA,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'signup'
    CHECK (onboarding_status IN ('signup','profile_complete','sender_pending','active','suspended')),
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Admin override policies (read/update any account)
DROP POLICY IF EXISTS "admins can read all accounts" ON public.accounts;
CREATE POLICY "admins can read all accounts" ON public.accounts
  FOR SELECT TO authenticated USING (public.has_role('admin'));

DROP POLICY IF EXISTS "admins can update all accounts" ON public.accounts;
CREATE POLICY "admins can update all accounts" ON public.accounts
  FOR UPDATE TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Encryption helpers for Twilio auth token. Uses a server-side GUC `app.encryption_key`
-- set per-session by privileged server code. Returns NULL if key absent.
CREATE OR REPLACE FUNCTION public.encrypt_twilio_token(_plain TEXT)
RETURNS BYTEA LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k TEXT;
BEGIN
  k := current_setting('app.encryption_key', true);
  IF k IS NULL OR k = '' THEN RAISE EXCEPTION 'encryption key not configured'; END IF;
  IF _plain IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(_plain, k);
END $$;

CREATE OR REPLACE FUNCTION public.decrypt_twilio_token(_cipher BYTEA)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k TEXT;
BEGIN
  k := current_setting('app.encryption_key', true);
  IF k IS NULL OR k = '' THEN RAISE EXCEPTION 'encryption key not configured'; END IF;
  IF _cipher IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(_cipher, k);
END $$;

-- Restrict execute to service_role only (never callable by user-facing roles)
REVOKE ALL ON FUNCTION public.encrypt_twilio_token(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_twilio_token(BYTEA) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_twilio_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_twilio_token(BYTEA) TO service_role;

-- Update handle_new_user to set contact_email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE assigned_role public.app_role;
BEGIN
  INSERT INTO public.accounts (id, email, contact_email, full_name)
  VALUES (NEW.id, NEW.email, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END $$;

-- ============================================================
-- migration: 20260618210022_805874c8-127b-4168-aad9-21ce5f7748f2.sql
-- ============================================================
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS subaccount_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS subaccount_phone_sid TEXT,
  ADD COLUMN IF NOT EXISTS subaccount_messaging_service_sid TEXT;

-- ============================================================
-- migration: 20260618210615_3f59ffa7-bc92-4a78-b4e2-f6ccf249d911.sql
-- ============================================================
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS monthly_volume_estimate INTEGER,
  ADD COLUMN IF NOT EXISTS use_case_description TEXT,
  ADD COLUMN IF NOT EXISTS sample_message TEXT,
  ADD COLUMN IF NOT EXISTS opt_in_description TEXT,
  ADD COLUMN IF NOT EXISTS opt_in_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_target_countries TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS public.sender_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('toll_free','local','sender_id')),
  phone_number TEXT,
  phone_sid TEXT,
  messaging_service_sid TEXT,
  verification_sid TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','submitted','in_review','verified','rejected')),
  rejection_reason TEXT,
  friendly_rejection_reason TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_assets TO authenticated;
GRANT ALL ON public.sender_assets TO service_role;

ALTER TABLE public.sender_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant reads own sender assets" ON public.sender_assets
  FOR SELECT TO authenticated USING (account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "tenant writes own sender assets" ON public.sender_assets
  FOR INSERT TO authenticated WITH CHECK (account_id = auth.uid());
CREATE POLICY "tenant updates own sender assets" ON public.sender_assets
  FOR UPDATE TO authenticated USING (account_id = auth.uid() OR public.has_role('admin'));

CREATE INDEX IF NOT EXISTS sender_assets_account_idx ON public.sender_assets(account_id);
CREATE INDEX IF NOT EXISTS sender_assets_pending_idx ON public.sender_assets(verification_status)
  WHERE verification_status IN ('submitted','in_review');

CREATE TRIGGER sender_assets_touch BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- migration: 20260618210632_91c5ac01-059a-40a3-a1c2-34a77803e662.sql
-- ============================================================
CREATE POLICY "tenant uploads own opt-in screenshot" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'opt-in-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tenant reads own opt-in screenshot" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'opt-in-assets' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role('admin')));
CREATE POLICY "tenant updates own opt-in screenshot" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'opt-in-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tenant deletes own opt-in screenshot" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'opt-in-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- migration: 20260618212015_60ba7eb0-4789-46b4-8372-7f546f45fedd.sql
-- ============================================================

-- ============ credit_packs ============
CREATE TABLE public.credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  price NUMERIC(12,2) NOT NULL CHECK (price > 0),
  credits NUMERIC(12,2) NOT NULL CHECK (credits > 0),
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packs TO anon, authenticated;
GRANT ALL ON public.credit_packs TO service_role;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read active packs" ON public.credit_packs FOR SELECT USING (is_active OR public.has_role('admin'));
CREATE POLICY "admins manage packs" ON public.credit_packs FOR ALL USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_credit_packs_updated BEFORE UPDATE ON public.credit_packs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ payments ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES public.credit_packs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('paystack','payoneer')),
  provider_reference TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  credits NUMERIC(12,2) NOT NULL CHECK (credits > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  proof_url TEXT,
  customer_note TEXT,
  admin_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_account ON public.payments(account_id, created_at DESC);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE UNIQUE INDEX uq_payments_provider_ref ON public.payments(provider, provider_reference) WHERE provider_reference IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant reads own payments" ON public.payments FOR SELECT USING (account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "tenant creates own payments" ON public.payments FOR INSERT WITH CHECK (account_id = auth.uid());
CREATE POLICY "admins update payments" ON public.payments FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ billing_settings (single row) ============
CREATE TABLE public.billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  payoneer_payee_email TEXT,
  payoneer_payee_name TEXT,
  payoneer_instructions TEXT,
  default_currency TEXT NOT NULL DEFAULT 'NGN' CHECK (default_currency IN ('NGN','USD')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read settings" ON public.billing_settings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "admins manage settings" ON public.billing_settings FOR ALL USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_billing_settings_updated BEFORE UPDATE ON public.billing_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.billing_settings (id, default_currency) VALUES (TRUE, 'NGN') ON CONFLICT DO NOTHING;

-- Seed a few default packs (admin can edit)
INSERT INTO public.credit_packs (name, description, currency, price, credits, display_order, is_popular) VALUES
  ('Starter NGN',    'Great for testing',          'NGN',   5000,   10,  10, FALSE),
  ('Growth NGN',     'Most popular for SMBs',      'NGN',  25000,   55,  20, TRUE),
  ('Scale NGN',      'For high-volume senders',    'NGN', 100000,  240,  30, FALSE),
  ('Starter USD',    'Great for testing',          'USD',     10,   10,  40, FALSE),
  ('Growth USD',     'Most popular for SMBs',      'USD',     50,   55,  50, TRUE),
  ('Scale USD',      'For high-volume senders',    'USD',    200,  240,  60, FALSE);


-- ============================================================
-- migration: 20260618212322_b0a86e25-fc07-41aa-8ca2-8ba400cfb9d2.sql
-- ============================================================

CREATE POLICY "tenants upload own payment proofs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tenants read own payment proofs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role('admin')));


-- ============================================================
-- migration: 20260618214138_05865647-c1d4-4a13-b35b-a82ed814891f.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.eligible_profile_ids(_account_id uuid, _audience jsonb)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
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
  SELECT p.id, p.phone_e164, p.first_name, p.last_name, p.country_code
  FROM included i
  JOIN public.profiles p ON p.id = i.pid
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND COALESCE(c.status,'pending') = 'subscribed'
    AND NOT EXISTS (SELECT 1 FROM public.suppressions sp WHERE sp.account_id = _account_id AND sp.phone_e164 = p.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$function$;

-- ============================================================
-- migration: 20260618214516_dc69fdc4-7f2f-4aa1-b3a8-9e2539392f28.sql
-- ============================================================

DROP POLICY IF EXISTS "credit_tx insert own" ON public.credit_transactions;

DROP POLICY IF EXISTS "tenant updates own sender assets" ON public.sender_assets;
CREATE POLICY "tenant updates own sender assets"
  ON public.sender_assets FOR UPDATE
  USING ((account_id = auth.uid()) OR public.has_role('admin'))
  WITH CHECK (
    public.has_role('admin')
    OR (account_id = auth.uid() AND verification_status = 'pending')
  );

DROP POLICY IF EXISTS "country_rates readable to all" ON public.country_rates;
CREATE POLICY "country_rates readable to authenticated"
  ON public.country_rates FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.country_rates_public
WITH (security_invoker = true) AS
SELECT id, country_code, country_name, dial_prefix, sell_price,
       mms_multiplier, active, sender_supports_inbound
FROM public.country_rates
WHERE active = true;

CREATE POLICY "country_rates anon read active"
  ON public.country_rates FOR SELECT TO anon USING (active = true);

REVOKE SELECT (cost_price) ON public.country_rates FROM anon;
GRANT SELECT (id, country_code, country_name, dial_prefix, sell_price,
              mms_multiplier, active, sender_supports_inbound) ON public.country_rates TO anon;
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

CREATE POLICY "tenants delete own payment proofs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'payment-proofs'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.has_role('admin'))
  );

CREATE POLICY "tenants update own payment proofs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'payment-proofs'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.has_role('admin'))
  )
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


-- ============================================================
-- migration: 20260618214532_54d85e32-fdb7-4256-bfd3-a8ef01c290d5.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.topup_account(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_account(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_twilio_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_twilio_token(bytea) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260618214545_6ab330c1-8d79-4580-aa34-3a8ab5a7d766.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_match_query(uuid, jsonb) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260618214557_5f39d6b3-f0e3-4535-9c88-ea1d6666931a.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260618215113_eaa12e32-e847-4bef-99d6-11da85b62880.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids(_audience jsonb)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.eligible_profile_ids(auth.uid(), _audience);
$$;

REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) TO authenticated;


-- ============================================================
-- migration: 20260618215649_a57cda4e-1d46-460a-9c4f-3c795faf8466.sql
-- ============================================================

CREATE TABLE public.contact_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage contact lists"
  ON public.contact_lists FOR ALL
  USING (account_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (account_id = auth.uid() OR public.has_role('admin'));

CREATE TRIGGER touch_contact_lists_updated_at
  BEFORE UPDATE ON public.contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Join table: profiles <-> lists
CREATE TABLE public.profile_list_members (
  list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, profile_id)
);

CREATE INDEX profile_list_members_profile_idx ON public.profile_list_members(profile_id);
CREATE INDEX profile_list_members_account_idx ON public.profile_list_members(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_list_members TO authenticated;
GRANT ALL ON public.profile_list_members TO service_role;

ALTER TABLE public.profile_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage list members"
  ON public.profile_list_members FOR ALL
  USING (account_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (account_id = auth.uid() OR public.has_role('admin'));

-- Extend profiles_match_query to support list_in
CREATE OR REPLACE FUNCTION public.profiles_match_query(_account_id uuid, _query jsonb)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public
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
    AND (NOT (_query ? 'list_in')
         OR EXISTS (
           SELECT 1 FROM public.profile_list_members m
           WHERE m.profile_id = p.id
             AND m.list_id = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'list_in')::uuid))
         ))
$$;


-- ============================================================
-- migration: 20260618220512_0e4a0be4-916b-4bf0-a80a-a6d5d981f892.sql
-- ============================================================

-- Refresh credit packs with a wider set of plans and realistic NGN/USD conversion (~₦1,550 / $1).
-- Deactivate old defaults first, then upsert a comprehensive ladder.
UPDATE public.credit_packs SET is_active = false;

INSERT INTO public.credit_packs (name, description, currency, price, credits, display_order, is_popular, is_active) VALUES
  -- USD packs (credits == USD value)
  ('Starter USD',       'Great for testing',          'USD',     5,      5,     10, false, true),
  ('Basic USD',         'Light monthly sending',      'USD',    10,     10,     11, false, true),
  ('Growth USD',        'Most popular for SMBs',      'USD',    25,     25,     12, true,  true),
  ('Pro USD',           'Active campaigns',           'USD',    50,     50,     13, false, true),
  ('Scale USD',         'High-volume senders',        'USD',   100,    100,     14, false, true),
  ('Business USD',      'Multi-country programs',     'USD',   250,    250,     15, false, true),
  ('Enterprise USD',    'Large monthly volume',       'USD',   500,    500,     16, false, true),
  ('Enterprise+ USD',   'Bulk credits, best value',   'USD',  1000,   1050,     17, false, true),

  -- NGN packs — priced at ~₦1,550 / $1 so credits stay in USD for accurate sending math
  ('Starter NGN',       'Great for testing',          'NGN',   7750,      5,    20, false, true),
  ('Basic NGN',         'Light monthly sending',      'NGN',  15500,     10,    21, false, true),
  ('Growth NGN',        'Most popular for SMBs',      'NGN',  38750,     25,    22, true,  true),
  ('Pro NGN',           'Active campaigns',           'NGN',  77500,     50,    23, false, true),
  ('Scale NGN',         'High-volume senders',        'NGN', 155000,    100,    24, false, true),
  ('Business NGN',      'Multi-country programs',     'NGN', 387500,    250,    25, false, true),
  ('Enterprise NGN',    'Large monthly volume',       'NGN', 775000,    500,    26, false, true),
  ('Enterprise+ NGN',   'Bulk credits, best value',   'NGN',1550000,   1050,    27, false, true);


-- ============================================================
-- migration: 20260618224513_8ab46435-fc2b-4d6f-942d-b5f875f9a5e1.sql
-- ============================================================
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft','queued','scheduled','sending','sent','paused','cancelled','failed'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_send_mode_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_send_mode_check CHECK (send_mode IN ('immediate','now','scheduled','smart'));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_status_check CHECK (status IN ('pending','queued','sending','sent','delivered','failed','undelivered'));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type ~ '^[a-z0-9_:-]+$');

-- ============================================================
-- migration: 20260618224556_26adc9c6-1a11-4e8f-bab5-bb79d4979e4d.sql
-- ============================================================
ALTER FUNCTION public.has_role(public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.my_eligible_profile_ids(jsonb) SECURITY INVOKER;

-- ============================================================
-- migration: 20260618225012_d16815fe-6a68-472e-990f-d4f38142c8f0.sql
-- ============================================================
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- ============================================================
-- migration: 20260618225404_e996f1d1-17df-4fdd-9e0b-6f2e02c769f1.sql
-- ============================================================
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- ============================================================
-- migration: 20260618230814_4b355210-7657-469c-b7b2-6be3d8195e22.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_match_query(uuid, jsonb) TO authenticated;

-- ============================================================
-- migration: 20260618232352_a06e1e92-de7a-4281-9c52-cb99c9358a29.sql
-- ============================================================

-- Restrict billing_settings reads to admins (contains payout details)
DROP POLICY IF EXISTS "authenticated read settings" ON public.billing_settings;
CREATE POLICY "admins read settings" ON public.billing_settings
  FOR SELECT TO authenticated
  USING (has_role('admin'::app_role));

-- Remove anonymous access to country_rates (was exposing internal cost_price).
-- Authenticated users (logged-in app) still read via the existing policy.
DROP POLICY IF EXISTS "country_rates anon read active" ON public.country_rates;
REVOKE SELECT ON public.country_rates FROM anon;

-- Allow tenants to delete their own sender assets
CREATE POLICY "tenant deletes own sender assets" ON public.sender_assets
  FOR DELETE TO authenticated
  USING ((account_id = auth.uid()) OR has_role('admin'::app_role));


-- ============================================================
-- migration: 20260619000025_65eb289d-f9d8-461e-b5c0-5369d8ac8e32.sql
-- ============================================================

-- 1) accounts: block tenants from updating sensitive system-managed columns
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
     OR NEW.twilio_subaccount_auth_token_enc IS DISTINCT FROM OLD.twilio_subaccount_auth_token_enc
     OR NEW.subaccount_phone_number IS DISTINCT FROM OLD.subaccount_phone_number
     OR NEW.subaccount_phone_sid IS DISTINCT FROM OLD.subaccount_phone_sid
     OR NEW.subaccount_messaging_service_sid IS DISTINCT FROM OLD.subaccount_messaging_service_sid
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update_trg ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_update_trg
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_update();

-- Also add an explicit WITH CHECK on the self-update policy
DROP POLICY IF EXISTS "profile self update" ON public.accounts;
CREATE POLICY "profile self update" ON public.accounts
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2) payments: restrict policies to authenticated role
DROP POLICY IF EXISTS "tenant creates own payments" ON public.payments;
CREATE POLICY "tenant creates own payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (account_id = auth.uid());

DROP POLICY IF EXISTS "tenant reads own payments" ON public.payments;
CREATE POLICY "tenant reads own payments" ON public.payments
  FOR SELECT TO authenticated
  USING ((account_id = auth.uid()) OR has_role('admin'::app_role));

DROP POLICY IF EXISTS "admins update payments" ON public.payments;
CREATE POLICY "admins update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (has_role('admin'::app_role))
  WITH CHECK (has_role('admin'::app_role));

-- 3) sender_assets: restrict update policy to authenticated, and prevent tenants
--    from rewriting carrier-managed fields on their own rows
DROP POLICY IF EXISTS "tenant updates own sender assets" ON public.sender_assets;
CREATE POLICY "tenant updates own sender assets" ON public.sender_assets
  FOR UPDATE TO authenticated
  USING ((account_id = auth.uid()) OR has_role('admin'::app_role))
  WITH CHECK (
    has_role('admin'::app_role)
    OR ((account_id = auth.uid()) AND (verification_status = 'pending'))
  );

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.phone_sid IS DISTINCT FROM OLD.phone_sid
     OR NEW.messaging_service_sid IS DISTINCT FROM OLD.messaging_service_sid
     OR NEW.verification_sid IS DISTINCT FROM OLD.verification_sid
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes_trg ON public.sender_assets;
CREATE TRIGGER sender_assets_block_tenant_carrier_writes_trg
  BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.sender_assets_block_tenant_carrier_writes();


-- ============================================================
-- migration: 20260619000036_027d267f-ab93-4a6a-99e7-e3ab3cb6994f.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.accounts_block_sensitive_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sender_assets_block_tenant_carrier_writes() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260619001014_d06a1a83-5474-4df6-9b8e-3b6a0aec3cc2.sql
-- ============================================================

-- 1) sender_assets INSERT: tenant cannot self-approve
DROP POLICY IF EXISTS "tenant writes own sender assets" ON public.sender_assets;
CREATE POLICY "tenant writes own sender assets"
ON public.sender_assets
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin')
  OR (account_id = auth.uid() AND verification_status = 'pending')
);

-- 2) accounts: revoke client access to Twilio credential columns (server uses service_role)
REVOKE SELECT (
  twilio_subaccount_sid,
  twilio_subaccount_auth_token_enc,
  subaccount_phone_sid,
  subaccount_messaging_service_sid,
  subaccount_phone_number
) ON public.accounts FROM authenticated, anon;

REVOKE UPDATE (
  twilio_subaccount_sid,
  twilio_subaccount_auth_token_enc,
  subaccount_phone_sid,
  subaccount_messaging_service_sid,
  subaccount_phone_number
) ON public.accounts FROM authenticated, anon;

-- 3) storage payment-proofs: restrict DELETE/UPDATE to authenticated
DROP POLICY IF EXISTS "tenants delete own payment proofs" ON storage.objects;
CREATE POLICY "tenants delete own payment proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "tenants update own payment proofs" ON storage.objects;
CREATE POLICY "tenants update own payment proofs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);


-- ============================================================
-- migration: 20260619001326_5a103cd2-05f6-4795-88b7-c7d5a9e89500.sql
-- ============================================================

CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL DEFAULT 'General question',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a message (public contact form)
CREATE POLICY "anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can read/update/delete
CREATE POLICY "admins read contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (public.has_role('admin'));

CREATE POLICY "admins update contact messages"
ON public.contact_messages
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

CREATE POLICY "admins delete contact messages"
ON public.contact_messages
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

CREATE TRIGGER trg_contact_messages_updated_at
BEFORE UPDATE ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ============================================================
-- migration: 20260619002253_2d4c4cf7-e7bb-4c1e-afea-056be4bbc7a9.sql
-- ============================================================

-- 1) Restrict sensitive Twilio columns: revoke from authenticated; service_role retains via GRANT ALL
REVOKE SELECT (twilio_subaccount_sid, twilio_subaccount_auth_token_enc, subaccount_phone_sid, subaccount_messaging_service_sid)
  ON public.accounts FROM authenticated;
REVOKE UPDATE (twilio_subaccount_sid, twilio_subaccount_auth_token_enc, subaccount_phone_sid, subaccount_messaging_service_sid)
  ON public.accounts FROM authenticated;

-- 2) Tighten sender_assets UPDATE policy: pin current verification_status to 'pending' for non-admins
DROP POLICY IF EXISTS "tenant updates own sender assets" ON public.sender_assets;
CREATE POLICY "tenant updates own sender assets"
ON public.sender_assets
FOR UPDATE
TO authenticated
USING (
  public.has_role('admin') OR (account_id = auth.uid() AND verification_status = 'pending')
)
WITH CHECK (
  public.has_role('admin') OR (account_id = auth.uid() AND verification_status = 'pending')
);

-- 3) Add explicit admin-only DELETE policy on accounts (prevents accidental future broadening; no self-delete)
CREATE POLICY "admins can delete accounts"
ON public.accounts
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

-- 4) Tighten contact_messages INSERT policy: keep public submissions but add basic validation
DROP POLICY IF EXISTS "anyone can submit a contact message" ON public.contact_messages;
CREATE POLICY "anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(coalesce(name, '')) BETWEEN 1 AND 200
  AND char_length(coalesce(email, '')) BETWEEN 3 AND 320
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND char_length(coalesce(message, '')) BETWEEN 1 AND 5000
);


-- ============================================================
-- migration: 20260619003516_d7ebf776-e957-4d26-a88f-d76e21e8996b.sql
-- ============================================================

CREATE TYPE public.number_request_country AS ENUM ('US','CA');
CREATE TYPE public.number_request_type AS ENUM ('toll_free','ten_dlc','short_code');
CREATE TYPE public.number_request_status AS ENUM ('pending','approved','rejected','provisioned');

CREATE TABLE public.number_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  country public.number_request_country NOT NULL,
  number_type public.number_request_type NOT NULL DEFAULT 'toll_free',
  business_name TEXT NOT NULL,
  business_website TEXT,
  use_case TEXT NOT NULL,
  sample_message TEXT NOT NULL,
  expected_monthly_volume INTEGER NOT NULL DEFAULT 0,
  status public.number_request_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  assigned_phone_number TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX number_requests_account_idx ON public.number_requests(account_id);
CREATE INDEX number_requests_status_idx ON public.number_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.number_requests TO authenticated;
GRANT ALL ON public.number_requests TO service_role;

ALTER TABLE public.number_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own number requests"
  ON public.number_requests FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY "Users create own number requests"
  ON public.number_requests FOR INSERT TO authenticated
  WITH CHECK (account_id = auth.uid() AND requested_by = auth.uid());

CREATE POLICY "Users cancel own pending requests"
  ON public.number_requests FOR DELETE TO authenticated
  USING (account_id = auth.uid() AND status = 'pending');

CREATE POLICY "Admins update number requests"
  ON public.number_requests FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER number_requests_touch
  BEFORE UPDATE ON public.number_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ============================================================
-- migration: 20260619094235_7fa4d110-d9ad-4032-bbe4-0b0485214250.sql
-- ============================================================

-- Attach existing guard triggers
DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_update
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_update();

DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes ON public.sender_assets;
CREATE TRIGGER sender_assets_block_tenant_carrier_writes
  BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.sender_assets_block_tenant_carrier_writes();

-- Pin status='pending' on tenant INSERT for number_requests
DROP POLICY IF EXISTS "Users create own number requests" ON public.number_requests;
CREATE POLICY "Users create own number requests"
  ON public.number_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'pending'::number_request_status
  );

-- Pin status='pending' on tenant INSERT for payments
DROP POLICY IF EXISTS "tenant creates own payments" ON public.payments;
CREATE POLICY "tenant creates own payments"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id = auth.uid()
    AND status = 'pending'
  );


-- ============================================================
-- migration: 20260619095325_ba219183-22da-4e89-bace-d943a4422544.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_sender_asset_from_number_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind TEXT;
BEGIN
  IF NEW.status IN ('approved','provisioned')
     AND NEW.assigned_phone_number IS NOT NULL
     AND NEW.assigned_phone_number <> ''
  THEN
    kind := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'toll_free'
      WHEN 'short_code' THEN 'short_code'
      ELSE 'long_code'
    END;

    IF EXISTS (
      SELECT 1 FROM public.sender_assets
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number
    ) THEN
      UPDATE public.sender_assets
      SET verification_status = 'verified',
          sender_kind = kind,
          updated_at = now(),
          last_synced_at = now()
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number;
    ELSE
      INSERT INTO public.sender_assets (
        account_id, country_code, sender_kind, phone_number,
        verification_status, last_synced_at
      ) VALUES (
        NEW.account_id, NEW.country::text, kind, NEW.assigned_phone_number,
        'verified', now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS number_requests_sync_sender_asset ON public.number_requests;
CREATE TRIGGER number_requests_sync_sender_asset
AFTER INSERT OR UPDATE ON public.number_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_sender_asset_from_number_request();

INSERT INTO public.sender_assets (account_id, country_code, sender_kind, phone_number, verification_status, last_synced_at)
SELECT nr.account_id, nr.country::text,
       CASE nr.number_type::text WHEN 'toll_free' THEN 'toll_free' WHEN 'short_code' THEN 'short_code' ELSE 'long_code' END,
       nr.assigned_phone_number, 'verified', now()
FROM public.number_requests nr
WHERE nr.status IN ('approved','provisioned')
  AND nr.assigned_phone_number IS NOT NULL
  AND nr.assigned_phone_number <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.sender_assets sa
    WHERE sa.account_id = nr.account_id
      AND sa.country_code = nr.country::text
      AND sa.phone_number = nr.assigned_phone_number
  );


-- ============================================================
-- migration: 20260619095335_366dadfd-b016-4a18-b7c2-1c4064ac7f8b.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.sync_sender_asset_from_number_request() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260619101839_f41795f9-3676-4a13-809c-2a9f255f1fe6.sql
-- ============================================================
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS sender_map jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campaigns.sender_map IS
  'Snapshot of per-country sender routing at the time the draft was saved. Keys are ISO country codes; values are { sender_kind, phone_number, messaging_service_sid } or null when no eligible verified sender exists.';

-- ============================================================
-- migration: 20260619102555_435dfb5a-233d-404c-b5d2-f812e8f5d084.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_sender_asset_from_number_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind TEXT;
BEGIN
  IF NEW.status IN ('approved','provisioned')
     AND NEW.assigned_phone_number IS NOT NULL
     AND NEW.assigned_phone_number <> ''
  THEN
    kind := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'toll_free'
      ELSE 'local'
    END;

    IF EXISTS (
      SELECT 1 FROM public.sender_assets
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number
    ) THEN
      UPDATE public.sender_assets
      SET verification_status = 'verified',
          sender_kind = kind,
          updated_at = now(),
          last_synced_at = now(),
          rejection_reason = NULL,
          friendly_rejection_reason = NULL
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number;
    ELSE
      INSERT INTO public.sender_assets (
        account_id, country_code, sender_kind, phone_number,
        verification_status, last_synced_at
      ) VALUES (
        NEW.account_id, NEW.country::text, kind, NEW.assigned_phone_number,
        'verified', now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.sender_assets (account_id, country_code, sender_kind, phone_number, verification_status, last_synced_at)
SELECT nr.account_id,
       nr.country::text,
       CASE nr.number_type::text WHEN 'toll_free' THEN 'toll_free' ELSE 'local' END,
       nr.assigned_phone_number,
       'verified',
       now()
FROM public.number_requests nr
WHERE nr.status IN ('approved','provisioned')
  AND nr.assigned_phone_number IS NOT NULL
  AND nr.assigned_phone_number <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.sender_assets sa
    WHERE sa.account_id = nr.account_id
      AND sa.country_code = nr.country::text
      AND sa.phone_number = nr.assigned_phone_number
  );

-- ============================================================
-- migration: 20260619103945_6b3eb26d-7d32-428c-a9ba-4748cdf5ccd9.sql
-- ============================================================
ALTER TABLE public.billing_settings ADD COLUMN IF NOT EXISTS usd_to_ngn_rate NUMERIC(10,2) NOT NULL DEFAULT 1600.00;

-- ============================================================
-- migration: 20260619111348_8cebba29-f589-4e0a-9aac-29568c53932e.sql
-- ============================================================

-- Tighten accounts column-level grants so users cannot self-update admin-only
-- fields and cannot read sensitive Twilio credentials via the Data API.

-- UPDATE: revoke table-wide, grant only safe columns
REVOKE UPDATE ON public.accounts FROM authenticated;
GRANT UPDATE (
  full_name, company, phone, avatar_url,
  auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount,
  legal_business_name, business_address, business_reg_number,
  website_url, privacy_policy_url, terms_url, contact_email,
  terms_accepted_at, monthly_volume_estimate, use_case_description,
  sample_message, opt_in_description, opt_in_screenshot_url, sms_target_countries
) ON public.accounts TO authenticated;

-- SELECT: revoke table-wide, grant only non-credential columns
REVOKE SELECT ON public.accounts FROM authenticated;
GRANT SELECT (
  id, email, full_name, company, phone, avatar_url, created_at, updated_at,
  credit_balance, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount,
  legal_business_name, business_address, business_reg_number,
  website_url, privacy_policy_url, terms_url, contact_email,
  onboarding_status, terms_accepted_at, suspended_at,
  subaccount_phone_number, subaccount_phone_sid, subaccount_messaging_service_sid,
  monthly_volume_estimate, use_case_description, sample_message,
  opt_in_description, opt_in_screenshot_url, sms_target_countries
) ON public.accounts TO authenticated;

-- service_role keeps full access (used by server functions with supabaseAdmin)
GRANT ALL ON public.accounts TO service_role;


-- ============================================================
-- migration: 20260620073805_71c6a153-941c-4f43-abbf-4d4d63566bcc.sql
-- ============================================================
ALTER TABLE public.accounts DISABLE TRIGGER USER;
UPDATE public.accounts SET twilio_subaccount_sid = NULL, twilio_subaccount_auth_token_enc = NULL WHERE twilio_subaccount_sid IS NOT NULL;
ALTER TABLE public.accounts ENABLE TRIGGER USER;

-- ============================================================
-- migration: 20260620075730_1991bc21-2dd6-4a73-8f9a-81f757bd97a0.sql
-- ============================================================
DELETE FROM public.sender_assets WHERE id = '120826ee-beaa-418a-8276-158090a903c7';

-- ============================================================
-- migration: 20260620080821_517c7c5c-1035-44bb-8a44-8ce44fd3fbdb.sql
-- ============================================================
ALTER TABLE public.sender_assets
  ADD COLUMN IF NOT EXISTS verification_payload jsonb;

-- ============================================================
-- migration: 20260620090451_7a9804df-a1f0-4211-b4ad-ea4f14997d26.sql
-- ============================================================
ALTER TABLE public.sender_assets DISABLE TRIGGER USER;
UPDATE public.sender_assets
SET verification_status = 'pending',
    last_synced_at = now()
WHERE country_code = 'US'
  AND sender_kind = 'toll_free'
  AND verification_sid IS NULL
  AND verification_status = 'verified';
ALTER TABLE public.sender_assets ENABLE TRIGGER USER;

-- ============================================================
-- migration: 20260620091804_a8a0a465-3d4d-47c3-97b9-2de71cfb07d4.sql
-- ============================================================
ALTER TABLE public.sender_assets REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sender_assets;

-- ============================================================
-- migration: 20260620093527_a7ca8d9d-38ee-4f9b-a9a4-213af4e71b52.sql
-- ============================================================

-- country_rates new columns
ALTER TABLE public.country_rates
  ADD COLUMN IF NOT EXISTS markup_percent numeric(6,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS number_type_used text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- pricing_sync_log
CREATE TABLE IF NOT EXISTS public.pricing_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  number_type_used text,
  cost_price numeric(10,5),
  sell_price numeric(10,5),
  status text NOT NULL DEFAULT 'ok',
  message text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_sync_log TO authenticated;
GRANT ALL ON public.pricing_sync_log TO service_role;
ALTER TABLE public.pricing_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pricing_sync_log"
  ON public.pricing_sync_log FOR SELECT TO authenticated
  USING (public.has_role('admin'));

-- platform_settings (singleton kv)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read platform_settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (public.has_role('admin'));
CREATE POLICY "Admins write platform_settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

INSERT INTO public.platform_settings(key, value)
  VALUES ('default_markup_percent', '50'::jsonb)
  ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- migration: 20260620093934_d495dbc6-5ae4-47f1-bc62-31b769d3d084.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  )
$$;


-- ============================================================
-- migration: 20260620095814_8cb3342f-e0e8-45b3-a843-dac1171e4fb4.sql
-- ============================================================
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY account_id, country_code, sender_kind
      ORDER BY
        (verification_sid IS NOT NULL) DESC,
        (phone_sid IS NOT NULL) DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.sender_assets
)
DELETE FROM public.sender_assets sa
USING ranked r
WHERE sa.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sender_assets_one_per_kind_idx
ON public.sender_assets(account_id, country_code, sender_kind);

-- ============================================================
-- migration: 20260620100721_2affe506-1eb6-4087-a50e-b35b6e93ff26.sql
-- ============================================================

-- Real Twilio outbound SMS prices (long-code, USD, from US sender) with 40% markup
WITH twilio_prices(code, cost) AS (
  VALUES
    ('US', 0.0083::numeric),
    ('CA', 0.0083),
    ('GB', 0.0410),
    ('AU', 0.0520),
    ('BR', 0.0340),
    ('FR', 0.0750),
    ('DE', 0.0890),
    ('IN', 0.0064),
    ('IT', 0.0780),
    ('NL', 0.0840),
    ('NG', 0.0410),
    ('ZA', 0.0345),
    ('ES', 0.0680),
    ('SE', 0.0760),
    ('AE', 0.0620)
)
UPDATE public.country_rates cr
SET cost_price = tp.cost,
    sell_price = ROUND(tp.cost * 1.40, 4),
    markup_percent = 40,
    manual_override = false,
    last_synced_at = now(),
    updated_at = now()
FROM twilio_prices tp
WHERE cr.country_code = tp.code;


-- ============================================================
-- migration: 20260620101212_c0f96873-5b37-4e8e-a5e2-637af78e75f4.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
     OR NEW.twilio_subaccount_auth_token_enc IS DISTINCT FROM OLD.twilio_subaccount_auth_token_enc
     OR NEW.subaccount_phone_number IS DISTINCT FROM OLD.subaccount_phone_number
     OR NEW.subaccount_phone_sid IS DISTINCT FROM OLD.subaccount_phone_sid
     OR NEW.subaccount_messaging_service_sid IS DISTINCT FROM OLD.subaccount_messaging_service_sid
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.phone_sid IS DISTINCT FROM OLD.phone_sid
     OR NEW.messaging_service_sid IS DISTINCT FROM OLD.messaging_service_sid
     OR NEW.verification_sid IS DISTINCT FROM OLD.verification_sid
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update_trg ON public.accounts;
DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes_trg ON public.sender_assets;

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_update ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_update
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_update();

DROP TRIGGER IF EXISTS sender_assets_block_tenant_carrier_writes ON public.sender_assets;
CREATE TRIGGER sender_assets_block_tenant_carrier_writes
  BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.sender_assets_block_tenant_carrier_writes();

-- ============================================================
-- migration: 20260620101225_c19fdfe5-f534-43d0-8b55-05a7467b92ca.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.accounts_block_sensitive_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sender_assets_block_tenant_carrier_writes() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- migration: 20260620101542_e0ba444d-92bd-45b1-b11e-2b2e84b0a497.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
     OR NEW.twilio_subaccount_auth_token_enc IS DISTINCT FROM OLD.twilio_subaccount_auth_token_enc
     OR NEW.subaccount_phone_number IS DISTINCT FROM OLD.subaccount_phone_number
     OR NEW.subaccount_phone_sid IS DISTINCT FROM OLD.subaccount_phone_sid
     OR NEW.subaccount_messaging_service_sid IS DISTINCT FROM OLD.subaccount_messaging_service_sid
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.phone_sid IS DISTINCT FROM OLD.phone_sid
     OR NEW.messaging_service_sid IS DISTINCT FROM OLD.messaging_service_sid
     OR NEW.verification_sid IS DISTINCT FROM OLD.verification_sid
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accounts_block_sensitive_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sender_assets_block_tenant_carrier_writes() FROM PUBLIC, anon, authenticated;

UPDATE public.sender_assets
SET verification_status = 'rejected',
    rejection_reason = 'The earlier submission was not registered with Twilio because the carrier phone ID was not saved. Click Resubmit to continue with the reserved toll-free number; no new number will be purchased.',
    friendly_rejection_reason = 'The earlier submission did not reach Twilio. Click Resubmit to continue with the reserved toll-free number; no new number will be purchased.',
    last_synced_at = now()
WHERE country_code = 'US'
  AND sender_kind = 'toll_free'
  AND verification_sid IS NULL
  AND verification_status = 'pending';

-- ============================================================
-- migration: 20260620101625_688dcbfb-b054-4ee9-a33a-e0f3c1328887.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM anon;

-- ============================================================
-- migration: 20260620102516_03ec9d94-17dc-4cdf-aff9-d24ea57327f0.sql
-- ============================================================
CREATE TABLE public.tollfree_verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  sender_asset_id uuid NULL,
  phone_number text NULL,
  phone_sid text NULL,
  messaging_service_sid text NULL,
  verification_sid text NULL,
  attempt_status text NOT NULL DEFAULT 'started',
  failure_reason text NULL,
  friendly_failure_reason text NULL,
  twilio_status integer NULL,
  twilio_code text NULL,
  twilio_more_info text NULL,
  twilio_response jsonb NULL,
  request_summary jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tollfree_verification_attempts_status_check CHECK (
    attempt_status IN ('started', 'number_reserved', 'submitted', 'already_submitted', 'failed', 'no_verification_sid')
  )
);

GRANT SELECT ON public.tollfree_verification_attempts TO authenticated;
GRANT ALL ON public.tollfree_verification_attempts TO service_role;

ALTER TABLE public.tollfree_verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read tollfree verification attempts"
ON public.tollfree_verification_attempts
FOR SELECT
TO authenticated
USING (public.has_role('admin'::public.app_role));

CREATE POLICY "Service role can manage tollfree verification attempts"
ON public.tollfree_verification_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX tollfree_verification_attempts_account_created_idx
ON public.tollfree_verification_attempts (account_id, created_at DESC);

CREATE INDEX tollfree_verification_attempts_status_created_idx
ON public.tollfree_verification_attempts (attempt_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_tollfree_verification_attempts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_tollfree_verification_attempts_updated_at() FROM anon, authenticated;

CREATE TRIGGER update_tollfree_verification_attempts_updated_at
BEFORE UPDATE ON public.tollfree_verification_attempts
FOR EACH ROW
EXECUTE FUNCTION public.touch_tollfree_verification_attempts_updated_at();

-- ============================================================
-- migration: 20260620102729_9fb391b5-d210-40d4-99c1-c706ec976cb0.sql
-- ============================================================
GRANT SELECT ON public.country_rates TO anon;

CREATE POLICY "Public can read active country rates"
ON public.country_rates
FOR SELECT
TO anon
USING (active = true);

-- ============================================================
-- migration: 20260620160946_1004c49d-0b61-4d28-b49a-98f196fabf87.sql
-- ============================================================

-- 1) Remove anon access to country_rates (which exposes cost_price/markup_percent).
DROP POLICY IF EXISTS "Public can read active country rates" ON public.country_rates;
REVOKE SELECT ON public.country_rates FROM anon;

-- Expose only the safe public view to anon.
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

-- 2) Tighten billing_settings: scope the ALL policy to authenticated admins only.
DROP POLICY IF EXISTS "admins manage settings" ON public.billing_settings;
CREATE POLICY "admins manage settings"
  ON public.billing_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role));

-- 3) Allow tenants to read their own toll-free verification attempt rows.
CREATE POLICY "Tenants can read own tollfree verification attempts"
  ON public.tollfree_verification_attempts
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());


-- ============================================================
-- migration: 20260620181101_email_infra.sql
-- ============================================================
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- ============================================================
-- migration: 20260620181229_email_infra.sql
-- ============================================================
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- ============================================================
-- migration: 20260620181655_98362661-4b60-4ca1-9567-093b51bcea63.sql
-- ============================================================

-- 1) Hide encrypted Twilio subaccount auth token from tenant SELECTs (defense-in-depth)
REVOKE SELECT (twilio_subaccount_auth_token_enc) ON public.accounts FROM authenticated;
REVOKE SELECT (twilio_subaccount_auth_token_enc) ON public.accounts FROM anon;

-- 2) Explicit RESTRICTIVE deny on billing_settings for non-admins (makes intent unambiguous)
DROP POLICY IF EXISTS "billing_settings non-admin deny" ON public.billing_settings;
CREATE POLICY "billing_settings non-admin deny"
ON public.billing_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- 3) Lock down SECURITY DEFINER crypto helpers (must not be callable by tenants)
REVOKE EXECUTE ON FUNCTION public.encrypt_twilio_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_twilio_token(bytea) FROM PUBLIC, anon, authenticated;

-- 4) Pin search_path on the email queue wrapper functions (linter: function_search_path_mutable)
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;


-- ============================================================
-- migration: 20260620181738_246c73f7-cfb7-473f-92d1-0500673b41fe.sql
-- ============================================================

-- Lock down internal SECURITY DEFINER functions: triggers and server-only helpers
-- should not be callable by anon or authenticated roles via the Data API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_tollfree_verification_attempts_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sender_assets_block_tenant_carrier_writes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_sender_asset_from_number_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounts_block_sensitive_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.topup_account(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_account(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- migration: 20260620181812_16891fd1-19ff-41da-8dda-eaf79c9dc1a4.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;


-- ============================================================
-- migration: 20260620182705_5b59e8f0-5a91-497f-acb5-d4277992961d.sql
-- ============================================================
update public.credit_packs set is_active = false where currency = 'USD' and price > 500;
grant select on public.credit_packs to anon;

-- ============================================================
-- migration: 20260620183808_8b511e1f-fdf4-4fec-bba8-ae16f1146984.sql
-- ============================================================
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS policies_accepted jsonb,
  ADD COLUMN IF NOT EXISTS policies_accepted_version text,
  ADD COLUMN IF NOT EXISTS sms_consent_disclosures_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_disclosures_version text;

-- ============================================================
-- migration: 20260620192503_8e997ef3-ecfd-4323-ba2e-772707f8eb0f.sql
-- ============================================================
CREATE TABLE public.campaign_test_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  to_phone TEXT NOT NULL,
  twilio_sid TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX campaign_test_sends_user_day_idx ON public.campaign_test_sends (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.campaign_test_sends TO authenticated;
GRANT ALL ON public.campaign_test_sends TO service_role;
ALTER TABLE public.campaign_test_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own test sends" ON public.campaign_test_sends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own test sends" ON public.campaign_test_sends FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- migration: 20260620194555_4ac12729-0e8f-47b1-a6b9-92fcf81d9ed6.sql
-- ============================================================
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_provider_check CHECK (provider = ANY (ARRAY['paystack'::text, 'payoneer'::text, 'nowpayments'::text]));

-- ============================================================
-- migration: 20260620195408_7595ae1e-aa93-4df2-a977-a204bab854bc.sql
-- ============================================================
UPDATE public.credit_packs SET is_active = false, updated_at = now() WHERE currency = 'USD' AND price < 25 AND is_active = true;

-- ============================================================
-- migration: 20260620195630_9fc39ce0-846a-4ceb-8de5-c04a6ed3028a.sql
-- ============================================================
UPDATE public.credit_packs SET is_active = true, updated_at = now() WHERE currency = 'USD' AND price < 25 AND name IN ('Starter USD','Basic USD');

-- ============================================================
-- migration: 20260620195924_00adddf5-83f0-4767-8c85-ffb19bf4382a.sql
-- ============================================================

-- 1) country_rates: drop broad authenticated read; allow admins only
DROP POLICY IF EXISTS "country_rates readable to authenticated" ON public.country_rates;

CREATE POLICY "country_rates admin read"
  ON public.country_rates
  FOR SELECT
  USING (has_role('admin'::app_role));

-- Ensure tenants can read the safe view
GRANT SELECT ON public.country_rates_public TO authenticated, anon;

-- 2) payments: tighten tenant INSERT policy to validate credits/amount
DROP POLICY IF EXISTS "tenant creates own payments" ON public.payments;

CREATE POLICY "tenant creates own payments"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    account_id = auth.uid()
    AND status = 'pending'
    AND amount >= 0
    AND credits >= 0
    AND (
      EXISTS (
        SELECT 1 FROM public.credit_packs cp
        WHERE cp.id = payments.pack_id
          AND cp.is_active = true
          AND cp.currency = payments.currency
          AND cp.price = payments.amount
          AND cp.credits = payments.credits
      )
      OR (
        payments.pack_id IS NULL
        AND payments.currency = 'USD'
        AND payments.amount = payments.credits
        AND payments.amount BETWEEN 1 AND 10000
      )
    )
  );


-- ============================================================
-- migration: 20260620200615_525344ab-118e-425c-8b60-68ea52e07397.sql
-- ============================================================

CREATE TABLE public.twilio_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('healthy','low','critical','error')),
  error_message TEXT,
  alerted BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.twilio_balance_snapshots TO authenticated;
GRANT ALL ON public.twilio_balance_snapshots TO service_role;

ALTER TABLE public.twilio_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin reads twilio balance snapshots"
  ON public.twilio_balance_snapshots FOR SELECT
  USING (has_role('admin'::app_role));

CREATE INDEX twilio_balance_snapshots_checked_at_idx
  ON public.twilio_balance_snapshots (checked_at DESC);

-- Default platform settings (only insert if missing)
INSERT INTO public.platform_settings (key, value) VALUES
  ('twilio_low_balance_threshold_usd', '20'::jsonb),
  ('twilio_critical_balance_threshold_usd', '5'::jsonb),
  ('twilio_alert_email', '"sam@samwellagency.com"'::jsonb),
  ('twilio_alerts_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- migration: 20260620202256_7329d4bf-ac40-4a52-8517-938d66249a5b.sql
-- ============================================================

-- Pause/resume support for campaigns when master Twilio balance is insufficient
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaigns_paused_low_balance
  ON public.campaigns (paused_at)
  WHERE status = 'paused_low_balance';

-- Platform settings for alert routing & balance buffer
INSERT INTO public.platform_settings (key, value)
VALUES
  ('twilio_alert_emails', to_jsonb('sam@samwellagency.com,durosinmisamuel94@gmail.com,samueldurosinmi69@gmail.com'::text)),
  ('twilio_alert_phone_e164', to_jsonb('+2348106199368'::text)),
  ('twilio_balance_buffer_usd', to_jsonb(5))
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- migration: 20260620204135_eab2f0a7-a118-413b-abdb-25715df46765.sql
-- ============================================================

-- Restrictive policies to deny non-service_role access on sensitive log/token tables
CREATE POLICY "Service role only access" ON public.email_send_log
  AS RESTRICTIVE FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only access" ON public.email_unsubscribe_tokens
  AS RESTRICTIVE FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only access" ON public.suppressed_emails
  AS RESTRICTIVE FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- migration: 20260620210705_6ae3ae0f-78d8-4941-a195-ca31666d060b.sql
-- ============================================================

GRANT SELECT ON public.country_rates_public TO authenticated, anon;

DROP POLICY IF EXISTS "campaign-media insert own" ON storage.objects;
CREATE POLICY "campaign-media insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "campaign-media update own" ON storage.objects;
CREATE POLICY "campaign-media update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "campaign-media delete own" ON storage.objects;
CREATE POLICY "campaign-media delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "campaign-media read own" ON storage.objects;
CREATE POLICY "campaign-media read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);


-- ============================================================
-- migration: 20260620210759_d4646487-7209-4506-a32f-d766994683ce.sql
-- ============================================================
ALTER VIEW public.country_rates_public SET (security_invoker = false);

-- ============================================================
-- migration: 20260620214908_fd70f3fc-9e0d-4c7c-9228-c8d2574980e8.sql
-- ============================================================
UPDATE public.campaigns SET status = 'queued', updated_at = now() WHERE status = 'sending' AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.campaign_id = campaigns.id);

-- ============================================================
-- migration: 20260620222738_9cc91d8e-ca73-4971-b5a6-8ef166403fd3.sql
-- ============================================================
ALTER VIEW public.country_rates_public SET (security_invoker = true);

ALTER TABLE public.email_send_state FORCE ROW LEVEL SECURITY;
CREATE POLICY "Deny non-service_role access to email_send_state"
  ON public.email_send_state
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- migration: 20260620223633_38717105-a840-461c-acd8-5e6540e1077c.sql
-- ============================================================

ALTER TABLE public.events ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS events_account_id_idx ON public.events(account_id);

DROP POLICY IF EXISTS "Admins read all events" ON public.events;
CREATE POLICY "Admins read all events"
  ON public.events FOR SELECT TO authenticated
  USING (public.has_role('admin'));


-- ============================================================
-- migration: 20260620224216_5d7aaf0d-ef4e-4b1a-89f9-a83b3ef3934a.sql
-- ============================================================
ALTER PUBLICATION supabase_realtime DROP TABLE public.sender_assets;

-- ============================================================
-- migration: 20260621075827_38de6f65-300a-4565-9d40-a7d63d6467a7.sql
-- ============================================================
GRANT SELECT ON public.country_rates_public TO authenticated, anon;

-- ============================================================
-- migration: 20260621080146_88414648-41b0-44c5-ac19-b7b976cb825e.sql
-- ============================================================
ALTER VIEW public.country_rates_public SET (security_invoker = false);
GRANT SELECT ON public.country_rates_public TO authenticated, anon;

-- ============================================================
-- migration: 20260621080215_df46b54d-3280-40f2-9104-da146c7a23e3.sql
-- ============================================================
ALTER VIEW public.country_rates_public SET (security_invoker = true);

GRANT SELECT (country_code, country_name, dial_prefix, sell_price, mms_multiplier, sender_supports_inbound, active)
  ON public.country_rates TO authenticated, anon;

DROP POLICY IF EXISTS "country_rates public safe read" ON public.country_rates;
CREATE POLICY "country_rates public safe read"
  ON public.country_rates
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- ============================================================
-- migration: 20260621080415_d0b17daa-526f-4333-bf5b-5bf39073ab4d.sql
-- ============================================================
ALTER TABLE public.country_rates REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.country_rates;

-- ============================================================
-- migration: 20260621080605_0b79df15-bd08-4f14-a387-f72175179341.sql
-- ============================================================
-- 1) Drop the permissive policy that exposed cost/margin via the raw table
DROP POLICY IF EXISTS "country_rates public safe read" ON public.country_rates;

-- 2) Revoke the broad column grants we previously gave anon/authenticated
REVOKE SELECT ON public.country_rates FROM anon;
REVOKE SELECT ON public.country_rates FROM authenticated;

-- 3) Switch the public view to SECURITY DEFINER mode so it runs as the
--    view owner and tenants can read safe columns without direct table access
ALTER VIEW public.country_rates_public SET (security_invoker = false);
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

-- 4) Remove country_rates from the Realtime publication so row-change
--    events (which include cost_price/markup_percent) are not broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.country_rates;

-- ============================================================
-- migration: 20260621080626_960f0c92-2e52-486c-85e9-9b7caa687f97.sql
-- ============================================================
-- Revert view to caller's privileges (linter best practice)
ALTER VIEW public.country_rates_public SET (security_invoker = true);

-- Grant SELECT only on safe public columns (cost_price/markup_percent excluded)
GRANT SELECT (
  country_code,
  country_name,
  dial_prefix,
  sell_price,
  mms_multiplier,
  sender_supports_inbound,
  active
) ON public.country_rates TO anon, authenticated;

-- Re-add a SELECT RLS policy; column grants prevent reading cost/margin
DROP POLICY IF EXISTS "country_rates safe column read" ON public.country_rates;
CREATE POLICY "country_rates safe column read"
  ON public.country_rates
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- migration: 20260621081046_d406a569-2db5-472e-8013-6061d4edd23b.sql
-- ============================================================
-- Drop the permissive read policy and column-level grants on the base table
DROP POLICY IF EXISTS "country_rates safe column read" ON public.country_rates;
REVOKE SELECT (country_code, country_name, dial_prefix, sell_price, mms_multiplier, sender_supports_inbound, active)
  ON public.country_rates FROM anon, authenticated;

-- Restore admin/tenant table-level access on the raw table.
-- RLS still gates non-admin authenticated users via the existing
-- "country_rates admin read" / "country_rates admin write" policies,
-- so only admins can SELECT/UPDATE rows directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.country_rates TO authenticated;
GRANT ALL ON public.country_rates TO service_role;

-- The public-safe view runs with the view owner's privileges so
-- anon/authenticated can read ONLY the safe columns it projects.
ALTER VIEW public.country_rates_public SET (security_invoker = false);
GRANT SELECT ON public.country_rates_public TO anon, authenticated;

-- ============================================================
-- migration: 20260621081522_bf493682-5790-4752-be2b-5d1bc08e1c97.sql
-- ============================================================
-- Drop the SECURITY DEFINER view; tenants now read pricing via server fns
DROP VIEW IF EXISTS public.country_rates_public;

-- Tighten table access: only admins (via RLS) and service_role can touch country_rates.
-- The "country_rates admin read" / "country_rates admin write" RLS policies remain
-- and gate non-admin authenticated users out entirely.
-- (authenticated table grants remain so admins, who are 'authenticated', can read/update.)

-- ============================================================
-- migration: 20260621082409_fda9e4fd-9d7d-4469-b9cf-d4b6bd345a7c.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pricing_sync_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.pricing_sync_log;
  END IF;
END $$;

DROP POLICY IF EXISTS "credit_tx admin read" ON public.credit_transactions;
CREATE POLICY "credit_tx admin read"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

REVOKE SELECT (twilio_subaccount_sid, subaccount_phone_sid, subaccount_messaging_service_sid)
  ON public.accounts
  FROM authenticated, anon;

-- ============================================================
-- migration: 20260621082621_371490d1-4db4-4ba6-8879-01255929e36f.sql
-- ============================================================
GRANT SELECT (sms_consent_disclosures_confirmed_at, sms_consent_disclosures_version)
  ON public.accounts
  TO authenticated;

GRANT UPDATE (sms_consent_disclosures_confirmed_at, sms_consent_disclosures_version)
  ON public.accounts
  TO authenticated;

-- ============================================================
-- migration: 20260621103148_c92f8e03-fca3-4f93-852b-f3b7c008272e.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.eligible_profile_ids_page(
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.eligible_profile_ids(_account_id, _audience)
  OFFSET GREATEST(_offset, 0)
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids_page(
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.eligible_profile_ids_page(auth.uid(), _audience, _limit, _offset);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_count(_audience jsonb)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.eligible_profile_ids(auth.uid(), _audience);
$$;

REVOKE EXECUTE ON FUNCTION public.eligible_profile_ids_page(uuid, jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids_page(uuid, jsonb, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_count(jsonb) TO authenticated;

-- ============================================================
-- migration: 20260621103210_3d6888cf-5d2f-4f36-b986-c0336b098b89.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.eligible_profile_ids_page(
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.eligible_profile_ids(_account_id, _audience)
  ORDER BY profile_id
  OFFSET GREATEST(_offset, 0)
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
$$;

-- ============================================================
-- migration: 20260622075545_33b70b59-fac3-4045-a408-1188822d1e6f.sql
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS gorgias_domain text,
  ADD COLUMN IF NOT EXISTS gorgias_email text,
  ADD COLUMN IF NOT EXISTS gorgias_api_key_enc text,
  ADD COLUMN IF NOT EXISTS gorgias_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.gorgias_ticket_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  gorgias_ticket_id bigint NOT NULL,
  gorgias_customer_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone_e164)
);

GRANT SELECT ON public.gorgias_ticket_map TO authenticated;
GRANT ALL ON public.gorgias_ticket_map TO service_role;
ALTER TABLE public.gorgias_ticket_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants read own gorgias map"
  ON public.gorgias_ticket_map FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());


-- ============================================================
-- migration: 20260623133548_8964d7a2-b643-4d5b-b174-7168e8102d6b.sql
-- ============================================================

CREATE TABLE public.sms_thread_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL,
  phone_e164 TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT NOT NULL,
  from_number TEXT,
  to_number TEXT,
  provider_sid TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX sms_thread_messages_account_phone_idx ON public.sms_thread_messages (account_id, phone_e164, created_at DESC);
GRANT SELECT ON public.sms_thread_messages TO authenticated;
GRANT ALL ON public.sms_thread_messages TO service_role;
ALTER TABLE public.sms_thread_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants read own thread messages" ON public.sms_thread_messages
  FOR SELECT TO authenticated USING (account_id = auth.uid());


-- ============================================================
-- migration: 20260623133721_676ba991-645c-4f0d-a276-3281f01d64d6.sql
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_thread_messages;

-- ============================================================
-- migration: 20260624104235_07a3f28b-95d9-44de-9cf3-8639f81b2fad.sql
-- ============================================================

-- 1. Member role enum
DO $$ BEGIN
  CREATE TYPE public.account_member_role AS ENUM ('viewer','editor','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role public.account_member_role NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','removed')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_members_email_uq
  ON public.account_members (account_id, lower(invited_email));
CREATE INDEX IF NOT EXISTS account_members_user_idx
  ON public.account_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_members_account_idx
  ON public.account_members (account_id);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_members TO authenticated;
GRANT ALL ON public.account_members TO service_role;

-- 4. RLS
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

-- Helper: does the current user have access to the given account at >= the requested role?
-- Owner of the account (account_id == auth.uid()) is implicit admin.
CREATE OR REPLACE FUNCTION public.has_account_access(_account_id UUID, _min_role public.account_member_role DEFAULT 'viewer')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN false
      WHEN _account_id = auth.uid() THEN true
      WHEN EXISTS (
        SELECT 1 FROM public.account_members m
        WHERE m.account_id = _account_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
          AND (
            _min_role = 'viewer'
            OR (_min_role = 'editor' AND m.role IN ('editor','admin'))
            OR (_min_role = 'admin'  AND m.role = 'admin')
          )
      ) THEN true
      ELSE false
    END
$$;

-- Claim helper: links any pending invitations matching the signed-in user's email.
CREATE OR REPLACE FUNCTION public.claim_account_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RETURN 0; END IF;

  WITH upd AS (
    UPDATE public.account_members
       SET user_id = auth.uid(),
           status = 'active',
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE lower(invited_email) = _email
       AND status = 'invited'
       AND (user_id IS NULL OR user_id = auth.uid())
     RETURNING 1
  )
  SELECT COUNT(*) INTO _count FROM upd;
  RETURN COALESCE(_count, 0);
END;
$$;

-- Policies on account_members
CREATE POLICY "Members and owners can view team"
  ON public.account_members FOR SELECT
  USING (
    public.has_account_access(account_id, 'viewer')
    OR public.has_role('admin')
  );

CREATE POLICY "Owners and admins can insert members"
  ON public.account_members FOR INSERT
  WITH CHECK (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  );

CREATE POLICY "Owners and admins can update members"
  ON public.account_members FOR UPDATE
  USING (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  )
  WITH CHECK (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  );

CREATE POLICY "Owners and admins can delete members"
  ON public.account_members FOR DELETE
  USING (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS account_members_touch_updated_at ON public.account_members;
CREATE TRIGGER account_members_touch_updated_at
  BEFORE UPDATE ON public.account_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Extend READ access on tenant tables so team members can view the workspace.
-- Owner-only ALL/SELECT policies remain in place; these are additive permissive policies.

CREATE POLICY "Team members can view campaigns"
  ON public.campaigns FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view profiles"
  ON public.profiles FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view segments"
  ON public.segments FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view contact_lists"
  ON public.contact_lists FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view profile_list_members"
  ON public.profile_list_members FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view suppressions"
  ON public.suppressions FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view sender_assets"
  ON public.sender_assets FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view number_requests"
  ON public.number_requests FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view sms_thread_messages"
  ON public.sms_thread_messages FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view messages"
  ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = messages.campaign_id
      AND public.has_account_access(c.account_id, 'viewer')
  ));

CREATE POLICY "Team members can view consents"
  ON public.consents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = consents.profile_id
      AND public.has_account_access(p.account_id, 'viewer')
  ));

CREATE POLICY "Team members can view credit_transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view their account row"
  ON public.accounts FOR SELECT
  USING (public.has_account_access(id, 'viewer'));


-- ============================================================
-- migration: 20260624104250_b420806e-a9fe-4dc4-8b23-1ba31f3e7369.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.has_account_access(uuid, public.account_member_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_account_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_account_access(uuid, public.account_member_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_invites() TO authenticated, service_role;


-- ============================================================
-- migration: 20260624120309_209c7044-a125-4a35-b153-d8a4a101f687.sql
-- ============================================================
-- 1) Seed any missing country_rates rows for all supported countries
-- These start inactive with zero prices; the admin's "Refresh SMS provider pricing"
-- button will populate real cost/sell and flip them active.
INSERT INTO public.country_rates (country_code, country_name, dial_prefix, cost_price, sell_price, markup_percent, active, manual_override)
VALUES
  ('IE','Ireland','+353',0,0,50,false,false),
  ('NZ','New Zealand','+64',0,0,50,false,false),
  ('PT','Portugal','+351',0,0,50,false,false),
  ('BE','Belgium','+32',0,0,50,false,false),
  ('LU','Luxembourg','+352',0,0,50,false,false),
  ('CH','Switzerland','+41',0,0,50,false,false),
  ('AT','Austria','+43',0,0,50,false,false),
  ('DK','Denmark','+45',0,0,50,false,false),
  ('NO','Norway','+47',0,0,50,false,false),
  ('FI','Finland','+358',0,0,50,false,false),
  ('IS','Iceland','+354',0,0,50,false,false),
  ('PL','Poland','+48',0,0,50,false,false),
  ('CZ','Czechia','+420',0,0,50,false,false),
  ('SK','Slovakia','+421',0,0,50,false,false),
  ('HU','Hungary','+36',0,0,50,false,false),
  ('RO','Romania','+40',0,0,50,false,false),
  ('BG','Bulgaria','+359',0,0,50,false,false),
  ('GR','Greece','+30',0,0,50,false,false),
  ('HR','Croatia','+385',0,0,50,false,false),
  ('SI','Slovenia','+386',0,0,50,false,false),
  ('EE','Estonia','+372',0,0,50,false,false),
  ('LV','Latvia','+371',0,0,50,false,false),
  ('LT','Lithuania','+370',0,0,50,false,false),
  ('MT','Malta','+356',0,0,50,false,false),
  ('CY','Cyprus','+357',0,0,50,false,false),
  ('TR','Turkey','+90',0,0,50,false,false),
  ('RU','Russia','+7',0,0,50,false,false),
  ('UA','Ukraine','+380',0,0,50,false,false),
  ('IL','Israel','+972',0,0,50,false,false),
  ('SA','Saudi Arabia','+966',0,0,50,false,false),
  ('QA','Qatar','+974',0,0,50,false,false),
  ('KW','Kuwait','+965',0,0,50,false,false),
  ('BH','Bahrain','+973',0,0,50,false,false),
  ('OM','Oman','+968',0,0,50,false,false),
  ('JO','Jordan','+962',0,0,50,false,false),
  ('LB','Lebanon','+961',0,0,50,false,false),
  ('EG','Egypt','+20',0,0,50,false,false),
  ('MA','Morocco','+212',0,0,50,false,false),
  ('DZ','Algeria','+213',0,0,50,false,false),
  ('TN','Tunisia','+216',0,0,50,false,false),
  ('GH','Ghana','+233',0,0,50,false,false),
  ('KE','Kenya','+254',0,0,50,false,false),
  ('UG','Uganda','+256',0,0,50,false,false),
  ('TZ','Tanzania','+255',0,0,50,false,false),
  ('RW','Rwanda','+250',0,0,50,false,false),
  ('ET','Ethiopia','+251',0,0,50,false,false),
  ('CI','Cote dIvoire','+225',0,0,50,false,false),
  ('SN','Senegal','+221',0,0,50,false,false),
  ('CM','Cameroon','+237',0,0,50,false,false),
  ('PK','Pakistan','+92',0,0,50,false,false),
  ('BD','Bangladesh','+880',0,0,50,false,false),
  ('LK','Sri Lanka','+94',0,0,50,false,false),
  ('NP','Nepal','+977',0,0,50,false,false),
  ('CN','China','+86',0,0,50,false,false),
  ('HK','Hong Kong','+852',0,0,50,false,false),
  ('TW','Taiwan','+886',0,0,50,false,false),
  ('JP','Japan','+81',0,0,50,false,false),
  ('KR','South Korea','+82',0,0,50,false,false),
  ('MY','Malaysia','+60',0,0,50,false,false),
  ('TH','Thailand','+66',0,0,50,false,false),
  ('VN','Vietnam','+84',0,0,50,false,false),
  ('PH','Philippines','+63',0,0,50,false,false),
  ('ID','Indonesia','+62',0,0,50,false,false),
  ('MX','Mexico','+52',0,0,50,false,false),
  ('AR','Argentina','+54',0,0,50,false,false),
  ('CL','Chile','+56',0,0,50,false,false),
  ('CO','Colombia','+57',0,0,50,false,false),
  ('PE','Peru','+51',0,0,50,false,false),
  ('VE','Venezuela','+58',0,0,50,false,false),
  ('UY','Uruguay','+598',0,0,50,false,false),
  ('PY','Paraguay','+595',0,0,50,false,false),
  ('BO','Bolivia','+591',0,0,50,false,false),
  ('EC','Ecuador','+593',0,0,50,false,false),
  ('CR','Costa Rica','+506',0,0,50,false,false),
  ('PA','Panama','+507',0,0,50,false,false),
  ('DO','Dominican Republic','+1',0,0,50,false,false),
  ('JM','Jamaica','+1',0,0,50,false,false),
  ('TT','Trinidad and Tobago','+1',0,0,50,false,false)
ON CONFLICT (country_code) DO NOTHING;

-- 2) Add granular per-feature permissions to team memberships (Klaviyo-style)
ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.account_members.permissions IS
  'Per-feature boolean toggles: { dashboard, campaigns, inbox, audience, segments, suppressions, setup_sms, billing, team, settings }. Empty = derived from role.';


-- ============================================================
-- migration: 20260629094339_16ee2f77-e68f-4849-839c-b7f2ecef604e.sql
-- ============================================================
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft','queued','scheduled','sending','sent','paused','cancelled','failed','blocked_content'));

-- ============================================================
-- migration: 20260702211616_4a643ab4-61a5-4b00-af29-0225db0e125b.sql
-- ============================================================

-- 1. Mark accounts that are sellers
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_seller boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_balance numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_lifetime_earnings numeric(12,2) NOT NULL DEFAULT 0;

-- 2. Seller payout (Nigerian bank) accounts
CREATE TABLE IF NOT EXISTS public.seller_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_payout_accounts TO authenticated;
GRANT ALL ON public.seller_payout_accounts TO service_role;
ALTER TABLE public.seller_payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers manage own payout account"
  ON public.seller_payout_accounts FOR ALL TO authenticated
  USING (account_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (account_id = auth.uid() OR public.has_role('admin'));
CREATE TRIGGER trg_payout_accounts_updated_at
  BEFORE UPDATE ON public.seller_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Marketplace listings
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sender_asset_id uuid REFERENCES public.sender_assets(id) ON DELETE SET NULL,
  tollfree_attempt_id uuid REFERENCES public.tollfree_verification_attempts(id) ON DELETE SET NULL,
  phone_number text,
  status text NOT NULL DEFAULT 'verifying' CHECK (status IN ('verifying','available','sold','rejected','withdrawn')),
  buyer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  sold_at timestamptz,
  buyer_price_amount numeric(12,2),
  seller_payout_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON public.marketplace_listings(seller_account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own listings"
  ON public.marketplace_listings FOR SELECT TO authenticated
  USING (seller_account_id = auth.uid() OR buyer_account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Sellers insert own listings"
  ON public.marketplace_listings FOR INSERT TO authenticated
  WITH CHECK (seller_account_id = auth.uid());
CREATE POLICY "Admins update listings"
  ON public.marketplace_listings FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Seller ledger
CREATE TABLE IF NOT EXISTS public.seller_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sale_credit','withdrawal_debit','adjustment')),
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  withdrawal_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_account ON public.seller_ledger(account_id, created_at DESC);
GRANT SELECT, INSERT ON public.seller_ledger TO authenticated;
GRANT ALL ON public.seller_ledger TO service_role;
ALTER TABLE public.seller_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own ledger"
  ON public.seller_ledger FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.has_role('admin'));

-- 5. Withdrawal requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  payout_account_snapshot jsonb NOT NULL,
  admin_notes text,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers manage own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (seller_account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Sellers create own withdrawal requests"
  ON public.withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (seller_account_id = auth.uid());
CREATE POLICY "Admins update withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Marketplace pricing rows in platform_settings
INSERT INTO public.platform_settings (key, value)
VALUES
  ('marketplace_buyer_price_usd', '15'::jsonb),
  ('marketplace_seller_payout_usd', '10'::jsonb),
  ('marketplace_seller_verification_fee_usd', '3.50'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 7. Seller credit/debit SQL fns
CREATE OR REPLACE FUNCTION public.credit_seller(_account_id uuid, _amount numeric, _listing_id uuid, _description text)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance numeric;
BEGIN
  UPDATE public.accounts
     SET seller_balance = seller_balance + _amount,
         seller_lifetime_earnings = seller_lifetime_earnings + _amount
   WHERE id = _account_id
  RETURNING seller_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Seller account not found'; END IF;
  INSERT INTO public.seller_ledger(account_id, type, amount, balance_after, listing_id, description)
    VALUES (_account_id, 'sale_credit', _amount, new_balance, _listing_id, _description);
  RETURN new_balance;
END $$;

CREATE OR REPLACE FUNCTION public.debit_seller_withdrawal(_account_id uuid, _amount numeric, _withdrawal_id uuid, _description text)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance numeric;
BEGIN
  UPDATE public.accounts
     SET seller_balance = seller_balance - _amount
   WHERE id = _account_id
  RETURNING seller_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Seller account not found'; END IF;
  IF new_balance < 0 THEN
    UPDATE public.accounts SET seller_balance = seller_balance + _amount WHERE id = _account_id;
    RAISE EXCEPTION 'Insufficient seller balance';
  END IF;
  INSERT INTO public.seller_ledger(account_id, type, amount, balance_after, withdrawal_id, description)
    VALUES (_account_id, 'withdrawal_debit', -_amount, new_balance, _withdrawal_id, _description);
  RETURN new_balance;
END $$;


-- ============================================================
-- migration: 20260702211634_f3079198-d3e0-4f64-901d-c08c4839e1f6.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.credit_seller(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_seller_withdrawal(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller(uuid, numeric, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_seller_withdrawal(uuid, numeric, uuid, text) TO service_role;


-- ============================================================
-- migration: 20260703094921_c94a6a04-ea91-46af-94e7-e0a20e28e88e.sql
-- ============================================================

-- =========================================================================
-- Verified Toll-Free Number Marketplace
-- =========================================================================

-- Status enums
DO $$ BEGIN
  CREATE TYPE public.verifier_tfn_status AS ENUM ('pending_verification','verified','sold','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verifier_tx_type AS ENUM ('sale_credit','commission','withdrawal_debit','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verifier_withdrawal_status AS ENUM ('pending','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- verifiers
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.verifiers TO authenticated;
GRANT ALL ON public.verifiers TO service_role;

ALTER TABLE public.verifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifiers self read"
  ON public.verifiers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY "verifiers self insert"
  ON public.verifiers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "verifiers self update"
  ON public.verifiers FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role('admin'));

CREATE TRIGGER verifiers_touch BEFORE UPDATE ON public.verifiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_bank_accounts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL UNIQUE REFERENCES public.verifiers(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.verifier_bank_accounts TO authenticated;
GRANT ALL ON public.verifier_bank_accounts TO service_role;

ALTER TABLE public.verifier_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_bank self read"
  ON public.verifier_bank_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

CREATE POLICY "verifier_bank self write"
  ON public.verifier_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE POLICY "verifier_bank self update"
  ON public.verifier_bank_accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE TRIGGER verifier_bank_touch BEFORE UPDATE ON public.verifier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_wallets
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL UNIQUE REFERENCES public.verifiers(id) ON DELETE CASCADE,
  balance_ngn NUMERIC(14,2) NOT NULL DEFAULT 0,
  lifetime_earned_ngn NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.verifier_wallets TO authenticated;
GRANT ALL ON public.verifier_wallets TO service_role;

ALTER TABLE public.verifier_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_wallets self read"
  ON public.verifier_wallets FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

CREATE TRIGGER verifier_wallets_touch BEFORE UPDATE ON public.verifier_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_tfns
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_tfns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT 'US',
  status public.verifier_tfn_status NOT NULL DEFAULT 'pending_verification',
  twilio_verification_sid TEXT,
  twilio_phone_sid TEXT,
  rejection_reason TEXT,
  sold_to_account_id UUID REFERENCES public.accounts(id),
  sold_at TIMESTAMPTZ,
  sale_price_ngn NUMERIC(14,2),
  commission_ngn NUMERIC(14,2),
  payout_ngn NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifier_tfns_status_idx ON public.verifier_tfns(status);
CREATE INDEX IF NOT EXISTS verifier_tfns_verifier_idx ON public.verifier_tfns(verifier_id);
CREATE INDEX IF NOT EXISTS verifier_tfns_sold_account_idx ON public.verifier_tfns(sold_to_account_id);

GRANT SELECT, INSERT, UPDATE ON public.verifier_tfns TO authenticated;
GRANT ALL ON public.verifier_tfns TO service_role;

ALTER TABLE public.verifier_tfns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_tfns self read"
  ON public.verifier_tfns FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
    OR sold_to_account_id = auth.uid()
  );

CREATE POLICY "verifier_tfns self insert"
  ON public.verifier_tfns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE POLICY "verifier_tfns admin update"
  ON public.verifier_tfns FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER verifier_tfns_touch BEFORE UPDATE ON public.verifier_tfns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_transactions
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  type public.verifier_tx_type NOT NULL,
  amount_ngn NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  tfn_id UUID REFERENCES public.verifier_tfns(id),
  withdrawal_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifier_tx_verifier_idx ON public.verifier_transactions(verifier_id, created_at DESC);

GRANT SELECT ON public.verifier_transactions TO authenticated;
GRANT ALL ON public.verifier_transactions TO service_role;

ALTER TABLE public.verifier_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_tx self read"
  ON public.verifier_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

-- =========================================================================
-- verifier_withdrawals
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  amount_ngn NUMERIC(14,2) NOT NULL CHECK (amount_ngn > 0),
  status public.verifier_withdrawal_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifier_wd_status_idx ON public.verifier_withdrawals(status);
CREATE INDEX IF NOT EXISTS verifier_wd_verifier_idx ON public.verifier_withdrawals(verifier_id, created_at DESC);

GRANT SELECT, INSERT ON public.verifier_withdrawals TO authenticated;
GRANT ALL ON public.verifier_withdrawals TO service_role;

ALTER TABLE public.verifier_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_wd self read"
  ON public.verifier_withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

CREATE POLICY "verifier_wd self insert"
  ON public.verifier_withdrawals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE POLICY "verifier_wd admin update"
  ON public.verifier_withdrawals FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER verifier_wd_touch BEFORE UPDATE ON public.verifier_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- Platform settings defaults
-- =========================================================================
INSERT INTO public.platform_settings (key, value)
VALUES
  ('tfn_flat_price_ngn', '15000'::jsonb),
  ('tfn_commission_pct', '25'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- RPCs
-- =========================================================================

-- Ensure a wallet exists for a verifier
CREATE OR REPLACE FUNCTION public.ensure_verifier_wallet(_verifier_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE wid UUID;
BEGIN
  SELECT id INTO wid FROM public.verifier_wallets WHERE verifier_id = _verifier_id;
  IF wid IS NULL THEN
    INSERT INTO public.verifier_wallets(verifier_id) VALUES (_verifier_id) RETURNING id INTO wid;
  END IF;
  RETURN wid;
END $$;

-- Sell one available verified TFN to an account (atomic).
-- Picks a random verified number, marks sold, credits verifier wallet with payout,
-- records commission, returns the assigned number + verifier info.
CREATE OR REPLACE FUNCTION public.claim_and_sell_verified_tfn(
  _account_id UUID,
  _price_ngn NUMERIC,
  _commission_pct NUMERIC
)
RETURNS TABLE(
  tfn_id UUID,
  phone_number TEXT,
  country TEXT,
  verifier_id UUID,
  payout_ngn NUMERIC,
  commission_ngn NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked RECORD;
  _payout NUMERIC;
  _commission NUMERIC;
  _new_balance NUMERIC;
BEGIN
  SELECT id, phone_number, country, verifier_id
    INTO picked
    FROM public.verifier_tfns
   WHERE status = 'verified'
   ORDER BY random()
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF picked.id IS NULL THEN
    RAISE EXCEPTION 'No verified numbers available';
  END IF;

  _commission := ROUND(_price_ngn * _commission_pct / 100.0, 2);
  _payout := _price_ngn - _commission;

  UPDATE public.verifier_tfns
     SET status = 'sold',
         sold_to_account_id = _account_id,
         sold_at = now(),
         sale_price_ngn = _price_ngn,
         commission_ngn = _commission,
         payout_ngn = _payout,
         updated_at = now()
   WHERE id = picked.id;

  PERFORM public.ensure_verifier_wallet(picked.verifier_id);

  UPDATE public.verifier_wallets
     SET balance_ngn = balance_ngn + _payout,
         lifetime_earned_ngn = lifetime_earned_ngn + _payout,
         updated_at = now()
   WHERE verifier_id = picked.verifier_id
  RETURNING balance_ngn INTO _new_balance;

  INSERT INTO public.verifier_transactions(verifier_id, type, amount_ngn, balance_after, tfn_id, description)
    VALUES (picked.verifier_id, 'sale_credit', _payout, _new_balance, picked.id,
            'Sale of ' || picked.phone_number);

  RETURN QUERY SELECT picked.id, picked.phone_number, picked.country, picked.verifier_id, _payout, _commission;
END $$;

-- Mark a withdrawal paid: debits wallet, logs transaction.
CREATE OR REPLACE FUNCTION public.mark_verifier_withdrawal_paid(
  _withdrawal_id UUID,
  _admin_note TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wd RECORD;
  _new_balance NUMERIC;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO wd FROM public.verifier_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF wd.id IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF wd.status <> 'pending' THEN RAISE EXCEPTION 'Withdrawal already %', wd.status; END IF;

  UPDATE public.verifier_wallets
     SET balance_ngn = balance_ngn - wd.amount_ngn,
         updated_at = now()
   WHERE verifier_id = wd.verifier_id
  RETURNING balance_ngn INTO _new_balance;

  IF _new_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF _new_balance < 0 THEN
    UPDATE public.verifier_wallets SET balance_ngn = balance_ngn + wd.amount_ngn WHERE verifier_id = wd.verifier_id;
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.verifier_withdrawals
     SET status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         admin_note = COALESCE(_admin_note, admin_note),
         updated_at = now()
   WHERE id = _withdrawal_id;

  INSERT INTO public.verifier_transactions(verifier_id, type, amount_ngn, balance_after, withdrawal_id, description)
    VALUES (wd.verifier_id, 'withdrawal_debit', -wd.amount_ngn, _new_balance, _withdrawal_id,
            'Withdrawal paid');

  RETURN _new_balance;
END $$;

-- Reject a pending withdrawal (no wallet movement)
CREATE OR REPLACE FUNCTION public.reject_verifier_withdrawal(
  _withdrawal_id UUID,
  _admin_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.verifier_withdrawals
     SET status = 'rejected',
         admin_note = _admin_note,
         updated_at = now()
   WHERE id = _withdrawal_id AND status = 'pending';
END $$;


-- ============================================================
-- migration: 20260703122352_3699042d-99b4-4f1c-ad1b-6dfb08c96915.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.verifier_signup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.verifier_signup_codes TO service_role;

ALTER TABLE public.verifier_signup_codes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS verifier_signup_codes_email_lower_idx
  ON public.verifier_signup_codes (lower(email));

CREATE INDEX IF NOT EXISTS verifier_signup_codes_expires_idx
  ON public.verifier_signup_codes (expires_at);

DROP POLICY IF EXISTS "Service role can manage verifier signup codes" ON public.verifier_signup_codes;
CREATE POLICY "Service role can manage verifier signup codes"
  ON public.verifier_signup_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_verifier_signup_codes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_verifier_signup_codes_updated_at ON public.verifier_signup_codes;
CREATE TRIGGER update_verifier_signup_codes_updated_at
  BEFORE UPDATE ON public.verifier_signup_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_verifier_signup_codes_updated_at();

-- ============================================================
-- migration: 20260703122630_81096a39-ff23-4f4d-82da-a6eed4a80b4c.sql
-- ============================================================
REVOKE ALL ON public.verifier_signup_codes FROM PUBLIC;
REVOKE ALL ON public.verifier_signup_codes FROM anon;
REVOKE ALL ON public.verifier_signup_codes FROM authenticated;
GRANT ALL ON public.verifier_signup_codes TO service_role;

-- ============================================================
-- migration: 20260703122723_86823377-0c5c-4c43-b726-55d9f0538d98.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_signup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.account_signup_codes TO service_role;

ALTER TABLE public.account_signup_codes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS account_signup_codes_email_lower_idx
  ON public.account_signup_codes (lower(email));

CREATE INDEX IF NOT EXISTS account_signup_codes_expires_idx
  ON public.account_signup_codes (expires_at);

DROP POLICY IF EXISTS "Service role can manage account signup codes" ON public.account_signup_codes;
CREATE POLICY "Service role can manage account signup codes"
  ON public.account_signup_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_account_signup_codes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_account_signup_codes_updated_at ON public.account_signup_codes;
CREATE TRIGGER update_account_signup_codes_updated_at
  BEFORE UPDATE ON public.account_signup_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_signup_codes_updated_at();

REVOKE ALL ON public.account_signup_codes FROM PUBLIC;
REVOKE ALL ON public.account_signup_codes FROM anon;
REVOKE ALL ON public.account_signup_codes FROM authenticated;
GRANT ALL ON public.account_signup_codes TO service_role;

-- ============================================================
-- migration: 20260703123354_7da6470b-d36e-4d85-a6cc-909fb4224f37.sql
-- ============================================================
ALTER TYPE public.verifier_tfn_status ADD VALUE IF NOT EXISTS 'assigned' BEFORE 'pending_verification';

-- ============================================================
-- migration: 20260703143801_f82bedea-0966-412e-9685-5f37f0e01a68.sql
-- ============================================================

ALTER TABLE public.verifier_tfns
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at  timestamptz;

ALTER TABLE public.sender_assets
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at  timestamptz;

-- Backfill best-effort from current status
UPDATE public.verifier_tfns SET submitted_at = COALESCE(submitted_at, updated_at)
  WHERE status IN ('pending_verification','verified','rejected','sold') AND submitted_at IS NULL;
UPDATE public.verifier_tfns SET verified_at = COALESCE(verified_at, updated_at)
  WHERE status IN ('verified','sold') AND verified_at IS NULL;
UPDATE public.verifier_tfns SET rejected_at = COALESCE(rejected_at, updated_at)
  WHERE status = 'rejected' AND rejected_at IS NULL;

UPDATE public.sender_assets SET submitted_at = COALESCE(submitted_at, last_synced_at, updated_at)
  WHERE verification_status IN ('submitted','in_review','verified','rejected') AND submitted_at IS NULL;
UPDATE public.sender_assets SET in_review_at = COALESCE(in_review_at, last_synced_at, updated_at)
  WHERE verification_status IN ('in_review','verified','rejected') AND in_review_at IS NULL;
UPDATE public.sender_assets SET verified_at = COALESCE(verified_at, last_synced_at, updated_at)
  WHERE verification_status = 'verified' AND verified_at IS NULL;
UPDATE public.sender_assets SET rejected_at = COALESCE(rejected_at, last_synced_at, updated_at)
  WHERE verification_status = 'rejected' AND rejected_at IS NULL;

-- Idempotency log for Twilio webhooks
CREATE TABLE IF NOT EXISTS public.twilio_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_hash text NOT NULL UNIQUE,
  verification_sid text,
  status text,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.twilio_webhook_events TO service_role;
ALTER TABLE public.twilio_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.twilio_webhook_events FOR SELECT USING (false);


-- ============================================================
-- migration: 20260703162937_aa27660b-7231-4bd2-b014-799fed651c23.sql
-- ============================================================
UPDATE campaigns SET status='queued' WHERE id='3575bb31-a9d4-4cab-bd87-2b2ba7d7ea84' AND status='sending';

-- ============================================================
-- migration: 20260703163730_b679186f-d2aa-415a-809b-f4f02abddc55.sql
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.campaigns REPLICA IDENTITY FULL;

-- ============================================================
-- migration: 20260703164857_ba95a507-f250-44dc-9ea5-93f3b1c55ae5.sql
-- ============================================================
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN (
    'draft',
    'queued',
    'scheduled',
    'sending',
    'sent',
    'paused',
    'paused_low_balance',
    'cancelled',
    'failed',
    'blocked_content'
  ));

-- ============================================================
-- migration: 20260703195753_4d18a7aa-18e3-4472-82ea-4924bcf087b3.sql
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS dispatch_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_campaign_messages(
  _campaign_id UUID,
  _limit INTEGER
)
RETURNS TABLE (
  id UUID,
  phone_e164 TEXT,
  rendered_body TEXT,
  country_code TEXT,
  segments_count INTEGER,
  cost NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimable AS (
    SELECT m.id
    FROM public.messages m
    WHERE m.campaign_id = _campaign_id
      AND (
        m.status = 'queued'
        OR (
          m.status = 'sending'
          AND m.provider_message_id IS NULL
          AND (
            m.dispatch_started_at IS NULL
            OR m.dispatch_started_at < now() - interval '2 minutes'
          )
        )
      )
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  ), claimed AS (
    UPDATE public.messages m
    SET status = 'sending',
        dispatch_started_at = now()
    FROM claimable c
    WHERE m.id = c.id
    RETURNING m.id, m.phone_e164, m.rendered_body, m.country_code, m.segments_count, m.cost
  )
  SELECT claimed.id, claimed.phone_e164, claimed.rendered_body, claimed.country_code, claimed.segments_count, claimed.cost
  FROM claimed;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_campaign_messages(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(UUID, INTEGER) TO service_role;

CREATE INDEX IF NOT EXISTS idx_messages_campaign_dispatch_claim
  ON public.messages(campaign_id, status, dispatch_started_at, cost, created_at);

-- ============================================================
-- migration: 20260703212810_799b9113-0242-4998-b12c-4eb11c0a8cc7.sql
-- ============================================================
-- Telnyx migration: add Telnyx identifiers alongside legacy Twilio columns.
-- We keep the old column names for now (they'll be dropped in a follow-up
-- migration once no code references them) but all new code writes to the
-- telnyx_* columns.

-- ACCOUNTS: per-tenant Telnyx Messaging Profile (replaces subaccount concept)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS telnyx_messaging_profile_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_messaging_profile_created_at TIMESTAMPTZ;

-- SENDER_ASSETS: Telnyx number id + messaging profile id per sender
ALTER TABLE public.sender_assets
  ADD COLUMN IF NOT EXISTS telnyx_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_messaging_profile_id TEXT;

-- Dedicated numbers table (per spec) — one row per provisioned number
CREATE TABLE IF NOT EXISTS public.numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  telnyx_number_id TEXT,
  telnyx_messaging_profile_id TEXT,
  country_code TEXT,
  number_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone_number)
);

CREATE INDEX IF NOT EXISTS numbers_account_idx ON public.numbers(account_id);
CREATE INDEX IF NOT EXISTS numbers_telnyx_id_idx ON public.numbers(telnyx_number_id);

GRANT SELECT ON public.numbers TO authenticated;
GRANT ALL ON public.numbers TO service_role;

ALTER TABLE public.numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own numbers"
  ON public.numbers FOR SELECT TO authenticated
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Admins can view all numbers"
  ON public.numbers FOR SELECT TO authenticated
  USING (public.has_role('admin'));

CREATE TRIGGER numbers_touch_updated_at
  BEFORE UPDATE ON public.numbers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Placeholder table for 10DLC campaign registration (US traffic).
-- Schema only — no flow built yet.
CREATE TABLE IF NOT EXISTS public.tenant_10dlc_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  brand_id TEXT,
  campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  telnyx_brand_id TEXT,
  telnyx_campaign_id TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

GRANT SELECT ON public.tenant_10dlc_registrations TO authenticated;
GRANT ALL ON public.tenant_10dlc_registrations TO service_role;

ALTER TABLE public.tenant_10dlc_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own 10dlc registration"
  ON public.tenant_10dlc_registrations FOR SELECT TO authenticated
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Admins manage 10dlc registrations"
  ON public.tenant_10dlc_registrations FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER tenant_10dlc_touch_updated_at
  BEFORE UPDATE ON public.tenant_10dlc_registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Rename any Twilio-branded platform setting key to Telnyx equivalent
UPDATE public.platform_settings
  SET key = 'telnyx_alert_emails'
  WHERE key = 'twilio_alert_emails';


-- ============================================================
-- migration: 20260703221604_b11cdfb5-3039-4472-959f-8bed5bd7dc55.sql
-- ============================================================

-- Clean up stale Twilio identifiers so Telnyx sends stop passing MG/AC/PN SIDs.

-- 1. Delete legacy Twilio toll-free asset rows (Option A: clean slate).
DELETE FROM public.sender_assets
WHERE sender_kind = 'toll_free'
  AND (
    phone_sid LIKE 'PN%'
    OR messaging_service_sid LIKE 'MG%'
    OR telnyx_phone_number_id IS NULL
  );

-- 2. Null out Twilio-shaped messaging_service_sid on remaining assets so the
--    code auto-provisions/uses a Telnyx messaging profile instead.
UPDATE public.sender_assets
SET messaging_service_sid = NULL
WHERE messaging_service_sid LIKE 'MG%'
   OR messaging_service_sid LIKE 'AC%';

UPDATE public.sender_assets
SET phone_sid = NULL
WHERE phone_sid LIKE 'PN%';

-- 3. Clear stale Twilio subaccount SIDs off accounts so ensureMessagingProfile
--    provisions a fresh Telnyx profile.
UPDATE public.accounts
SET twilio_subaccount_sid = NULL
WHERE twilio_subaccount_sid LIKE 'AC%'
   OR twilio_subaccount_sid LIKE 'MG%';

-- 4. Clear any telnyx_messaging_profile_id that isn't a valid UUID.
UPDATE public.accounts
SET telnyx_messaging_profile_id = NULL
WHERE telnyx_messaging_profile_id IS NOT NULL
  AND telnyx_messaging_profile_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';


-- ============================================================
-- migration: 20260703223041_15cf1d6c-aafa-4802-8478-4820e681850e.sql
-- ============================================================

ALTER TABLE public.sender_assets DROP CONSTRAINT IF EXISTS sender_assets_verification_status_check;
ALTER TABLE public.sender_assets ADD CONSTRAINT sender_assets_verification_status_check
  CHECK (verification_status IN ('pending','submitted','verified','rejected','requires_registration'));

UPDATE public.sender_assets
SET verification_status = 'requires_registration'
WHERE sender_kind = 'sender_id'
  AND verification_status = 'verified'
  AND country_code IN ('US','CA','NG','IN','CN','SA','AE','QA','KW','BH','OM','EG','TR','PH','VN','TH','ID','MY','BD','PK','LK','MA','DZ','TN');


-- ============================================================
-- migration: 20260703224514_c641c837-e5ab-47d3-a9a6-bd86931a561f.sql
-- ============================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS tollfree_setup_fee_paid_at TIMESTAMPTZ;


-- ============================================================
-- migration: 20260703225334_5e1cc580-712d-4104-942d-e72c6e574971.sql
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_used TEXT,
  ADD COLUMN IF NOT EXISTS sender_kind TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS messages_campaign_status_idx
  ON public.messages(campaign_id, status);

CREATE INDEX IF NOT EXISTS messages_campaign_country_idx
  ON public.messages(campaign_id, country_code);


-- ============================================================
-- migration: 20260703232703_3357fbdc-cdf1-4a93-9b26-2ca354803033.sql
-- ============================================================
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS tollfree_setup_fee_due_cents integer NOT NULL DEFAULT 0;

-- ============================================================
-- migration: 20260703232806_e2b86976-562f-48d4-a46e-2b44d7740e7d.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.topup_account(_account_id uuid, _amount numeric, _description text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_balance NUMERIC;
  due_cents INTEGER;
  fee_amount NUMERIC;
  after_fee NUMERIC;
BEGIN
  UPDATE public.accounts SET credit_balance = credit_balance + _amount
    WHERE id = _account_id
    RETURNING credit_balance, tollfree_setup_fee_due_cents INTO new_balance, due_cents;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, description)
    VALUES (_account_id, 'topup', _amount, new_balance, _description);

  -- Auto-settle any deferred toll-free setup fee
  IF COALESCE(due_cents, 0) > 0 THEN
    fee_amount := due_cents::numeric / 100.0;
    IF new_balance >= fee_amount THEN
      UPDATE public.accounts
        SET credit_balance = credit_balance - fee_amount,
            tollfree_setup_fee_due_cents = 0,
            tollfree_setup_fee_paid_at = COALESCE(tollfree_setup_fee_paid_at, now())
        WHERE id = _account_id
        RETURNING credit_balance INTO after_fee;
      INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, description)
        VALUES (_account_id, 'debit', fee_amount, after_fee, 'Toll-free verification setup fee (deferred)');
      new_balance := after_fee;
    END IF;
  END IF;

  RETURN new_balance;
END;
$function$;

-- ============================================================
-- migration: 20260703235913_299f0a2c-d083-4017-bc9f-2fea5bf030cc.sql
-- ============================================================
-- ============================================================
-- Content screening + ToS compliance infrastructure
-- ============================================================

-- 1) content_screening_log ------------------------------------
CREATE TABLE public.content_screening_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  blocked_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('passed','held_for_review','blocked')),
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.content_screening_log TO authenticated;
GRANT ALL ON public.content_screening_log TO service_role;
ALTER TABLE public.content_screening_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own screening log" ON public.content_screening_log
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "Admins read all screening" ON public.content_screening_log
  FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX content_screening_log_account_created_idx
  ON public.content_screening_log(account_id, created_at DESC);
CREATE INDEX content_screening_log_campaign_idx
  ON public.content_screening_log(campaign_id);

-- 2) review_queue ---------------------------------------------
CREATE TABLE public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  blocked_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','auto_approved','expired')),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  auto_approve_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.review_queue TO authenticated;
GRANT ALL ON public.review_queue TO service_role;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own review queue" ON public.review_queue
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "Admins manage review queue" ON public.review_queue
  FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE INDEX review_queue_status_idx ON public.review_queue(status, created_at DESC);
CREATE INDEX review_queue_account_idx ON public.review_queue(account_id, created_at DESC);
CREATE INDEX review_queue_campaign_idx ON public.review_queue(campaign_id);
CREATE TRIGGER review_queue_updated_at BEFORE UPDATE ON public.review_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) blocked_domains ------------------------------------------
CREATE TABLE public.blocked_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  is_shortener BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  allowed_by_accounts UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_domains TO authenticated, anon;
GRANT ALL ON public.blocked_domains TO service_role;
ALTER TABLE public.blocked_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read blocklist" ON public.blocked_domains
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Admins manage blocklist" ON public.blocked_domains
  FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Seed known cloaking shorteners
INSERT INTO public.blocked_domains(domain, is_shortener, reason) VALUES
  ('bit.ly', true, 'URL shortener commonly used for cloaking'),
  ('tinyurl.com', true, 'URL shortener commonly used for cloaking'),
  ('goo.gl', true, 'URL shortener (deprecated by Google)'),
  ('ow.ly', true, 'URL shortener'),
  ('t.co', true, 'URL shortener'),
  ('is.gd', true, 'URL shortener'),
  ('buff.ly', true, 'URL shortener'),
  ('cutt.ly', true, 'URL shortener'),
  ('rebrand.ly', true, 'URL shortener'),
  ('shorturl.at', true, 'URL shortener'),
  ('rb.gy', true, 'URL shortener'),
  ('tiny.cc', true, 'URL shortener'),
  ('lnkd.in', true, 'URL shortener')
ON CONFLICT (domain) DO NOTHING;

-- 4) tos_acceptances (account-level) --------------------------
CREATE TABLE public.tos_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tos_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(tenant_account_id, tos_version)
);
GRANT SELECT, INSERT ON public.tos_acceptances TO authenticated;
GRANT ALL ON public.tos_acceptances TO service_role;
ALTER TABLE public.tos_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own tos acceptances" ON public.tos_acceptances
  FOR SELECT TO authenticated USING (tenant_account_id = auth.uid());
CREATE POLICY "Tenant records own tos acceptance" ON public.tos_acceptances
  FOR INSERT TO authenticated WITH CHECK (tenant_account_id = auth.uid());
CREATE POLICY "Admins read all tos acceptances" ON public.tos_acceptances
  FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX tos_acceptances_tenant_idx ON public.tos_acceptances(tenant_account_id, accepted_at DESC);

-- 5) campaign_tos_acceptances (per-campaign) ------------------
CREATE TABLE public.campaign_tos_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  tenant_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tos_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(campaign_id)
);
GRANT SELECT, INSERT ON public.campaign_tos_acceptances TO authenticated;
GRANT ALL ON public.campaign_tos_acceptances TO service_role;
ALTER TABLE public.campaign_tos_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own campaign tos" ON public.campaign_tos_acceptances
  FOR SELECT TO authenticated USING (tenant_account_id = auth.uid());
CREATE POLICY "Tenant records own campaign tos" ON public.campaign_tos_acceptances
  FOR INSERT TO authenticated WITH CHECK (tenant_account_id = auth.uid());
CREATE POLICY "Admins read all campaign tos" ON public.campaign_tos_acceptances
  FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX campaign_tos_tenant_idx ON public.campaign_tos_acceptances(tenant_account_id, accepted_at DESC);

-- 6) tenant_sending_suspensions -------------------------------
CREATE TABLE public.tenant_sending_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telnyx_profile_id TEXT,
  telnyx_error TEXT
);
GRANT SELECT ON public.tenant_sending_suspensions TO authenticated;
GRANT ALL ON public.tenant_sending_suspensions TO service_role;
ALTER TABLE public.tenant_sending_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own suspensions" ON public.tenant_sending_suspensions
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "Admins manage suspensions" ON public.tenant_sending_suspensions
  FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE INDEX tenant_suspensions_account_idx ON public.tenant_sending_suspensions(account_id, suspended_at DESC);

-- 7) accounts extension: sending pause + current tos version --
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS sending_suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sending_suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS tos_current_version_accepted TEXT;

-- 8) profiles extension: mark high-frequency two-way contacts -
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS two_way_opt_in BOOLEAN NOT NULL DEFAULT false;

-- 9) Allow system fields on accounts to be updated by admin/service ONLY.
-- The existing guard trigger already blocks tenants from touching suspended_at;
-- extend the same protection to the new sending_suspended_* columns.
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.sending_suspended_at IS DISTINCT FROM OLD.sending_suspended_at
     OR NEW.sending_suspended_reason IS DISTINCT FROM OLD.sending_suspended_reason
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
     OR NEW.twilio_subaccount_auth_token_enc IS DISTINCT FROM OLD.twilio_subaccount_auth_token_enc
     OR NEW.subaccount_phone_number IS DISTINCT FROM OLD.subaccount_phone_number
     OR NEW.subaccount_phone_sid IS DISTINCT FROM OLD.subaccount_phone_sid
     OR NEW.subaccount_messaging_service_sid IS DISTINCT FROM OLD.subaccount_messaging_service_sid
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- migration: 20260704003049_8d8614e5-1465-42a0-8341-8e92399668b4.sql
-- ============================================================

-- accounts
ALTER TABLE public.accounts DROP COLUMN IF EXISTS twilio_subaccount_sid;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS twilio_subaccount_auth_token_enc;
ALTER TABLE public.accounts RENAME COLUMN subaccount_phone_sid TO telnyx_number_id;
ALTER TABLE public.accounts RENAME COLUMN subaccount_phone_number TO telnyx_phone_number;
UPDATE public.accounts
   SET telnyx_messaging_profile_id = COALESCE(telnyx_messaging_profile_id, subaccount_messaging_service_sid)
 WHERE telnyx_messaging_profile_id IS NULL AND subaccount_messaging_service_sid IS NOT NULL;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS subaccount_messaging_service_sid;

-- sender_assets
ALTER TABLE public.sender_assets DROP COLUMN IF EXISTS phone_sid;
UPDATE public.sender_assets
   SET telnyx_messaging_profile_id = COALESCE(telnyx_messaging_profile_id, messaging_service_sid)
 WHERE telnyx_messaging_profile_id IS NULL AND messaging_service_sid IS NOT NULL;
ALTER TABLE public.sender_assets DROP COLUMN IF EXISTS messaging_service_sid;
ALTER TABLE public.sender_assets RENAME COLUMN verification_sid TO telnyx_verification_id;

-- verifier_tfns
ALTER TABLE public.verifier_tfns RENAME COLUMN twilio_phone_sid TO telnyx_number_id;
ALTER TABLE public.verifier_tfns RENAME COLUMN twilio_verification_sid TO telnyx_verification_id;

-- Update triggers that referenced the old column names
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.sending_suspended_at IS DISTINCT FROM OLD.sending_suspended_at
     OR NEW.sending_suspended_reason IS DISTINCT FROM OLD.sending_suspended_reason
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
     OR NEW.telnyx_phone_number IS DISTINCT FROM OLD.telnyx_phone_number
     OR NEW.telnyx_number_id IS DISTINCT FROM OLD.telnyx_number_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sender_assets_block_tenant_carrier_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.telnyx_phone_number_id IS DISTINCT FROM OLD.telnyx_phone_number_id
     OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
     OR NEW.telnyx_verification_id IS DISTINCT FROM OLD.telnyx_verification_id
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
  THEN
    RAISE EXCEPTION 'Not allowed to modify carrier-managed sender asset fields';
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================================
-- migration: 20260704003136_c677e1c3-880b-49f3-a063-03f31e3a7f8f.sql
-- ============================================================

ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN phone_sid TO telnyx_number_id;
ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN messaging_service_sid TO telnyx_messaging_profile_id;
ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN verification_sid TO telnyx_verification_id;
ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN twilio_status TO provider_status;
ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN twilio_code TO provider_code;
ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN twilio_more_info TO provider_more_info;
ALTER TABLE public.tollfree_verification_attempts RENAME COLUMN twilio_response TO provider_response;


-- ============================================================
-- migration: 20260704171735_89637924-f203-4162-83ef-938a8d5f9d15.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_sender_asset_from_number_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind TEXT;
  next_status TEXT;
BEGIN
  IF NEW.status IN ('approved','provisioned')
     AND NEW.assigned_phone_number IS NOT NULL
     AND NEW.assigned_phone_number <> ''
  THEN
    kind := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'toll_free'
      ELSE 'local'
    END;

    next_status := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'pending'
      ELSE 'verified'
    END;

    IF EXISTS (
      SELECT 1 FROM public.sender_assets
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number
    ) THEN
      UPDATE public.sender_assets
      SET verification_status = CASE
            WHEN sender_kind = 'toll_free'
             AND telnyx_verification_id IS NOT NULL
             AND verification_status IN ('submitted','in_review','verified','rejected')
            THEN verification_status
            ELSE next_status
          END,
          sender_kind = kind,
          updated_at = now(),
          last_synced_at = now(),
          rejection_reason = CASE WHEN next_status = 'pending' THEN NULL ELSE rejection_reason END,
          friendly_rejection_reason = CASE WHEN next_status = 'pending' THEN NULL ELSE friendly_rejection_reason END
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number;
    ELSE
      INSERT INTO public.sender_assets (
        account_id, country_code, sender_kind, phone_number,
        verification_status, last_synced_at
      ) VALUES (
        NEW.account_id, NEW.country::text, kind, NEW.assigned_phone_number,
        next_status, now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.sender_assets sa
SET verification_status = 'pending',
    rejection_reason = NULL,
    friendly_rejection_reason = NULL,
    last_synced_at = now(),
    updated_at = now()
WHERE sa.sender_kind = 'toll_free'
  AND sa.verification_status = 'verified'
  AND sa.telnyx_verification_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.number_requests nr
    WHERE nr.account_id = sa.account_id
      AND nr.country::text = sa.country_code
      AND nr.assigned_phone_number = sa.phone_number
      AND nr.number_type::text = 'toll_free'
      AND nr.status IN ('approved','provisioned')
  );

-- ============================================================
-- migration: 20260704171751_68b12eef-a52c-4457-973d-2a2a393cd687.sql
-- ============================================================
REVOKE ALL ON FUNCTION public.sync_sender_asset_from_number_request() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- migration: 20260707150417_c3bbbb4b-bec7-4300-8dfb-ddc4ad121afc.sql
-- ============================================================
ALTER TABLE public.sender_assets DROP CONSTRAINT IF EXISTS sender_assets_verification_status_check;
ALTER TABLE public.sender_assets ADD CONSTRAINT sender_assets_verification_status_check
  CHECK (verification_status IN ('pending','submitted','in_review','verified','rejected','requires_registration'));

ALTER TABLE public.sender_assets REPLICA IDENTITY FULL;
ALTER TABLE public.verifier_tfns REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sender_assets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.verifier_tfns;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- migration: 20260707163040_26650ae3-7b06-44bb-9e51-382f6c2867ec.sql
-- ============================================================

-- 1) Extend accounts self-update guard to cover seller/credit fields
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.seller_balance IS DISTINCT FROM OLD.seller_balance
     OR NEW.seller_lifetime_earnings IS DISTINCT FROM OLD.seller_lifetime_earnings
     OR NEW.is_seller IS DISTINCT FROM OLD.is_seller
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.sending_suspended_at IS DISTINCT FROM OLD.sending_suspended_at
     OR NEW.sending_suspended_reason IS DISTINCT FROM OLD.sending_suspended_reason
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
     OR NEW.telnyx_phone_number IS DISTINCT FROM OLD.telnyx_phone_number
     OR NEW.telnyx_number_id IS DISTINCT FROM OLD.telnyx_number_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- Also guard against tenants promoting themselves via INSERT (self-insert policy exists)
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  NEW.credit_balance := 0;
  NEW.seller_balance := 0;
  NEW.seller_lifetime_earnings := 0;
  NEW.is_seller := false;
  NEW.suspended_at := NULL;
  NEW.sending_suspended_at := NULL;
  NEW.sending_suspended_reason := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS accounts_block_sensitive_self_insert ON public.accounts;
CREATE TRIGGER accounts_block_sensitive_self_insert
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_block_sensitive_self_insert();

-- 2) Tighten marketplace_listings seller-insert policy: force safe defaults
DROP POLICY IF EXISTS "Sellers insert own listings" ON public.marketplace_listings;
CREATE POLICY "Sellers insert own listings"
  ON public.marketplace_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_account_id = auth.uid()
    AND status = 'verifying'
    AND buyer_account_id IS NULL
    AND buyer_price_amount IS NULL
    AND seller_payout_amount IS NULL
    AND sold_at IS NULL
  );

-- 3) Revoke EXECUTE from anon on SECURITY DEFINER functions that must not be public
REVOKE EXECUTE ON FUNCTION public.claim_and_sell_verified_tfn(uuid, numeric, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_verifier_wallet(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_verifier_withdrawal_paid(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_verifier_withdrawal(uuid, text) FROM anon, PUBLIC;


-- ============================================================
-- migration: 20260711074645_279a8bfc-4b51-4ea1-a42f-75842acad6df.sql
-- ============================================================
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'queued'::text,
    'sending'::text,
    'sent'::text,
    'delivered'::text,
    'delivery_unconfirmed'::text,
    'failed'::text,
    'undelivered'::text
  ]));

-- ============================================================
-- migration: 20260716084943_d2bc8f13-d10a-4948-b710-e46f8d915ca9.sql
-- ============================================================

CREATE TABLE public.admin_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_push_subscriptions TO service_role;

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own push subs"
  ON public.admin_push_subscriptions
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::app_role) AND auth.uid() = user_id)
  WITH CHECK (public.has_role('admin'::app_role) AND auth.uid() = user_id);

CREATE INDEX admin_push_subs_user_idx ON public.admin_push_subscriptions(user_id);


-- ============================================================
-- migration: 20260720125347_05a78bce-faac-4be7-a381-0fdc1c77d0fe.sql
-- ============================================================

-- Academy schema
CREATE TABLE public.academy_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  level TEXT NOT NULL DEFAULT 'beginner',
  category TEXT NOT NULL DEFAULT 'General',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.academy_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_courses TO authenticated;
GRANT ALL ON public.academy_courses TO service_role;
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published courses"
  ON public.academy_courses FOR SELECT
  USING (is_published = true OR public.has_role('admin'));
CREATE POLICY "Admins manage courses (insert)"
  ON public.academy_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage courses (update)"
  ON public.academy_courses FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage courses (delete)"
  ON public.academy_courses FOR DELETE TO authenticated
  USING (public.has_role('admin'));

CREATE TRIGGER trg_academy_courses_updated
  BEFORE UPDATE ON public.academy_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.academy_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  is_free_preview BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(course_id, slug)
);
GRANT SELECT ON public.academy_lessons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_lessons TO authenticated;
GRANT ALL ON public.academy_lessons TO service_role;
ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read lessons of published courses"
  ON public.academy_lessons FOR SELECT
  USING (
    public.has_role('admin')
    OR EXISTS (SELECT 1 FROM public.academy_courses c WHERE c.id = course_id AND c.is_published = true)
  );
CREATE POLICY "Admins insert lessons"
  ON public.academy_lessons FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins update lessons"
  ON public.academy_lessons FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins delete lessons"
  ON public.academy_lessons FOR DELETE TO authenticated
  USING (public.has_role('admin'));

CREATE TRIGGER trg_academy_lessons_updated
  BEFORE UPDATE ON public.academy_lessons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.academy_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  certificate_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_enrollments TO authenticated;
GRANT SELECT ON public.academy_enrollments TO anon; -- for certificate verification by code
GRANT ALL ON public.academy_enrollments TO service_role;
ALTER TABLE public.academy_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own enrollments"
  ON public.academy_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Anyone can verify certificate by code"
  ON public.academy_enrollments FOR SELECT TO anon
  USING (certificate_code IS NOT NULL);
CREATE POLICY "Users enroll themselves"
  ON public.academy_enrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own enrollment"
  ON public.academy_enrollments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own enrollment"
  ON public.academy_enrollments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE TRIGGER trg_academy_enrollments_updated
  BEFORE UPDATE ON public.academy_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.academy_lesson_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_lesson_progress TO authenticated;
GRANT ALL ON public.academy_lesson_progress TO service_role;
ALTER TABLE public.academy_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own progress"
  ON public.academy_lesson_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Users write own progress"
  ON public.academy_lesson_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own progress"
  ON public.academy_lesson_progress FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- migration: 20260720131152_d7a37edc-1010-4661-a221-df7153404425.sql
-- ============================================================
ALTER TABLE public.academy_lessons ADD COLUMN IF NOT EXISTS prerequisite_lesson_id UUID REFERENCES public.academy_lessons(id) ON DELETE SET NULL;

-- ============================================================
-- migration: 20260720131213_7319962e-0e81-49c2-8373-822f9807f3f3.sql
-- ============================================================

CREATE POLICY "Public read academy covers" ON storage.objects FOR SELECT TO public USING (bucket_id = 'academy-covers');
CREATE POLICY "Admins upload academy covers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'academy-covers' AND public.has_role('admin'));
CREATE POLICY "Admins update academy covers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'academy-covers' AND public.has_role('admin'));
CREATE POLICY "Admins delete academy covers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'academy-covers' AND public.has_role('admin'));


-- ============================================================
-- migration: 20260720131242_c3d13345-e40c-4c86-9aa0-7a2e19cb4d62.sql
-- ============================================================
DROP POLICY IF EXISTS "Public read academy covers" ON storage.objects;
DROP POLICY IF EXISTS "Admins read academy covers" ON storage.objects;
CREATE POLICY "Admins read academy covers" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'academy-covers' AND public.has_role('admin'));

-- ============================================================
-- migration: 20260720141315_789bdbf0-06bd-49ba-ae50-ca6eba37c8b7.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_acting_account_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT m.account_id FROM public.account_members m
      WHERE m.user_id = _user_id AND m.status = 'active'
      ORDER BY m.accepted_at ASC NULLS LAST, m.created_at ASC LIMIT 1),
    _user_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_acting_account_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_workspace_permission(_owner_account_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _owner_account_id = auth.uid() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.account_members m
      WHERE m.account_id = _owner_account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND (m.role = 'admin' OR COALESCE((m.permissions ->> _key)::boolean, false) = true)
    )
  END
$$;
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Team editors can write campaigns" ON public.campaigns;
CREATE POLICY "Team editors can write campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write profiles" ON public.profiles;
CREATE POLICY "Team editors can write profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write contact_lists" ON public.contact_lists;
CREATE POLICY "Team editors can write contact_lists" ON public.contact_lists FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write profile_list_members" ON public.profile_list_members;
CREATE POLICY "Team editors can write profile_list_members" ON public.profile_list_members FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write segments" ON public.segments;
CREATE POLICY "Team editors can write segments" ON public.segments FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write suppressions" ON public.suppressions;
CREATE POLICY "Team editors can write suppressions" ON public.suppressions FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write consents" ON public.consents;
CREATE POLICY "Team editors can write consents" ON public.consents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND public.has_account_access(p.account_id, 'editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND public.has_account_access(p.account_id, 'editor')));

DROP POLICY IF EXISTS "Team editors can write sender_assets" ON public.sender_assets;
CREATE POLICY "Team editors can write sender_assets" ON public.sender_assets FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write sms_thread_messages" ON public.sms_thread_messages;
CREATE POLICY "Team editors can write sms_thread_messages" ON public.sms_thread_messages FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write tenant_10dlc_registrations" ON public.tenant_10dlc_registrations;
CREATE POLICY "Team editors can write tenant_10dlc_registrations" ON public.tenant_10dlc_registrations FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write tollfree_verification_attempts" ON public.tollfree_verification_attempts;
CREATE POLICY "Team editors can write tollfree_verification_attempts" ON public.tollfree_verification_attempts FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can create number_requests" ON public.number_requests;
CREATE POLICY "Team editors can create number_requests" ON public.number_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(account_id, 'editor'));


-- ============================================================
-- migration: 20260720141424_8f74eea1-0ad7-46a1-bf79-2022fddd10b8.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_eligible_profile_count(_audience jsonb)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT count(*)::integer FROM public.eligible_profile_ids(public.get_acting_account_id(auth.uid()), _audience);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids_page(_audience jsonb, _limit integer DEFAULT 1000, _offset integer DEFAULT 0)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT * FROM public.eligible_profile_ids_page(public.get_acting_account_id(auth.uid()), _audience, _limit, _offset);
$$;


-- ============================================================
-- migration: 20260720143916_44c3521b-6336-4eea-a4f5-37828ebea5e2.sql
-- ============================================================

CREATE TABLE public.link_clicks (
  short_code TEXT PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  url TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  first_click_at TIMESTAMPTZ,
  last_click_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX link_clicks_campaign_id_idx ON public.link_clicks(campaign_id);
CREATE INDEX link_clicks_message_id_idx ON public.link_clicks(message_id);
CREATE INDEX link_clicks_account_id_idx ON public.link_clicks(account_id);

GRANT SELECT ON public.link_clicks TO authenticated;
GRANT ALL ON public.link_clicks TO service_role;

ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their link clicks"
  ON public.link_clicks FOR SELECT
  TO authenticated
  USING (
    account_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = public.link_clicks.account_id
        AND am.user_id = auth.uid()
        AND am.status = 'active'
    )
  );


-- ============================================================
-- migration: 20260720144608_4be00f70-63bf-492c-a89d-960cb0e00ebc.sql
-- ============================================================
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS track_links boolean NOT NULL DEFAULT true;

-- ============================================================
-- migration: 20260720210251_c0a71b4e-83c5-424d-a0b0-379462b84a9f.sql
-- ============================================================

-- Shared toll-free pool: one approved TFN reused across many tenants.
ALTER TABLE public.sender_assets
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sender_assets_phone_idx
  ON public.sender_assets(phone_number)
  WHERE phone_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shared_tollfree_pool (
  phone_number text PRIMARY KEY,
  country_code text NOT NULL DEFAULT 'US',
  telnyx_phone_number_id text,
  telnyx_messaging_profile_id text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shared_tollfree_pool TO authenticated;
GRANT ALL ON public.shared_tollfree_pool TO service_role;

ALTER TABLE public.shared_tollfree_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shared tfn pool"
  ON public.shared_tollfree_pool FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

CREATE POLICY "admins write shared tfn pool"
  ON public.shared_tollfree_pool FOR ALL
  TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE OR REPLACE FUNCTION public.shared_tollfree_pool_touch()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_tollfree_pool_touch ON public.shared_tollfree_pool;
CREATE TRIGGER shared_tollfree_pool_touch
  BEFORE UPDATE ON public.shared_tollfree_pool
  FOR EACH ROW EXECUTE FUNCTION public.shared_tollfree_pool_touch();


-- ============================================================
-- migration: 20260721151135_72284085-7954-4ab7-be8f-d74ac5915c4f.sql
-- ============================================================
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_credits_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_credits_check CHECK (credits >= 0);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status = ANY (ARRAY['pending','paid','failed','cancelled','refunded','refund_pending']));

-- ============================================================
-- migration: 20260721212644_0781b25e-996a-47a6-9a4a-669b9349b814.sql
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP FUNCTION IF EXISTS public.eligible_profile_ids_page(uuid, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.my_eligible_profile_ids_page(jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.eligible_profile_ids(uuid, jsonb);

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
    AND NOT EXISTS (SELECT 1 FROM excluded x WHERE x.pid = p.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.eligible_profile_ids_page(
  _account_id uuid,
  _audience jsonb,
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.eligible_profile_ids(_account_id, _audience)
  ORDER BY profile_id
  OFFSET GREATEST(_offset, 0)
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids_page(_audience jsonb, _limit integer DEFAULT 1000, _offset integer DEFAULT 0)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text, custom_fields jsonb)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.eligible_profile_ids_page(public.get_acting_account_id(auth.uid()), _audience, _limit, _offset);
$$;

REVOKE ALL ON FUNCTION public.eligible_profile_ids(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids_page(uuid, jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_eligible_profile_ids_page(jsonb, integer, integer) TO authenticated;


-- ============================================================
-- migration: 20260721213808_18065072-df8c-41ae-87f9-7ca815f32701.sql
-- ============================================================

-- The public wrappers my_eligible_profile_count / my_eligible_profile_ids_page
-- run as SECURITY INVOKER and internally call public.eligible_profile_ids,
-- but execute privilege on that helper had been revoked from authenticated,
-- so every call from the campaign builder failed with permission denied and
-- the UI silently rendered 0 eligible recipients.
GRANT EXECUTE ON FUNCTION public.eligible_profile_ids(uuid, jsonb) TO authenticated;


-- ============================================================
-- migration: 20260722174618_4595c581-2a22-44af-97f4-c38185dcac39.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  unconfirmed bigint,
  queued bigint,
  cost numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric
  FROM public.messages m
  WHERE m.campaign_id IS NOT NULL
    AND public.has_role('admin'::app_role)
  GROUP BY m.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO authenticated, service_role;


-- ============================================================
-- migration: 20260722174655_e41ea881-39ca-40c0-a4e8-8a8ad7da656f.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  unconfirmed bigint,
  queued bigint,
  cost numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric
  FROM public.messages m
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;


-- ============================================================
-- migration: 20260722174918_ce34e677-5d17-462b-909f-411603440e36.sql
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_campaign_stats();

CREATE FUNCTION public.admin_campaign_stats()
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  unconfirmed bigint,
  queued bigint,
  cost numeric,
  carrier_cost numeric,
  segments bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;


-- ============================================================
-- migration: 20260722201257_32bb7aa5-7050-4856-86a2-a5710d99e4cb.sql
-- ============================================================

CREATE TABLE public.telnyx_transactions_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount numeric(12,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  category text,
  description text,
  reference text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX telnyx_txn_import_occurred_idx ON public.telnyx_transactions_import(occurred_at DESC);
CREATE INDEX telnyx_txn_import_batch_idx ON public.telnyx_transactions_import(batch_id);
CREATE INDEX telnyx_txn_import_category_idx ON public.telnyx_transactions_import(category);

GRANT SELECT, INSERT, DELETE ON public.telnyx_transactions_import TO authenticated;
GRANT ALL ON public.telnyx_transactions_import TO service_role;

ALTER TABLE public.telnyx_transactions_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read telnyx txn import"
  ON public.telnyx_transactions_import FOR SELECT
  TO authenticated USING (public.has_role('admin'));

CREATE POLICY "Admins write telnyx txn import"
  ON public.telnyx_transactions_import FOR INSERT
  TO authenticated WITH CHECK (public.has_role('admin'));

CREATE POLICY "Admins delete telnyx txn import"
  ON public.telnyx_transactions_import FOR DELETE
  TO authenticated USING (public.has_role('admin'));

-- Helpful index for TFN drill-down (per-sender query all-time)
CREATE INDEX IF NOT EXISTS messages_sender_used_idx
  ON public.messages(sender_used) WHERE sender_used IS NOT NULL;


-- ============================================================
-- migration: 20260722203007_51856e65-5dd9-4d4a-9fcd-e15d0630094c.sql
-- ============================================================

-- 1) Track whether a message was sent as MMS (has media). Backfill from campaign.media_url.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_mms boolean NOT NULL DEFAULT false;

UPDATE public.messages m
SET is_mms = true
FROM public.campaigns c
WHERE m.campaign_id = c.id
  AND c.media_url IS NOT NULL
  AND m.is_mms = false;

CREATE INDEX IF NOT EXISTS idx_messages_is_mms ON public.messages(is_mms) WHERE is_mms = true;

-- 2) Fix admin_campaign_stats: apply mms_multiplier to carrier_cost when message is MMS.
DROP FUNCTION IF EXISTS public.admin_campaign_stats();
CREATE FUNCTION public.admin_campaign_stats()
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  unconfirmed bigint,
  queued bigint,
  cost numeric,
  carrier_cost numeric,
  segments bigint,
  mms_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(
      COALESCE(cr.cost_price,0)
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;
REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;


-- ============================================================
-- migration: 20260722204739_c6e1b278-beb0-4438-b529-cfe5bfe3d52b.sql
-- ============================================================

ALTER TABLE public.country_rates
  ADD COLUMN IF NOT EXISTS mms_cost_multiplier numeric(6,2) NOT NULL DEFAULT 3.0;

UPDATE public.country_rates SET mms_cost_multiplier = mms_multiplier
  WHERE mms_cost_multiplier = 3.0 AND mms_multiplier IS NOT NULL AND mms_multiplier <> 3.0;

UPDATE public.country_rates
  SET mms_cost_multiplier = 6.0, mms_multiplier = 6.0, updated_at = now()
  WHERE country_code = 'US';

UPDATE public.country_rates
  SET mms_cost_multiplier = 4.0, mms_multiplier = 5.0, updated_at = now()
  WHERE country_code = 'CA';

DROP FUNCTION IF EXISTS public.admin_campaign_stats();

CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
RETURNS TABLE (
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  delivery_unconfirmed bigint,
  queued bigint,
  tenant_cost numeric,
  telnyx_cost numeric,
  segments bigint,
  mms_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(
      COALESCE(cr.cost_price,0)
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;

DO $$
DECLARE
  v_account uuid := '73d366b2-d9e0-4fb3-8635-a3707505ced0';
  v_delta numeric := 0;
  v_msgs int := 0;
  v_new_balance numeric;
  v_already_charged boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE account_id = v_account
      AND type = 'debit'
      AND description LIKE 'MMS pricing correction%'
  ) INTO v_already_charged;

  IF v_already_charged THEN
    RAISE NOTICE 'MMS correction already applied to %', v_account;
    RETURN;
  END IF;

  SELECT count(*), coalesce(count(*) * 0.024, 0)
  INTO v_msgs, v_delta
  FROM public.messages m
  JOIN public.campaigns c ON c.id = m.campaign_id
  WHERE c.account_id = v_account
    AND m.is_mms = true
    AND m.status IN ('delivered','sent','delivery_unconfirmed');

  IF v_msgs = 0 THEN
    RAISE NOTICE 'No MMS to correct for %', v_account;
    RETURN;
  END IF;

  UPDATE public.accounts
    SET credit_balance = credit_balance - v_delta,
        updated_at = now()
    WHERE id = v_account
    RETURNING credit_balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (account_id, type, amount, balance_after, description)
  VALUES (
    v_account,
    'debit',
    v_delta,
    v_new_balance,
    format('MMS pricing correction: %s successful MMS × $0.024 additional carrier cost (previous rate was below Telnyx cost). New MMS price is $0.048/message going forward.', v_msgs)
  );

  UPDATE public.messages m
    SET cost = COALESCE(m.cost,0) + 0.024
    FROM public.campaigns c
    WHERE c.id = m.campaign_id
      AND c.account_id = v_account
      AND m.is_mms = true
      AND m.status IN ('delivered','sent','delivery_unconfirmed');
END $$;


-- ============================================================
-- migration: 20260723074555_77bb1e3d-f974-47e5-bc0b-8ffa00afd099.sql
-- ============================================================

DO $$
DECLARE
  v_account uuid := '73d366b2-d9e0-4fb3-8635-a3707505ced0';
  v_refund numeric := 59.32;
  v_new_balance numeric;
BEGIN
  UPDATE public.accounts
     SET credit_balance = credit_balance + v_refund,
         updated_at = now()
   WHERE id = v_account
  RETURNING credit_balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (account_id, type, amount, balance_after, description)
  VALUES (
    v_account,
    'topup',
    v_refund,
    v_new_balance,
    'MMS pricing adjustment refund: recalculated at $0.04 per MMS. Refund of $0.008 × 7415 successful MMS = $59.32.'
  );
END $$;


-- ============================================================
-- migration: 20260724083038_9d431ffd-808f-45bc-8648-a64b27aaadb1.sql
-- ============================================================
-- Allow preview shortlinks (created in the campaign builder before any message row exists)
ALTER TABLE public.link_clicks
  ALTER COLUMN message_id DROP NOT NULL;

-- Also allow the campaign column to be null: preview links created before a
-- campaign row is autosaved need to attach later at dispatch time.
ALTER TABLE public.link_clicks
  ALTER COLUMN campaign_id DROP NOT NULL;

-- $50 goodwill credit refund for PRINCESS POLLY (afoo moafo).
SELECT public.topup_account(
  '225a5d8a-abad-4637-9b2a-baa5eab2df3f'::uuid,
  50.00,
  'Goodwill credit refund'
);

-- ============================================================
-- migration: 20260729131054_4b4e7ac6-4d70-412d-9c87-935ad4d7d541.sql
-- ============================================================
CREATE INDEX IF NOT EXISTS messages_campaign_created_idx
  ON public.messages (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_phone_created_idx
  ON public.messages (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_phone_sender_created_idx
  ON public.messages (phone_e164, sender_used, created_at DESC)
  WHERE sender_used IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_thread_messages_account_direction_created_idx
  ON public.sms_thread_messages (account_id, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_thread_messages_phone_direction_created_idx
  ON public.sms_thread_messages (phone_e164, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_thread_messages_provider_sid_idx
  ON public.sms_thread_messages (provider_sid)
  WHERE provider_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_account_created_idx
  ON public.profiles (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_list_members_list_profile_idx
  ON public.profile_list_members (list_id, profile_id);

CREATE INDEX IF NOT EXISTS consents_profile_channel_idx
  ON public.consents (profile_id, channel);

CREATE INDEX IF NOT EXISTS suppressions_account_phone_idx
  ON public.suppressions (account_id, phone_e164);

-- ============================================================
-- migration: 20260729131327_f3d18795-8bbe-4936-bf79-a479ac9254da.sql
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_thread_messages TO authenticated;

-- ============================================================
-- migration: 20260729165147_f90ff933-fb68-47ea-a31a-06355029b7c5.sql
-- ============================================================
GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.campaigns TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.contact_lists TO authenticated;
GRANT SELECT ON public.sms_thread_messages TO authenticated;

GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.contact_lists TO service_role;
GRANT ALL ON public.sms_thread_messages TO service_role;

-- ============================================================
-- migration: 20260729193941_612fe329-e7de-42ff-8550-cab78a4d5f5c.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res jsonb;
BEGIN
  IF NOT public.has_role('admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT jsonb_build_object(
    'money_in', (
      SELECT jsonb_build_object(
        'confirmed_credits', COALESCE(SUM(credits) FILTER (WHERE status = 'paid'), 0),
        'confirmed_count',   COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0),
        'pending_credits',   COALESCE(SUM(credits) FILTER (WHERE status = 'pending'), 0),
        'pending_count',     COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0),
        'failed_count',      COALESCE(COUNT(*) FILTER (WHERE status IN ('failed','cancelled')), 0),
        'last_30d',          COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '30 days'), 0),
        'last_7d',           COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '7 days'), 0)
      ) FROM public.payments
    ),
    'by_provider', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT provider, COUNT(*) AS payments, SUM(credits) AS credits
        FROM public.payments WHERE status='paid'
        GROUP BY provider ORDER BY SUM(credits) DESC
      ) x
    ),
    'ledger', (
      SELECT jsonb_build_object(
        'topups',   COALESCE(SUM(amount) FILTER (WHERE type='topup'), 0),
        'debits',   COALESCE(SUM(amount) FILTER (WHERE type='debit'), 0),
        'refunds',  COALESCE(SUM(amount) FILTER (WHERE type='refund'), 0),
        'debits_30d', COALESCE(SUM(amount) FILTER (WHERE type='debit' AND created_at >= now() - interval '30 days'), 0)
      ) FROM public.credit_transactions
    ),
    'wallets', (
      SELECT jsonb_build_object(
        'unused_credits', COALESCE(SUM(credit_balance), 0),
        'negative_balances', COALESCE(SUM(credit_balance) FILTER (WHERE credit_balance < 0), 0),
        'tenants', COUNT(*)
      ) FROM public.accounts
    ),
    'usage', (
      SELECT jsonb_build_object(
        'messages',     COALESCE(COUNT(*), 0),
        'segments',     COALESCE(SUM(COALESCE(m.segments_count,1)), 0),
        'mms',          COALESCE(COUNT(*) FILTER (WHERE m.is_mms), 0),
        'tenant_spend', COALESCE(SUM(m.cost), 0),
        'carrier_cost', COALESCE(SUM(
            COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END), 0),
        'tenant_spend_30d', COALESCE(SUM(m.cost) FILTER (WHERE m.created_at >= now() - interval '30 days'), 0),
        'carrier_cost_30d', COALESCE(SUM(
            COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END)
            FILTER (WHERE m.created_at >= now() - interval '30 days'), 0)
      )
      FROM public.messages m
      LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
      WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    ),
    'by_country', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT COALESCE(m.country_code,'??') AS country,
               COUNT(*) AS messages,
               SUM(COALESCE(m.segments_count,1)) AS segments,
               COUNT(*) FILTER (WHERE m.is_mms) AS mms,
               SUM(m.cost) AS tenant_spend,
               SUM(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
                   * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost
        FROM public.messages m
        LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
        WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
        GROUP BY 1 ORDER BY SUM(m.cost) DESC NULLS LAST LIMIT 30
      ) x
    )
  ) INTO res;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.admin_finance_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_finance_tenants()
RETURNS TABLE(
  account_id uuid, label text, email text, balance numeric,
  funded numeric, funded_payments bigint, last_funded_at timestamptz,
  pending_funding numeric, spent numeric, refunded numeric,
  messages bigint, carrier_cost numeric, profit numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (SELECT CASE WHEN public.has_role('admin') THEN true
                             ELSE (SELECT true WHERE false) END AS ok),
  pay AS (
    SELECT account_id,
           SUM(credits) FILTER (WHERE status='paid') AS funded,
           COUNT(*) FILTER (WHERE status='paid') AS funded_payments,
           MAX(paid_at) FILTER (WHERE status='paid') AS last_funded_at,
           SUM(credits) FILTER (WHERE status='pending') AS pending_funding
    FROM public.payments GROUP BY account_id
  ),
  led AS (
    SELECT account_id,
           SUM(amount) FILTER (WHERE type='debit') AS spent,
           SUM(amount) FILTER (WHERE type='refund') AS refunded
    FROM public.credit_transactions GROUP BY account_id
  ),
  msg AS (
    SELECT c.account_id,
           COUNT(*) AS messages,
           SUM(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           SUM(m.cost) AS tenant_spend
    FROM public.messages m
    JOIN public.campaigns c ON c.id = m.campaign_id
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    GROUP BY c.account_id
  )
  SELECT a.id,
         COALESCE(NULLIF(a.legal_business_name,''), NULLIF(a.company,''), NULLIF(a.full_name,''), a.email, a.id::text),
         COALESCE(a.contact_email, a.email, ''),
         COALESCE(a.credit_balance,0),
         COALESCE(pay.funded,0), COALESCE(pay.funded_payments,0), pay.last_funded_at,
         COALESCE(pay.pending_funding,0),
         COALESCE(led.spent,0), COALESCE(led.refunded,0),
         COALESCE(msg.messages,0), COALESCE(msg.carrier_cost,0),
         COALESCE(msg.tenant_spend,0) - COALESCE(msg.carrier_cost,0)
  FROM public.accounts a
  CROSS JOIN guard
  LEFT JOIN pay ON pay.account_id = a.id
  LEFT JOIN led ON led.account_id = a.id
  LEFT JOIN msg ON msg.account_id = a.id
  ORDER BY COALESCE(pay.funded,0) DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_finance_tenants() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_finance_tenants() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_finance_daily(_days integer DEFAULT 30)
RETURNS TABLE(day date, funded numeric, spent numeric, carrier_cost numeric, messages bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (SELECT CASE WHEN public.has_role('admin') THEN true ELSE (SELECT true WHERE false) END AS ok),
  d AS (
    SELECT generate_series(
      (now() - make_interval(days => GREATEST(_days,1)))::date, now()::date, interval '1 day')::date AS day
  ),
  f AS (
    SELECT COALESCE(paid_at, created_at)::date AS day, SUM(credits) AS funded
    FROM public.payments WHERE status='paid'
      AND COALESCE(paid_at, created_at) >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  ),
  s AS (
    SELECT created_at::date AS day, SUM(amount) AS spent
    FROM public.credit_transactions WHERE type='debit'
      AND created_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  ),
  c AS (
    SELECT m.created_at::date AS day,
           SUM(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           COUNT(*) AS messages
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
      AND m.created_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  )
  SELECT d.day, COALESCE(f.funded,0), COALESCE(s.spent,0), COALESCE(c.carrier_cost,0), COALESCE(c.messages,0)
  FROM d CROSS JOIN guard
  LEFT JOIN f ON f.day = d.day
  LEFT JOIN s ON s.day = d.day
  LEFT JOIN c ON c.day = d.day
  ORDER BY d.day;
$$;

REVOKE ALL ON FUNCTION public.admin_finance_daily(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_finance_daily(integer) TO authenticated, service_role;


-- ============================================================
-- migration: 20260729195940_42832879-e580-4d82-b8e5-f0d7e57cd97f.sql
-- ============================================================
-- 1. Pin search_path on functions that lack it (0011_function_search_path_mutable)
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.shared_tollfree_pool_touch() SET search_path = public;

-- 2. admin_campaign_stats is SECURITY DEFINER but had no role check of its own.
--    Add the same admin guard used by the other admin_* finance reports.
CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
 RETURNS TABLE(campaign_id uuid, total bigint, delivered bigint, failed bigint, sent bigint, delivery_unconfirmed bigint, queued bigint, tenant_cost numeric, telnyx_cost numeric, segments bigint, mms_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(
      COALESCE(cr.cost_price,0)
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  CROSS JOIN (SELECT 1 WHERE public.has_role('admin')) AS guard
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$function$;

-- 3. Revoke anonymous/PUBLIC EXECUTE on SECURITY DEFINER functions
--    (0028_anon_security_definer_function_executable)

-- 3a. Internal trigger helpers: never called directly by any client.
--     Trigger execution does not require EXECUTE on the invoking role.
REVOKE ALL ON FUNCTION public.accounts_block_sensitive_self_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared_tollfree_pool_touch() FROM PUBLIC, anon, authenticated;

-- 3b. Admin-only reporting functions: signed-in callers only, guarded internally by has_role('admin').
REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finance_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finance_tenants() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finance_daily(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_tenants() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_daily(integer) TO authenticated, service_role;

-- 3c. Tenant helpers used by RLS policies: required by signed-in users only.
--     No anon-facing policy references these (verified against pg_policy).
REVOKE ALL ON FUNCTION public.get_acting_account_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_permission(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_acting_account_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, text) TO authenticated, service_role;

-- 4. country_rates: internal cost_price / markup_percent must never be reachable
--    by signed-out callers. anon currently holds INSERT/UPDATE/DELETE/TRUNCATE
--    grants (blocked only by absence of a matching policy) - remove them entirely.
REVOKE ALL ON TABLE public.country_rates FROM anon;

-- Keep the admin UI working (reads + rate edits) but drop unused privileges.
REVOKE ALL ON TABLE public.country_rates FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.country_rates TO authenticated;
GRANT ALL ON TABLE public.country_rates TO service_role;

-- The read policy applied to every role (including anon); scope it to signed-in admins.
DROP POLICY IF EXISTS "country_rates admin read" ON public.country_rates;
CREATE POLICY "country_rates admin read"
  ON public.country_rates
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

-- ============================================================
-- migration: 20260729200159_fb019861-5b76-4971-ac5c-2376fbe1ef54.sql
-- ============================================================
-- Shared guard: trusted server access (service_role) OR a signed-in admin.
-- The four admin_* reports are invoked exclusively by server code that has
-- already verified the caller is an admin, so service_role must pass.
CREATE OR REPLACE FUNCTION public.is_admin_or_service()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(current_setting('role', true), '') = 'service_role'
      OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
      OR public.has_role('admin');
$function$;

REVOKE ALL ON FUNCTION public.is_admin_or_service() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_service() TO authenticated, service_role;

-- 1. admin_campaign_stats
CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
 RETURNS TABLE(campaign_id uuid, total bigint, delivered bigint, failed bigint, sent bigint, delivery_unconfirmed bigint, queued bigint, tenant_cost numeric, telnyx_cost numeric, segments bigint, mms_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(
      COALESCE(cr.cost_price,0)
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  CROSS JOIN (SELECT 1 WHERE public.is_admin_or_service()) AS guard
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$function$;

-- 2. admin_finance_summary
CREATE OR REPLACE FUNCTION public.admin_finance_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  res jsonb;
BEGIN
  IF NOT public.is_admin_or_service() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT jsonb_build_object(
    'money_in', (
      SELECT jsonb_build_object(
        'confirmed_credits', COALESCE(SUM(credits) FILTER (WHERE status = 'paid'), 0),
        'confirmed_count',   COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0),
        'pending_credits',   COALESCE(SUM(credits) FILTER (WHERE status = 'pending'), 0),
        'pending_count',     COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0),
        'failed_count',      COALESCE(COUNT(*) FILTER (WHERE status IN ('failed','cancelled')), 0),
        'last_30d',          COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '30 days'), 0),
        'last_7d',           COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '7 days'), 0)
      ) FROM public.payments
    ),
    'by_provider', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT provider, COUNT(*) AS payments, SUM(credits) AS credits
        FROM public.payments WHERE status='paid'
        GROUP BY provider ORDER BY SUM(credits) DESC
      ) x
    ),
    'ledger', (
      SELECT jsonb_build_object(
        'topups',   COALESCE(SUM(amount) FILTER (WHERE type='topup'), 0),
        'debits',   COALESCE(SUM(amount) FILTER (WHERE type='debit'), 0),
        'refunds',  COALESCE(SUM(amount) FILTER (WHERE type='refund'), 0),
        'debits_30d', COALESCE(SUM(amount) FILTER (WHERE type='debit' AND created_at >= now() - interval '30 days'), 0)
      ) FROM public.credit_transactions
    ),
    'wallets', (
      SELECT jsonb_build_object(
        'unused_credits', COALESCE(SUM(credit_balance), 0),
        'negative_balances', COALESCE(SUM(credit_balance) FILTER (WHERE credit_balance < 0), 0),
        'tenants', COUNT(*)
      ) FROM public.accounts
    ),
    'usage', (
      SELECT jsonb_build_object(
        'messages',     COALESCE(COUNT(*), 0),
        'segments',     COALESCE(SUM(COALESCE(m.segments_count,1)), 0),
        'mms',          COALESCE(COUNT(*) FILTER (WHERE m.is_mms), 0),
        'tenant_spend', COALESCE(SUM(m.cost), 0),
        'carrier_cost', COALESCE(SUM(
            COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END), 0),
        'tenant_spend_30d', COALESCE(SUM(m.cost) FILTER (WHERE m.created_at >= now() - interval '30 days'), 0),
        'carrier_cost_30d', COALESCE(SUM(
            COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END)
            FILTER (WHERE m.created_at >= now() - interval '30 days'), 0)
      )
      FROM public.messages m
      LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
      WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    ),
    'by_country', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT COALESCE(m.country_code,'??') AS country,
               COUNT(*) AS messages,
               SUM(COALESCE(m.segments_count,1)) AS segments,
               COUNT(*) FILTER (WHERE m.is_mms) AS mms,
               SUM(m.cost) AS tenant_spend,
               SUM(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
                   * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost
        FROM public.messages m
        LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
        WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
        GROUP BY 1 ORDER BY SUM(m.cost) DESC NULLS LAST LIMIT 30
      ) x
    )
  ) INTO res;

  RETURN res;
END $function$;

-- 3. admin_finance_tenants
CREATE OR REPLACE FUNCTION public.admin_finance_tenants()
 RETURNS TABLE(account_id uuid, label text, email text, balance numeric, funded numeric, funded_payments bigint, last_funded_at timestamp with time zone, pending_funding numeric, spent numeric, refunded numeric, messages bigint, carrier_cost numeric, profit numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT CASE WHEN public.is_admin_or_service() THEN true
                             ELSE (SELECT true WHERE false) END AS ok),
  pay AS (
    SELECT account_id,
           SUM(credits) FILTER (WHERE status='paid') AS funded,
           COUNT(*) FILTER (WHERE status='paid') AS funded_payments,
           MAX(paid_at) FILTER (WHERE status='paid') AS last_funded_at,
           SUM(credits) FILTER (WHERE status='pending') AS pending_funding
    FROM public.payments GROUP BY account_id
  ),
  led AS (
    SELECT account_id,
           SUM(amount) FILTER (WHERE type='debit') AS spent,
           SUM(amount) FILTER (WHERE type='refund') AS refunded
    FROM public.credit_transactions GROUP BY account_id
  ),
  msg AS (
    SELECT c.account_id,
           COUNT(*) AS messages,
           SUM(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           SUM(m.cost) AS tenant_spend
    FROM public.messages m
    JOIN public.campaigns c ON c.id = m.campaign_id
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    GROUP BY c.account_id
  )
  SELECT a.id,
         COALESCE(NULLIF(a.legal_business_name,''), NULLIF(a.company,''), NULLIF(a.full_name,''), a.email, a.id::text),
         COALESCE(a.contact_email, a.email, ''),
         COALESCE(a.credit_balance,0),
         COALESCE(pay.funded,0), COALESCE(pay.funded_payments,0), pay.last_funded_at,
         COALESCE(pay.pending_funding,0),
         COALESCE(led.spent,0), COALESCE(led.refunded,0),
         COALESCE(msg.messages,0), COALESCE(msg.carrier_cost,0),
         COALESCE(msg.tenant_spend,0) - COALESCE(msg.carrier_cost,0)
  FROM public.accounts a
  CROSS JOIN guard
  LEFT JOIN pay ON pay.account_id = a.id
  LEFT JOIN led ON led.account_id = a.id
  LEFT JOIN msg ON msg.account_id = a.id
  ORDER BY COALESCE(pay.funded,0) DESC;
$function$;

-- 4. admin_finance_daily
CREATE OR REPLACE FUNCTION public.admin_finance_daily(_days integer DEFAULT 30)
 RETURNS TABLE(day date, funded numeric, spent numeric, carrier_cost numeric, messages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT CASE WHEN public.is_admin_or_service() THEN true ELSE (SELECT true WHERE false) END AS ok),
  d AS (
    SELECT generate_series(
      (now() - make_interval(days => GREATEST(_days,1)))::date, now()::date, interval '1 day')::date AS day
  ),
  f AS (
    SELECT COALESCE(paid_at, created_at)::date AS day, SUM(credits) AS funded
    FROM public.payments WHERE status='paid'
      AND COALESCE(paid_at, created_at) >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  ),
  s AS (
    SELECT created_at::date AS day, SUM(amount) AS spent
    FROM public.credit_transactions WHERE type='debit'
      AND created_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  ),
  c AS (
    SELECT m.created_at::date AS day,
           SUM(COALESCE(cr.cost_price,0) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           COUNT(*) AS messages
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
      AND m.created_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  )
  SELECT d.day, COALESCE(f.funded,0), COALESCE(s.spent,0), COALESCE(c.carrier_cost,0), COALESCE(c.messages,0)
  FROM d CROSS JOIN guard
  LEFT JOIN f ON f.day = d.day
  LEFT JOIN s ON s.day = d.day
  LEFT JOIN c ON c.day = d.day
  ORDER BY d.day;
$function$;

-- These four reports are reached only through the admin pages (trusted server
-- code). Remove the direct signed-in call surface entirely.
REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_finance_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_finance_tenants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_finance_daily(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_tenants() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_daily(integer) TO service_role;

-- ============================================================
-- migration: 20260729202437_ab1bb4b8-c1d2-44c4-b970-c61a6359284c.sql
-- ============================================================
ALTER TABLE public.country_rates
  ADD COLUMN IF NOT EXISTS passthrough_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inbound_cost numeric NOT NULL DEFAULT 0;

UPDATE public.country_rates SET cost_price = 0.0095, passthrough_fee = 0.0040, inbound_cost = 0.0080 WHERE country_code = 'US';

-- ---------------------------------------------------------------- campaign stats
DROP FUNCTION IF EXISTS public.admin_campaign_stats();
CREATE FUNCTION public.admin_campaign_stats()
 RETURNS TABLE(campaign_id uuid, total bigint, delivered bigint, failed bigint, sent bigint, delivery_unconfirmed bigint, queued bigint, tenant_cost numeric, reserved_cost numeric, telnyx_cost numeric, segments bigint, mms_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost) FILTER (WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')),0)::numeric,
    coalesce(sum(m.cost) FILTER (WHERE m.status IN ('queued','sending','pending')),0)::numeric,
    coalesce(sum(
      (COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0))
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ) FILTER (WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  CROSS JOIN (SELECT 1 WHERE public.is_admin_or_service()) AS guard
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_campaign_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO authenticated, service_role;

-- ---------------------------------------------------------------- finance summary
CREATE OR REPLACE FUNCTION public.admin_finance_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  res jsonb;
BEGIN
  IF NOT public.is_admin_or_service() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT jsonb_build_object(
    'money_in', (
      SELECT jsonb_build_object(
        'confirmed_credits', COALESCE(SUM(credits) FILTER (WHERE status = 'paid'), 0),
        'confirmed_count',   COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0),
        'pending_credits',   COALESCE(SUM(credits) FILTER (WHERE status = 'pending'), 0),
        'pending_count',     COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0),
        'failed_count',      COALESCE(COUNT(*) FILTER (WHERE status IN ('failed','cancelled')), 0),
        'last_30d',          COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '30 days'), 0),
        'last_7d',           COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '7 days'), 0)
      ) FROM public.payments
    ),
    'by_provider', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT provider, COUNT(*) AS payments, SUM(credits) AS credits
        FROM public.payments WHERE status='paid'
        GROUP BY provider ORDER BY SUM(credits) DESC
      ) x
    ),
    'ledger', (
      SELECT jsonb_build_object(
        'topups',   COALESCE(SUM(amount) FILTER (WHERE type='topup'), 0),
        'debits',   COALESCE(SUM(amount) FILTER (WHERE type='debit'), 0),
        'refunds',  COALESCE(SUM(amount) FILTER (WHERE type='refund'), 0),
        'debits_30d', COALESCE(SUM(amount) FILTER (WHERE type='debit' AND created_at >= now() - interval '30 days'), 0)
      ) FROM public.credit_transactions
    ),
    'wallets', (
      SELECT jsonb_build_object(
        'unused_credits', COALESCE(SUM(credit_balance), 0),
        'negative_balances', COALESCE(SUM(credit_balance) FILTER (WHERE credit_balance < 0), 0),
        'tenants', COUNT(*)
      ) FROM public.accounts
    ),
    'usage', (
      SELECT jsonb_build_object(
        'messages',     COALESCE(COUNT(*), 0),
        'segments',     COALESCE(SUM(COALESCE(m.segments_count,1)), 0),
        'mms',          COALESCE(COUNT(*) FILTER (WHERE m.is_mms), 0),
        'tenant_spend', COALESCE(SUM(m.cost), 0),
        'carrier_cost', COALESCE(SUM(
            (COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END), 0),
        'tenant_spend_30d', COALESCE(SUM(m.cost) FILTER (WHERE m.created_at >= now() - interval '30 days'), 0),
        'carrier_cost_30d', COALESCE(SUM(
            (COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END)
            FILTER (WHERE m.created_at >= now() - interval '30 days'), 0)
      )
      FROM public.messages m
      LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
      WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    ),
    'inbound', (
      SELECT jsonb_build_object(
        'messages', COALESCE(COUNT(*),0),
        'carrier_cost', COALESCE(COUNT(*),0) * COALESCE((SELECT inbound_cost FROM public.country_rates WHERE country_code='US'),0)
      )
      FROM public.sms_thread_messages t
      WHERE t.direction = 'inbound'
    ),
    'by_country', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT COALESCE(m.country_code,'??') AS country,
               COUNT(*) AS messages,
               SUM(COALESCE(m.segments_count,1)) AS segments,
               COUNT(*) FILTER (WHERE m.is_mms) AS mms,
               SUM(m.cost) AS tenant_spend,
               SUM((COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
                   * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost
        FROM public.messages m
        LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
        WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
        GROUP BY 1 ORDER BY SUM(m.cost) DESC NULLS LAST LIMIT 30
      ) x
    )
  ) INTO res;

  RETURN res;
END $function$;

-- ---------------------------------------------------------------- tenants
CREATE OR REPLACE FUNCTION public.admin_finance_tenants()
 RETURNS TABLE(account_id uuid, label text, email text, balance numeric, funded numeric, funded_payments bigint, last_funded_at timestamp with time zone, pending_funding numeric, spent numeric, refunded numeric, messages bigint, carrier_cost numeric, profit numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT CASE WHEN public.is_admin_or_service() THEN true
                             ELSE (SELECT true WHERE false) END AS ok),
  pay AS (
    SELECT account_id,
           SUM(credits) FILTER (WHERE status='paid') AS funded,
           COUNT(*) FILTER (WHERE status='paid') AS funded_payments,
           MAX(paid_at) FILTER (WHERE status='paid') AS last_funded_at,
           SUM(credits) FILTER (WHERE status='pending') AS pending_funding
    FROM public.payments GROUP BY account_id
  ),
  led AS (
    SELECT account_id,
           SUM(amount) FILTER (WHERE type='debit') AS spent,
           SUM(amount) FILTER (WHERE type='refund') AS refunded
    FROM public.credit_transactions GROUP BY account_id
  ),
  msg AS (
    SELECT c.account_id,
           COUNT(*) AS messages,
           SUM((COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           SUM(m.cost) AS tenant_spend
    FROM public.messages m
    JOIN public.campaigns c ON c.id = m.campaign_id
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    GROUP BY c.account_id
  )
  SELECT a.id,
         COALESCE(NULLIF(a.legal_business_name,''), NULLIF(a.company,''), NULLIF(a.full_name,''), a.email, a.id::text),
         COALESCE(a.contact_email, a.email, ''),
         COALESCE(a.credit_balance,0),
         COALESCE(pay.funded,0), COALESCE(pay.funded_payments,0), pay.last_funded_at,
         COALESCE(pay.pending_funding,0),
         COALESCE(led.spent,0), COALESCE(led.refunded,0),
         COALESCE(msg.messages,0), COALESCE(msg.carrier_cost,0),
         COALESCE(msg.tenant_spend,0) - COALESCE(msg.carrier_cost,0)
  FROM public.accounts a
  CROSS JOIN guard
  LEFT JOIN pay ON pay.account_id = a.id
  LEFT JOIN led ON led.account_id = a.id
  LEFT JOIN msg ON msg.account_id = a.id
  ORDER BY COALESCE(pay.funded,0) DESC;
$function$;

-- ---------------------------------------------------------------- daily
CREATE OR REPLACE FUNCTION public.admin_finance_daily(_days integer DEFAULT 30)
 RETURNS TABLE(day date, funded numeric, spent numeric, carrier_cost numeric, messages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT CASE WHEN public.is_admin_or_service() THEN true ELSE (SELECT true WHERE false) END AS ok),
  d AS (
    SELECT generate_series(
      (now() - make_interval(days => GREATEST(_days,1)))::date, now()::date, interval '1 day')::date AS day
  ),
  f AS (
    SELECT COALESCE(paid_at, created_at)::date AS day, SUM(credits) AS funded
    FROM public.payments WHERE status='paid'
      AND COALESCE(paid_at, created_at) >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  ),
  s AS (
    SELECT created_at::date AS day, SUM(amount) AS spent
    FROM public.credit_transactions WHERE type='debit'
      AND created_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  ),
  c AS (
    SELECT m.created_at::date AS day,
           SUM((COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           COUNT(*) AS messages
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
      AND m.created_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY 1
  )
  SELECT d.day, COALESCE(f.funded,0), COALESCE(s.spent,0), COALESCE(c.carrier_cost,0), COALESCE(c.messages,0)
  FROM d CROSS JOIN guard
  LEFT JOIN f ON f.day = d.day
  LEFT JOIN s ON s.day = d.day
  LEFT JOIN c ON c.day = d.day
  ORDER BY d.day;
$function$;

-- ---------------------------------------------------------------- subsidy report
CREATE OR REPLACE FUNCTION public.admin_margin_audit()
 RETURNS TABLE(account_id uuid, label text, email text, messages bigint, segments bigint, mms_count bigint, charged numeric, true_cost numeric, margin numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT CASE WHEN public.is_admin_or_service() THEN true ELSE (SELECT true WHERE false) END AS ok),
  m AS (
    SELECT c.account_id,
           COUNT(*) AS messages,
           SUM(COALESCE(mm.segments_count,1)) AS segments,
           COUNT(*) FILTER (WHERE mm.is_mms) AS mms_count,
           SUM(mm.cost) AS charged,
           SUM((COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(mm.segments_count,1)
               * CASE WHEN mm.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS true_cost
    FROM public.messages mm
    JOIN public.campaigns c ON c.id = mm.campaign_id
    LEFT JOIN public.country_rates cr ON cr.country_code = mm.country_code
    WHERE mm.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    GROUP BY c.account_id
  )
  SELECT a.id,
         COALESCE(NULLIF(a.legal_business_name,''), NULLIF(a.company,''), NULLIF(a.full_name,''), a.email, a.id::text),
         COALESCE(a.contact_email, a.email, ''),
         m.messages, m.segments, m.mms_count,
         ROUND(COALESCE(m.charged,0), 4),
         ROUND(COALESCE(m.true_cost,0), 4),
         ROUND(COALESCE(m.charged,0) - COALESCE(m.true_cost,0), 4)
  FROM m
  JOIN public.accounts a ON a.id = m.account_id
  CROSS JOIN guard
  ORDER BY (COALESCE(m.charged,0) - COALESCE(m.true_cost,0)) ASC;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_margin_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_margin_audit() TO authenticated, service_role;

-- ============================================================
-- migration: 20260729204510_099a7feb-492a-44a8-b52b-d5c2f4c8838c.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.country_rates_prevent_below_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  sms_true_cost numeric;
  sms_sell numeric;
  mms_true_cost numeric;
  mms_sell numeric;
BEGIN
  IF COALESCE(NEW.active, false) THEN
    sms_true_cost := COALESCE(NEW.cost_price, 0) + COALESCE(NEW.passthrough_fee, 0);
    sms_sell := COALESCE(NEW.sell_price, 0);

    IF sms_true_cost > 0 AND sms_sell < sms_true_cost THEN
      RAISE EXCEPTION 'Sell price cannot be below true SMS cost for %', NEW.country_code;
    END IF;

    mms_true_cost := sms_true_cost * COALESCE(NEW.mms_cost_multiplier, NEW.mms_multiplier, 1);
    mms_sell := sms_sell * COALESCE(NEW.mms_multiplier, 1);

    IF mms_true_cost > 0 AND mms_sell < mms_true_cost THEN
      RAISE EXCEPTION 'MMS price cannot be below true MMS cost for %', NEW.country_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS country_rates_prevent_below_cost_trigger ON public.country_rates;
CREATE TRIGGER country_rates_prevent_below_cost_trigger
BEFORE INSERT OR UPDATE OF active, cost_price, passthrough_fee, sell_price, mms_multiplier, mms_cost_multiplier
ON public.country_rates
FOR EACH ROW
EXECUTE FUNCTION public.country_rates_prevent_below_cost();

UPDATE public.country_rates
SET
  cost_price = 0.0095,
  passthrough_fee = 0.0040,
  inbound_cost = 0.0080,
  sell_price = 0.0271,
  markup_percent = 101,
  mms_multiplier = 1.4760,
  mms_cost_multiplier = 2.3704,
  manual_override = true,
  number_type_used = 'measured_sms',
  updated_at = now()
WHERE country_code = 'US';

-- ============================================================
-- migration: 20260730065614_683c3976-047e-4747-b5a1-4d3fb5e7fd44.sql
-- ============================================================
UPDATE public.platform_settings SET value = '55'::jsonb, updated_at = now() WHERE key = 'default_markup_percent';
INSERT INTO public.platform_settings (key, value)
SELECT 'default_markup_percent', '55'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'default_markup_percent');

UPDATE public.country_rates
SET markup_percent = 55,
    sell_price = round((cost_price + COALESCE(passthrough_fee,0)) * 1.55, 4),
    updated_at = now()
WHERE manual_override = false;

-- ============================================================
-- migration: 20260730121112_90d10aa0-1dbf-46dd-9a16-13eb914983ac.sql
-- ============================================================
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.refund_message_charge(_message_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD;
  acct uuid;
  new_balance numeric;
BEGIN
  SELECT id, campaign_id, cost, sent_at, refunded_at, phone_e164, country_code
    INTO m
    FROM public.messages
    WHERE id = _message_id
    FOR UPDATE;

  IF NOT FOUND THEN RETURN 0; END IF;
  IF m.refunded_at IS NOT NULL THEN RETURN 0; END IF;
  IF m.sent_at IS NULL THEN RETURN 0; END IF;
  IF COALESCE(m.cost, 0) <= 0 THEN RETURN 0; END IF;

  SELECT account_id INTO acct FROM public.campaigns WHERE id = m.campaign_id;
  IF acct IS NULL THEN RETURN 0; END IF;

  UPDATE public.accounts
    SET credit_balance = credit_balance + m.cost
    WHERE id = acct
    RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
  VALUES (acct, 'refund', m.cost, new_balance, m.campaign_id,
          'Refund — undelivered SMS to ' || COALESCE(m.phone_e164, '') || ' (' || COALESCE(m.country_code, '??') || ')');

  UPDATE public.messages SET refunded_at = now() WHERE id = m.id;

  RETURN m.cost;
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_message_charge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_message_charge(uuid) TO service_role;

-- ============================================================
-- migration: 20260730121650_9aa2a56a-8bda-48e5-bf2b-4e046e7fd7d7.sql
-- ============================================================
DROP FUNCTION IF EXISTS public.refund_message_charge(uuid);

-- ============================================================
-- migration: 20260730121756_e90c9b1d-3560-4aea-a27d-f7965b2c4eb7.sql
-- ============================================================
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_messages_auto_retry
  ON public.messages (status, error_code, retry_count, created_at)
  WHERE status = 'undelivered' AND retry_count = 0;

-- ============================================================
-- migration: 20260730125319_f5f4fdc7-0cc6-4c1d-b417-c8f140a14a6e.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.campaign_report_summary(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _account_id uuid;
  res jsonb;
BEGIN
  SELECT c.account_id INTO _account_id FROM public.campaigns c WHERE c.id = _campaign_id;
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF NOT (public.is_admin_or_service() OR public.has_account_access(_account_id, 'viewer')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH m AS (
    SELECT * FROM public.messages WHERE campaign_id = _campaign_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM m),
    'queued', (SELECT count(*) FROM m WHERE status IN ('queued','pending')),
    'sending', (SELECT count(*) FROM m WHERE status = 'sending'),
    'sent', (SELECT count(*) FROM m WHERE status = 'sent' AND error_code IS NULL),
    'sent_with_error', (SELECT count(*) FROM m WHERE status = 'sent' AND error_code IS NOT NULL),
    'delivered', (SELECT count(*) FROM m WHERE status = 'delivered'),
    'delivery_unconfirmed', (SELECT count(*) FROM m WHERE status = 'delivery_unconfirmed'),
    'failed', (SELECT count(*) FROM m WHERE status IN ('failed','undelivered')),
    'segments', (SELECT COALESCE(sum(COALESCE(segments_count,1)),0) FROM m),
    'mms_count', (SELECT count(*) FROM m WHERE is_mms),
    'billed_cost', (SELECT COALESCE(sum(cost),0) FROM m WHERE status IN ('sent','delivered','delivery_unconfirmed','undelivered')),
    'reserved_cost', (SELECT COALESCE(sum(cost),0) FROM m WHERE status IN ('queued','sending','pending')),
    'first_created_at', (SELECT min(created_at) FROM m),
    'last_activity_at', (SELECT max(GREATEST(COALESCE(delivered_at, created_at), COALESCE(sent_at, created_at), created_at)) FROM m),
    'by_country', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.messages DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(country_code,'??') AS country,
               count(*)::bigint AS messages,
               count(*) FILTER (WHERE status = 'delivered')::bigint AS delivered,
               count(*) FILTER (WHERE status IN ('failed','undelivered'))::bigint AS failed,
               COALESCE(sum(COALESCE(segments_count,1)),0)::bigint AS segments,
               COALESCE(sum(cost),0)::numeric AS cost
        FROM m GROUP BY 1
      ) x
    ),
    'by_failure_reason', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.count DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(error_code,'unknown') AS error_code,
               max(failure_reason) AS failure_reason,
               count(*)::bigint AS count
        FROM m WHERE status IN ('failed','undelivered') OR (status = 'sent' AND error_code IS NOT NULL)
        GROUP BY 1
      ) x
    ),
    'failures_by_country', (
      SELECT COALESCE(jsonb_object_agg(country, cnt), '{}'::jsonb) FROM (
        SELECT COALESCE(country_code,'—') AS country, count(*)::bigint AS cnt
        FROM m WHERE status IN ('failed','undelivered') GROUP BY 1
      ) y
    )
  ) INTO res;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_report_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_report_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_report_summary(uuid) TO service_role;

-- ============================================================
-- migration: 20260730140852_30a2bbde-4930-4bc3-9e4e-b7950753604d.sql
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS charged_amount numeric(14,4),
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 0;

CREATE TABLE public.message_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  authorization_source text NOT NULL DEFAULT 'original_campaign',
  authorized_by uuid,
  reason text,
  tenant_charge numeric(14,4) NOT NULL DEFAULT 0,
  estimated_carrier_cost numeric(14,6) NOT NULL DEFAULT 0,
  provider_message_id text,
  provider_status text NOT NULL DEFAULT 'reserved',
  error_code text,
  failure_reason text,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, attempt_number)
);
GRANT SELECT ON public.message_send_attempts TO authenticated;
GRANT ALL ON public.message_send_attempts TO service_role;
ALTER TABLE public.message_send_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view message attempts"
ON public.message_send_attempts FOR SELECT TO authenticated
USING (public.has_account_access(account_id, 'viewer'));
CREATE TRIGGER message_send_attempts_touch_updated_at
BEFORE UPDATE ON public.message_send_attempts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX message_send_attempts_campaign_created_idx
ON public.message_send_attempts(campaign_id, created_at DESC);
CREATE INDEX message_send_attempts_account_created_idx
ON public.message_send_attempts(account_id, created_at DESC);

DROP FUNCTION public.claim_campaign_messages(uuid, integer);

CREATE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  campaign_account uuid;
  current_balance numeric;
  profitable_price numeric;
  carrier_cost numeric;
  next_attempt integer;
  claimed integer := 0;
BEGIN
  SELECT account_id INTO campaign_account
  FROM public.campaigns
  WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  FOR rec IN
    SELECT m.id, m.phone_e164, m.rendered_body, m.country_code,
           COALESCE(m.segments_count, 1) AS segments_count,
           COALESCE(m.is_mms, false) AS is_mms,
           COALESCE(m.attempt_number, 0) AS previous_attempt,
           cr.sell_price, cr.cost_price, cr.passthrough_fee,
           cr.mms_multiplier, cr.mms_cost_multiplier
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code AND cr.active = true
    WHERE m.campaign_id = _campaign_id
      AND (
        m.status = 'queued'
        OR (
          m.status = 'sending'
          AND m.provider_message_id IS NULL
          AND (m.dispatch_started_at IS NULL OR m.dispatch_started_at < now() - interval '2 minutes')
        )
      )
      AND m.charged_at IS NULL
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE OF m SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  LOOP
    IF rec.sell_price IS NULL THEN
      UPDATE public.messages
      SET status='failed', error_code='rate_unavailable', failure_reason='No active price is available for this destination.'
      WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    profitable_price := ROUND(
      rec.sell_price * rec.segments_count *
      CASE WHEN rec.is_mms THEN COALESCE(rec.mms_multiplier, 1) ELSE 1 END,
      4
    );
    carrier_cost := ROUND(
      (COALESCE(rec.cost_price,0) + COALESCE(rec.passthrough_fee,0)) * rec.segments_count *
      CASE WHEN rec.is_mms THEN COALESCE(rec.mms_cost_multiplier, rec.mms_multiplier, 1) ELSE 1 END,
      6
    );
    next_attempt := rec.previous_attempt + 1;

    UPDATE public.accounts
    SET credit_balance = credit_balance - profitable_price
    WHERE accounts.id = campaign_account
      AND credit_balance >= profitable_price
    RETURNING credit_balance INTO current_balance;

    IF current_balance IS NULL THEN
      UPDATE public.messages
      SET status='failed', error_code='insufficient_balance', failure_reason='Insufficient account credit for this send attempt.'
      WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (campaign_account, 'debit', profitable_price, current_balance, _campaign_id,
      'Reserved SMS attempt ' || next_attempt || ' → ' || rec.phone_e164 || ' (' || COALESCE(rec.country_code,'??') || ') × ' || rec.segments_count);

    UPDATE public.messages
    SET status='sending', dispatch_started_at=now(), cost=profitable_price,
        charged_at=now(), charged_amount=profitable_price, attempt_number=next_attempt
    WHERE messages.id=rec.id;

    INSERT INTO public.message_send_attempts(
      message_id, campaign_id, account_id, attempt_number, authorization_source,
      reason, tenant_charge, estimated_carrier_cost, provider_status
    ) VALUES (
      rec.id, _campaign_id, campaign_account, next_attempt,
      CASE WHEN next_attempt = 1 THEN 'original_campaign' ELSE 'manual_retry' END,
      CASE WHEN next_attempt = 1 THEN 'Original campaign send' ELSE 'Explicitly approved retry' END,
      profitable_price, carrier_cost, 'reserved'
    );

    id := rec.id;
    phone_e164 := rec.phone_e164;
    rendered_body := rec.rendered_body;
    country_code := rec.country_code;
    segments_count := rec.segments_count;
    cost := profitable_price;
    attempt_number := next_attempt;
    claimed := claimed + 1;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(uuid, integer) TO service_role;

-- ============================================================
-- migration: 20260730143308_a25d6322-8fba-4d63-ba5b-343a3d080913.sql
-- ============================================================
CREATE TABLE public.financial_recovery_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  title text NOT NULL,
  campaign_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_provider','provider_credited','provider_rejected','tenant_pending','tenant_collected','closed')),
  evidence_quality text NOT NULL DEFAULT 'estimated' CHECK (evidence_quality IN ('exact','partial','estimated')),
  verified_funding numeric NOT NULL DEFAULT 0,
  verified_tenant_debits numeric NOT NULL DEFAULT 0,
  verified_uncovered_tenant_charge numeric NOT NULL DEFAULT 0,
  disputed_provider_attempts integer NOT NULL DEFAULT 0,
  disputed_provider_amount numeric NOT NULL DEFAULT 0,
  provider_credit_received numeric NOT NULL DEFAULT 0,
  tenant_amount_collected numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  summary text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.financial_recovery_cases TO authenticated;
GRANT ALL ON public.financial_recovery_cases TO service_role;
ALTER TABLE public.financial_recovery_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view recovery cases" ON public.financial_recovery_cases FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE POLICY "Admins can create recovery cases" ON public.financial_recovery_cases FOR INSERT TO authenticated WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins can update recovery cases" ON public.financial_recovery_cases FOR UPDATE TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER financial_recovery_cases_touch_updated_at BEFORE UPDATE ON public.financial_recovery_cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX financial_recovery_cases_account_idx ON public.financial_recovery_cases(account_id, created_at DESC);

ALTER TABLE public.messages
  ADD COLUMN retry_authorization_source text,
  ADD COLUMN retry_authorized_by uuid,
  ADD COLUMN retry_authorized_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
 RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  campaign_account uuid;
  current_balance numeric;
  profitable_price numeric;
  carrier_cost numeric;
  next_attempt integer;
BEGIN
  SELECT account_id INTO campaign_account FROM public.campaigns WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  FOR rec IN
    SELECT m.id, m.phone_e164, m.rendered_body, m.country_code,
           COALESCE(m.segments_count, 1) AS segments_count,
           COALESCE(m.is_mms, false) AS is_mms,
           COALESCE(m.attempt_number, 0) AS previous_attempt,
           m.retry_authorization_source, m.retry_authorized_by, m.retry_authorized_at,
           cr.sell_price, cr.cost_price, cr.passthrough_fee,
           cr.mms_multiplier, cr.mms_cost_multiplier
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code AND cr.active = true
    WHERE m.campaign_id = _campaign_id
      AND (m.status = 'queued' OR (m.status = 'sending' AND m.provider_message_id IS NULL AND (m.dispatch_started_at IS NULL OR m.dispatch_started_at < now() - interval '2 minutes')))
      AND m.charged_at IS NULL
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE OF m SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  LOOP
    next_attempt := rec.previous_attempt + 1;
    IF next_attempt > 1 AND (rec.retry_authorized_by IS NULL OR rec.retry_authorized_at IS NULL OR rec.retry_authorized_at < now() - interval '24 hours') THEN
      UPDATE public.messages SET status='failed', error_code='retry_authorization_required', failure_reason='Retry requires a fresh explicit approval.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    IF rec.sell_price IS NULL THEN
      UPDATE public.messages SET status='failed', error_code='rate_unavailable', failure_reason='No active price is available for this destination.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    profitable_price := ROUND(rec.sell_price * rec.segments_count * CASE WHEN rec.is_mms THEN COALESCE(rec.mms_multiplier, 1) ELSE 1 END, 4);
    carrier_cost := ROUND((COALESCE(rec.cost_price,0) + COALESCE(rec.passthrough_fee,0)) * rec.segments_count * CASE WHEN rec.is_mms THEN COALESCE(rec.mms_cost_multiplier, rec.mms_multiplier, 1) ELSE 1 END, 6);

    UPDATE public.accounts SET credit_balance = credit_balance - profitable_price
    WHERE accounts.id = campaign_account AND credit_balance >= profitable_price
    RETURNING credit_balance INTO current_balance;

    IF current_balance IS NULL THEN
      UPDATE public.messages SET status='failed', error_code='insufficient_balance', failure_reason='Insufficient account credit for this send attempt.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (campaign_account, 'debit', profitable_price, current_balance, _campaign_id,
      'Reserved SMS attempt ' || next_attempt || ' → ' || rec.phone_e164 || ' (' || COALESCE(rec.country_code,'??') || ') × ' || rec.segments_count);

    UPDATE public.messages
    SET status='sending', dispatch_started_at=now(), cost=profitable_price, charged_at=now(), charged_amount=profitable_price,
        attempt_number=next_attempt, retry_authorization_source=NULL, retry_authorized_by=NULL, retry_authorized_at=NULL
    WHERE messages.id=rec.id;

    INSERT INTO public.message_send_attempts(message_id, campaign_id, account_id, attempt_number, authorization_source, authorized_by, reason, tenant_charge, estimated_carrier_cost, provider_status)
    VALUES (rec.id, _campaign_id, campaign_account, next_attempt,
      CASE WHEN next_attempt = 1 THEN 'original_campaign' ELSE COALESCE(rec.retry_authorization_source, 'manual_retry') END,
      CASE WHEN next_attempt = 1 THEN NULL ELSE rec.retry_authorized_by END,
      CASE WHEN next_attempt = 1 THEN 'Original campaign send' ELSE 'Explicitly approved retry' END,
      profitable_price, carrier_cost, 'reserved');

    id := rec.id; phone_e164 := rec.phone_e164; rendered_body := rec.rendered_body; country_code := rec.country_code;
    segments_count := rec.segments_count; cost := profitable_price; attempt_number := next_attempt;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- ============================================================
-- migration: 20260730143533_d7d15c02-32b2-4a72-bf6f-9671b0b3f057.sql
-- ============================================================
REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(uuid, integer) TO service_role;

-- ============================================================
-- migration: 20260730143714_c4823877-9fff-4207-ae98-d1980d5b11ad.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
 RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  campaign_account uuid;
  current_balance numeric;
  profitable_price numeric;
  carrier_cost numeric;
  next_attempt integer;
BEGIN
  SELECT account_id INTO campaign_account FROM public.campaigns WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  UPDATE public.messages
     SET status = 'failed',
         error_code = 'dispatch_timeout',
         failure_reason = 'The send result is uncertain after a dispatcher timeout. Explicit approval is required before retrying.'
   WHERE campaign_id = _campaign_id
     AND status = 'sending'
     AND provider_message_id IS NULL
     AND (dispatch_started_at IS NULL OR dispatch_started_at < now() - interval '2 minutes');

  FOR rec IN
    SELECT m.id, m.phone_e164, m.rendered_body, m.country_code,
           COALESCE(m.segments_count, 1) AS segments_count,
           COALESCE(m.is_mms, false) AS is_mms,
           COALESCE(m.attempt_number, 0) AS previous_attempt,
           m.retry_authorization_source, m.retry_authorized_by, m.retry_authorized_at,
           cr.sell_price, cr.cost_price, cr.passthrough_fee,
           cr.mms_multiplier, cr.mms_cost_multiplier
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code AND cr.active = true
    WHERE m.campaign_id = _campaign_id
      AND m.status = 'queued'
      AND m.charged_at IS NULL
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE OF m SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  LOOP
    next_attempt := rec.previous_attempt + 1;
    IF next_attempt > 1 AND (rec.retry_authorized_by IS NULL OR rec.retry_authorized_at IS NULL OR rec.retry_authorized_at < now() - interval '24 hours') THEN
      UPDATE public.messages SET status='failed', error_code='retry_authorization_required', failure_reason='Retry requires a fresh explicit approval.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    IF rec.sell_price IS NULL THEN
      UPDATE public.messages SET status='failed', error_code='rate_unavailable', failure_reason='No active price is available for this destination.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    profitable_price := ROUND(rec.sell_price * rec.segments_count * CASE WHEN rec.is_mms THEN COALESCE(rec.mms_multiplier, 1) ELSE 1 END, 4);
    carrier_cost := ROUND((COALESCE(rec.cost_price,0) + COALESCE(rec.passthrough_fee,0)) * rec.segments_count * CASE WHEN rec.is_mms THEN COALESCE(rec.mms_cost_multiplier, rec.mms_multiplier, 1) ELSE 1 END, 6);

    UPDATE public.accounts SET credit_balance = credit_balance - profitable_price
    WHERE accounts.id = campaign_account AND credit_balance >= profitable_price
    RETURNING credit_balance INTO current_balance;

    IF current_balance IS NULL THEN
      UPDATE public.messages SET status='failed', error_code='insufficient_balance', failure_reason='Insufficient account credit for this send attempt.' WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (campaign_account, 'debit', profitable_price, current_balance, _campaign_id,
      'Reserved SMS attempt ' || next_attempt || ' → ' || rec.phone_e164 || ' (' || COALESCE(rec.country_code,'??') || ') × ' || rec.segments_count);

    UPDATE public.messages
    SET status='sending', dispatch_started_at=now(), cost=profitable_price, charged_at=now(), charged_amount=profitable_price,
        attempt_number=next_attempt, retry_authorization_source=NULL, retry_authorized_by=NULL, retry_authorized_at=NULL
    WHERE messages.id=rec.id;

    INSERT INTO public.message_send_attempts(message_id, campaign_id, account_id, attempt_number, authorization_source, authorized_by, reason, tenant_charge, estimated_carrier_cost, provider_status)
    VALUES (rec.id, _campaign_id, campaign_account, next_attempt,
      CASE WHEN next_attempt = 1 THEN 'original_campaign' ELSE COALESCE(rec.retry_authorization_source, 'manual_retry') END,
      CASE WHEN next_attempt = 1 THEN NULL ELSE rec.retry_authorized_by END,
      CASE WHEN next_attempt = 1 THEN 'Original campaign send' ELSE 'Explicitly approved retry' END,
      profitable_price, carrier_cost, 'reserved');

    id := rec.id; phone_e164 := rec.phone_e164; rendered_body := rec.rendered_body; country_code := rec.country_code;
    segments_count := rec.segments_count; cost := profitable_price; attempt_number := next_attempt;
    RETURN NEXT;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(uuid, integer) TO service_role;
