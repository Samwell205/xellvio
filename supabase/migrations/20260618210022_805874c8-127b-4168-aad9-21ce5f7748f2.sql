ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS subaccount_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS subaccount_phone_sid TEXT,
  ADD COLUMN IF NOT EXISTS subaccount_messaging_service_sid TEXT;