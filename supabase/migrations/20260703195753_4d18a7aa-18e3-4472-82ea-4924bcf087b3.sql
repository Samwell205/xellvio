ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS dispatch_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_campaign_messages(
  _campaign_id UUID,
  _limit INTEGER
)
RETURNS TABLE (
  id UUID,
  phone_e164 TEXT,
  rendered_body TEXT,
  country_code TEXT,
  segments_count INTEGER,
  cost NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimable AS (
    SELECT m.id
    FROM public.messages m
    WHERE m.campaign_id = _campaign_id
      AND (
        m.status = 'queued'
        OR (
          m.status = 'sending'
          AND m.provider_message_id IS NULL
          AND (
            m.dispatch_started_at IS NULL
            OR m.dispatch_started_at < now() - interval '2 minutes'
          )
        )
      )
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  ), claimed AS (
    UPDATE public.messages m
    SET status = 'sending',
        dispatch_started_at = now()
    FROM claimable c
    WHERE m.id = c.id
    RETURNING m.id, m.phone_e164, m.rendered_body, m.country_code, m.segments_count, m.cost
  )
  SELECT claimed.id, claimed.phone_e164, claimed.rendered_body, claimed.country_code, claimed.segments_count, claimed.cost
  FROM claimed;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_campaign_messages(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(UUID, INTEGER) TO service_role;

CREATE INDEX IF NOT EXISTS idx_messages_campaign_dispatch_claim
  ON public.messages(campaign_id, status, dispatch_started_at, cost, created_at);