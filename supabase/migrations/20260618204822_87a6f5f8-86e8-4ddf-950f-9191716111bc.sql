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