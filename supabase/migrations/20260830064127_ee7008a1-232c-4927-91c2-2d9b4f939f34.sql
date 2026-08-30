ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS signup_ip text,
  ADD COLUMN IF NOT EXISTS signup_country text,
  ADD COLUMN IF NOT EXISTS signup_region text,
  ADD COLUMN IF NOT EXISTS signup_city text,
  ADD COLUMN IF NOT EXISTS last_seen_ip text,
  ADD COLUMN IF NOT EXISTS last_seen_country text,
  ADD COLUMN IF NOT EXISTS last_seen_region text,
  ADD COLUMN IF NOT EXISTS last_seen_city text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;