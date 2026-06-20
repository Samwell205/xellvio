
-- Pause/resume support for campaigns when master Twilio balance is insufficient
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaigns_paused_low_balance
  ON public.campaigns (paused_at)
  WHERE status = 'paused_low_balance';

-- Platform settings for alert routing & balance buffer
INSERT INTO public.platform_settings (key, value)
VALUES
  ('twilio_alert_emails', to_jsonb('sam@samwellagency.com,durosinmisamuel94@gmail.com,samueldurosinmi69@gmail.com'::text)),
  ('twilio_alert_phone_e164', to_jsonb('+2348106199368'::text)),
  ('twilio_balance_buffer_usd', to_jsonb(5))
ON CONFLICT (key) DO NOTHING;
