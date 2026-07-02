
-- 1. Mark accounts that are sellers
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_seller boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_balance numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_lifetime_earnings numeric(12,2) NOT NULL DEFAULT 0;

-- 2. Seller payout (Nigerian bank) accounts
CREATE TABLE IF NOT EXISTS public.seller_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_payout_accounts TO authenticated;
GRANT ALL ON public.seller_payout_accounts TO service_role;
ALTER TABLE public.seller_payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers manage own payout account"
  ON public.seller_payout_accounts FOR ALL TO authenticated
  USING (account_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (account_id = auth.uid() OR public.has_role('admin'));
CREATE TRIGGER trg_payout_accounts_updated_at
  BEFORE UPDATE ON public.seller_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Marketplace listings
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sender_asset_id uuid REFERENCES public.sender_assets(id) ON DELETE SET NULL,
  tollfree_attempt_id uuid REFERENCES public.tollfree_verification_attempts(id) ON DELETE SET NULL,
  phone_number text,
  status text NOT NULL DEFAULT 'verifying' CHECK (status IN ('verifying','available','sold','rejected','withdrawn')),
  buyer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  sold_at timestamptz,
  buyer_price_amount numeric(12,2),
  seller_payout_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON public.marketplace_listings(seller_account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own listings"
  ON public.marketplace_listings FOR SELECT TO authenticated
  USING (seller_account_id = auth.uid() OR buyer_account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Sellers insert own listings"
  ON public.marketplace_listings FOR INSERT TO authenticated
  WITH CHECK (seller_account_id = auth.uid());
CREATE POLICY "Admins update listings"
  ON public.marketplace_listings FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Seller ledger
CREATE TABLE IF NOT EXISTS public.seller_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sale_credit','withdrawal_debit','adjustment')),
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  withdrawal_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_account ON public.seller_ledger(account_id, created_at DESC);
GRANT SELECT, INSERT ON public.seller_ledger TO authenticated;
GRANT ALL ON public.seller_ledger TO service_role;
ALTER TABLE public.seller_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own ledger"
  ON public.seller_ledger FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.has_role('admin'));

-- 5. Withdrawal requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  payout_account_snapshot jsonb NOT NULL,
  admin_notes text,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers manage own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (seller_account_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Sellers create own withdrawal requests"
  ON public.withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (seller_account_id = auth.uid());
CREATE POLICY "Admins update withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE TRIGGER trg_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Marketplace pricing rows in platform_settings
INSERT INTO public.platform_settings (key, value)
VALUES
  ('marketplace_buyer_price_usd', '15'::jsonb),
  ('marketplace_seller_payout_usd', '10'::jsonb),
  ('marketplace_seller_verification_fee_usd', '3.50'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 7. Seller credit/debit SQL fns
CREATE OR REPLACE FUNCTION public.credit_seller(_account_id uuid, _amount numeric, _listing_id uuid, _description text)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance numeric;
BEGIN
  UPDATE public.accounts
     SET seller_balance = seller_balance + _amount,
         seller_lifetime_earnings = seller_lifetime_earnings + _amount
   WHERE id = _account_id
  RETURNING seller_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Seller account not found'; END IF;
  INSERT INTO public.seller_ledger(account_id, type, amount, balance_after, listing_id, description)
    VALUES (_account_id, 'sale_credit', _amount, new_balance, _listing_id, _description);
  RETURN new_balance;
END $$;

CREATE OR REPLACE FUNCTION public.debit_seller_withdrawal(_account_id uuid, _amount numeric, _withdrawal_id uuid, _description text)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance numeric;
BEGIN
  UPDATE public.accounts
     SET seller_balance = seller_balance - _amount
   WHERE id = _account_id
  RETURNING seller_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Seller account not found'; END IF;
  IF new_balance < 0 THEN
    UPDATE public.accounts SET seller_balance = seller_balance + _amount WHERE id = _account_id;
    RAISE EXCEPTION 'Insufficient seller balance';
  END IF;
  INSERT INTO public.seller_ledger(account_id, type, amount, balance_after, withdrawal_id, description)
    VALUES (_account_id, 'withdrawal_debit', -_amount, new_balance, _withdrawal_id, _description);
  RETURN new_balance;
END $$;
