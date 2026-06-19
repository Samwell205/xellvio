ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS sender_map jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campaigns.sender_map IS
  'Snapshot of per-country sender routing at the time the draft was saved. Keys are ISO country codes; values are { sender_kind, phone_number, messaging_service_sid } or null when no eligible verified sender exists.';