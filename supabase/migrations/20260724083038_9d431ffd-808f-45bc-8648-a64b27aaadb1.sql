-- Allow preview shortlinks (created in the campaign builder before any message row exists)
ALTER TABLE public.link_clicks
  ALTER COLUMN message_id DROP NOT NULL;

-- Also allow the campaign column to be null: preview links created before a
-- campaign row is autosaved need to attach later at dispatch time.
ALTER TABLE public.link_clicks
  ALTER COLUMN campaign_id DROP NOT NULL;

-- $50 goodwill credit refund for PRINCESS POLLY (afoo moafo).
SELECT public.topup_account(
  '225a5d8a-abad-4637-9b2a-baa5eab2df3f'::uuid,
  50.00,
  'Goodwill credit refund'
);