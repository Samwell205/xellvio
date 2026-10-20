ALTER TABLE public.receptionist_settings
  ADD COLUMN IF NOT EXISTS number_country text,
  ADD COLUMN IF NOT EXISTS requirement_group_id text,
  ADD COLUMN IF NOT EXISTS regulatory_notes text;