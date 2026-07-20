
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
