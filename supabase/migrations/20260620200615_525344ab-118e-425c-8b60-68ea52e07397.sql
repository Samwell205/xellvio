
CREATE TABLE public.twilio_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('healthy','low','critical','error')),
  error_message TEXT,
  alerted BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.twilio_balance_snapshots TO authenticated;
GRANT ALL ON public.twilio_balance_snapshots TO service_role;

ALTER TABLE public.twilio_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin reads twilio balance snapshots"
  ON public.twilio_balance_snapshots FOR SELECT
  USING (has_role('admin'::app_role));

CREATE INDEX twilio_balance_snapshots_checked_at_idx
  ON public.twilio_balance_snapshots (checked_at DESC);

-- Default platform settings (only insert if missing)
INSERT INTO public.platform_settings (key, value) VALUES
  ('twilio_low_balance_threshold_usd', '20'::jsonb),
  ('twilio_critical_balance_threshold_usd', '5'::jsonb),
  ('twilio_alert_email', '"sam@samwellagency.com"'::jsonb),
  ('twilio_alerts_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
