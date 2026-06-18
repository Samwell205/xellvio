
-- ============ credit_packs ============
CREATE TABLE public.credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  price NUMERIC(12,2) NOT NULL CHECK (price > 0),
  credits NUMERIC(12,2) NOT NULL CHECK (credits > 0),
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packs TO anon, authenticated;
GRANT ALL ON public.credit_packs TO service_role;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read active packs" ON public.credit_packs FOR SELECT USING (is_active OR public.has_role('admin'));
CREATE POLICY "admins manage packs" ON public.credit_packs FOR ALL USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_credit_packs_updated BEFORE UPDATE ON public.credit_packs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ payments ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES public.credit_packs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('paystack','payoneer')),
  provider_reference TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  credits NUMERIC(12,2) NOT NULL CHECK (credits > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  proof_url TEXT,
  customer_note TEXT,
  admin_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_account ON public.payments(account_id, created_at DESC);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE UNIQUE INDEX uq_payments_provider_ref ON public.payments(provider, provider_reference) WHERE provider_reference IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant reads own payments" ON public.payments FOR SELECT USING (account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "tenant creates own payments" ON public.payments FOR INSERT WITH CHECK (account_id = auth.uid());
CREATE POLICY "admins update payments" ON public.payments FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ billing_settings (single row) ============
CREATE TABLE public.billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  payoneer_payee_email TEXT,
  payoneer_payee_name TEXT,
  payoneer_instructions TEXT,
  default_currency TEXT NOT NULL DEFAULT 'NGN' CHECK (default_currency IN ('NGN','USD')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read settings" ON public.billing_settings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "admins manage settings" ON public.billing_settings FOR ALL USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_billing_settings_updated BEFORE UPDATE ON public.billing_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.billing_settings (id, default_currency) VALUES (TRUE, 'NGN') ON CONFLICT DO NOTHING;

-- Seed a few default packs (admin can edit)
INSERT INTO public.credit_packs (name, description, currency, price, credits, display_order, is_popular) VALUES
  ('Starter NGN',    'Great for testing',          'NGN',   5000,   10,  10, FALSE),
  ('Growth NGN',     'Most popular for SMBs',      'NGN',  25000,   55,  20, TRUE),
  ('Scale NGN',      'For high-volume senders',    'NGN', 100000,  240,  30, FALSE),
  ('Starter USD',    'Great for testing',          'USD',     10,   10,  40, FALSE),
  ('Growth USD',     'Most popular for SMBs',      'USD',     50,   55,  50, TRUE),
  ('Scale USD',      'For high-volume senders',    'USD',    200,  240,  60, FALSE);
