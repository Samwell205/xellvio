UPDATE public.campaigns
SET status = 'sent',
    paused_reason = 'Finalized as sent: some recipients were removed mid-send; all valid recipients were handed to the carrier.'
WHERE id = '840d2dcc-fb70-4288-88cb-c09dcfc08561';