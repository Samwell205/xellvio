
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
