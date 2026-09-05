CREATE TABLE public.authority_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'directory',
  source_url text,
  opportunity_id uuid REFERENCES public.authority_opportunities(id) ON DELETE SET NULL,
  landing_page text,
  period_start date,
  period_end date,
  visitors int NOT NULL DEFAULT 0,
  engaged_visitors int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  signups int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_referrals TO authenticated;
GRANT ALL ON public.authority_referrals TO service_role;
ALTER TABLE public.authority_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage authority referrals" ON public.authority_referrals FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_authority_referrals_updated BEFORE UPDATE ON public.authority_referrals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();