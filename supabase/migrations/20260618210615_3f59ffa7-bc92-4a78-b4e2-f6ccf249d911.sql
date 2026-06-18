ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS monthly_volume_estimate INTEGER,
  ADD COLUMN IF NOT EXISTS use_case_description TEXT,
  ADD COLUMN IF NOT EXISTS sample_message TEXT,
  ADD COLUMN IF NOT EXISTS opt_in_description TEXT,
  ADD COLUMN IF NOT EXISTS opt_in_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_target_countries TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS public.sender_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('toll_free','local','sender_id')),
  phone_number TEXT,
  phone_sid TEXT,
  messaging_service_sid TEXT,
  verification_sid TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','submitted','in_review','verified','rejected')),
  rejection_reason TEXT,
  friendly_rejection_reason TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_assets TO authenticated;
GRANT ALL ON public.sender_assets TO service_role;

ALTER TABLE public.sender_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant reads own sender assets" ON public.sender_assets
  FOR SELECT TO authenticated USING (account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "tenant writes own sender assets" ON public.sender_assets
  FOR INSERT TO authenticated WITH CHECK (account_id = auth.uid());
CREATE POLICY "tenant updates own sender assets" ON public.sender_assets
  FOR UPDATE TO authenticated USING (account_id = auth.uid() OR public.has_role('admin'));

CREATE INDEX IF NOT EXISTS sender_assets_account_idx ON public.sender_assets(account_id);
CREATE INDEX IF NOT EXISTS sender_assets_pending_idx ON public.sender_assets(verification_status)
  WHERE verification_status IN ('submitted','in_review');

CREATE TRIGGER sender_assets_touch BEFORE UPDATE ON public.sender_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();