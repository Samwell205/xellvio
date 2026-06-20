ALTER TABLE public.sender_assets DISABLE TRIGGER USER;
UPDATE public.sender_assets
SET verification_status = 'pending',
    last_synced_at = now()
WHERE country_code = 'US'
  AND sender_kind = 'toll_free'
  AND verification_sid IS NULL
  AND verification_status = 'verified';
ALTER TABLE public.sender_assets ENABLE TRIGGER USER;