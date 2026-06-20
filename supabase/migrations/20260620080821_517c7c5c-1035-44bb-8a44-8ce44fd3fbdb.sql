ALTER TABLE public.sender_assets
  ADD COLUMN IF NOT EXISTS verification_payload jsonb;