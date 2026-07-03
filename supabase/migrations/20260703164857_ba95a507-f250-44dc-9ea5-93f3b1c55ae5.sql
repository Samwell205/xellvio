ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN (
    'draft',
    'queued',
    'scheduled',
    'sending',
    'sent',
    'paused',
    'paused_low_balance',
    'cancelled',
    'failed',
    'blocked_content'
  ));