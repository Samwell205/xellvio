CREATE TABLE IF NOT EXISTS public.admin_report_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_report_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_report_cache FROM anon, authenticated;
GRANT ALL ON public.admin_report_cache TO service_role;

-- Dispatcher progress counts filter campaigns by carrier error code and by
-- "handed to carrier"; these were the heaviest repeated queries.
CREATE INDEX IF NOT EXISTS messages_campaign_error_code_idx
  ON public.messages (campaign_id, error_code) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_campaign_provider_sent_idx
  ON public.messages (campaign_id) WHERE provider_message_id IS NOT NULL;