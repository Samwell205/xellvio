ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS line_type text,
  ADD COLUMN IF NOT EXISTS line_type_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_account_line_type_idx
  ON public.profiles (account_id, line_type);

CREATE TABLE IF NOT EXISTS public.phone_line_types (
  phone_e164 text PRIMARY KEY,
  line_type text NOT NULL,
  carrier_name text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.phone_line_types TO service_role;

ALTER TABLE public.phone_line_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view phone line types" ON public.phone_line_types;
CREATE POLICY "Admins can view phone line types"
  ON public.phone_line_types FOR SELECT
  TO authenticated
  USING (public.has_role('admin'::app_role));