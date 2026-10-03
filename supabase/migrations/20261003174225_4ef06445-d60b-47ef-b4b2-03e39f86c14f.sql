SET statement_timeout = 0;
CREATE INDEX IF NOT EXISTS events_type_campaign_created_idx ON public.events (type, (payload->>'campaign_id'), created_at DESC);
CREATE INDEX IF NOT EXISTS messages_campaign_sent_idx ON public.messages (campaign_id, sent_at DESC) WHERE sent_at IS NOT NULL;