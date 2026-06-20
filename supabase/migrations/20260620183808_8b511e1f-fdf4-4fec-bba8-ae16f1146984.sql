ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS policies_accepted jsonb,
  ADD COLUMN IF NOT EXISTS policies_accepted_version text,
  ADD COLUMN IF NOT EXISTS sms_consent_disclosures_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_disclosures_version text;