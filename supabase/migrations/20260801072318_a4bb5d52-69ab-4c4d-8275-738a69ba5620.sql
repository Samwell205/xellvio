DELETE FROM public.messages a
USING public.messages b
WHERE a.campaign_id = b.campaign_id
  AND a.profile_id = b.profile_id
  AND a.profile_id IS NOT NULL
  AND a.id > b.id
  AND a.status IN ('pending', 'queued', 'failed')
  AND b.status IN ('pending', 'queued', 'failed');

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_campaign_profile_unique;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_campaign_profile_unique UNIQUE (campaign_id, profile_id);