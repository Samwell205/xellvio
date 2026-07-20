
CREATE TABLE public.link_clicks (
  short_code TEXT PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  url TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  first_click_at TIMESTAMPTZ,
  last_click_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX link_clicks_campaign_id_idx ON public.link_clicks(campaign_id);
CREATE INDEX link_clicks_message_id_idx ON public.link_clicks(message_id);
CREATE INDEX link_clicks_account_id_idx ON public.link_clicks(account_id);

GRANT SELECT ON public.link_clicks TO authenticated;
GRANT ALL ON public.link_clicks TO service_role;

ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their link clicks"
  ON public.link_clicks FOR SELECT
  TO authenticated
  USING (
    account_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = public.link_clicks.account_id
        AND am.user_id = auth.uid()
        AND am.status = 'active'
    )
  );
