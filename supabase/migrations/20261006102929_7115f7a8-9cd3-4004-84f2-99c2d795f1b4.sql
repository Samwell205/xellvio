CREATE OR REPLACE FUNCTION public.dashboard_stats(p_account uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '15s' AS $$
DECLARE
  s24 timestamptz := now() - interval '24 hours';
  s7 timestamptz := now() - interval '7 days';
  r jsonb;
BEGIN
  IF NOT public.has_account_access(p_account, 'viewer'::account_member_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH c AS (SELECT id, status, created_at FROM campaigns WHERE account_id = p_account),
  m AS (SELECT m.status, m.created_at FROM messages m JOIN c ON c.id = m.campaign_id),
  p AS (SELECT id FROM profiles WHERE account_id = p_account),
  k AS (SELECT k.status, k.updated_at FROM consents k JOIN p ON p.id = k.profile_id)
  SELECT jsonb_build_object(
    'subscribed', (SELECT count(*) FROM k WHERE status = 'subscribed'),
    'optOuts7', (SELECT count(*) FROM k WHERE status = 'unsubscribed' AND updated_at >= s7),
    'campaignsSent', (SELECT count(*) FROM c WHERE status = 'sent'),
    'campaignsSent7', (SELECT count(*) FROM c WHERE status = 'sent' AND created_at >= s7),
    'totalMessages', (SELECT count(*) FROM m),
    'delivered', (SELECT count(*) FROM m WHERE status = 'delivered'),
    'sent7', (SELECT count(*) FROM m WHERE created_at >= s7),
    'delivered7', (SELECT count(*) FROM m WHERE status = 'delivered' AND created_at >= s7),
    'failed7', (SELECT count(*) FROM m WHERE status = 'failed' AND created_at >= s7),
    'failed24', (SELECT count(*) FROM m WHERE status = 'failed' AND created_at >= s24)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS events_account_created_idx ON public.events (account_id, created_at DESC);