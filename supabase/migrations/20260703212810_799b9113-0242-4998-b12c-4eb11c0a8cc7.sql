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
