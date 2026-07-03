
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_used TEXT,
  ADD COLUMN IF NOT EXISTS sender_kind TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS messages_campaign_status_idx
  ON public.messages(campaign_id, status);

CREATE INDEX IF NOT EXISTS messages_campaign_country_idx
  ON public.messages(campaign_id, country_code);
