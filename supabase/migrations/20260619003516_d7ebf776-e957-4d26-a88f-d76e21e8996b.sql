
CREATE TYPE public.number_request_country AS ENUM ('US','CA');
CREATE TYPE public.number_request_type AS ENUM ('toll_free','ten_dlc','short_code');
CREATE TYPE public.number_request_status AS ENUM ('pending','approved','rejected','provisioned');

CREATE TABLE public.number_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  country public.number_request_country NOT NULL,
  number_type public.number_request_type NOT NULL DEFAULT 'toll_free',
  business_name TEXT NOT NULL,
  business_website TEXT,
  use_case TEXT NOT NULL,
  sample_message TEXT NOT NULL,
  expected_monthly_volume INTEGER NOT NULL DEFAULT 0,
  status public.number_request_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  assigned_phone_number TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX number_requests_account_idx ON public.number_requests(account_id);
CREATE INDEX number_requests_status_idx ON public.number_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.number_requests TO authenticated;
GRANT ALL ON public.number_requests TO service_role;

ALTER TABLE public.number_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own number requests"
  ON public.number_requests FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY "Users create own number requests"
  ON public.number_requests FOR INSERT TO authenticated
  WITH CHECK (account_id = auth.uid() AND requested_by = auth.uid());

CREATE POLICY "Users cancel own pending requests"
  ON public.number_requests FOR DELETE TO authenticated
  USING (account_id = auth.uid() AND status = 'pending');

CREATE POLICY "Admins update number requests"
  ON public.number_requests FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER number_requests_touch
  BEFORE UPDATE ON public.number_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
