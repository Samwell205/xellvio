ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_messages_auto_retry
  ON public.messages (status, error_code, retry_count, created_at)
  WHERE status = 'undelivered' AND retry_count = 0;