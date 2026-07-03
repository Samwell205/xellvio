
-- =========================================================================
-- Verified Toll-Free Number Marketplace
-- =========================================================================

-- Status enums
DO $$ BEGIN
  CREATE TYPE public.verifier_tfn_status AS ENUM ('pending_verification','verified','sold','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verifier_tx_type AS ENUM ('sale_credit','commission','withdrawal_debit','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verifier_withdrawal_status AS ENUM ('pending','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- verifiers
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.verifiers TO authenticated;
GRANT ALL ON public.verifiers TO service_role;

ALTER TABLE public.verifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifiers self read"
  ON public.verifiers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY "verifiers self insert"
  ON public.verifiers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "verifiers self update"
  ON public.verifiers FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role('admin'));

CREATE TRIGGER verifiers_touch BEFORE UPDATE ON public.verifiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_bank_accounts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL UNIQUE REFERENCES public.verifiers(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.verifier_bank_accounts TO authenticated;
GRANT ALL ON public.verifier_bank_accounts TO service_role;

ALTER TABLE public.verifier_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_bank self read"
  ON public.verifier_bank_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

CREATE POLICY "verifier_bank self write"
  ON public.verifier_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE POLICY "verifier_bank self update"
  ON public.verifier_bank_accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE TRIGGER verifier_bank_touch BEFORE UPDATE ON public.verifier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_wallets
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL UNIQUE REFERENCES public.verifiers(id) ON DELETE CASCADE,
  balance_ngn NUMERIC(14,2) NOT NULL DEFAULT 0,
  lifetime_earned_ngn NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.verifier_wallets TO authenticated;
GRANT ALL ON public.verifier_wallets TO service_role;

ALTER TABLE public.verifier_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_wallets self read"
  ON public.verifier_wallets FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

CREATE TRIGGER verifier_wallets_touch BEFORE UPDATE ON public.verifier_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_tfns
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_tfns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT 'US',
  status public.verifier_tfn_status NOT NULL DEFAULT 'pending_verification',
  twilio_verification_sid TEXT,
  twilio_phone_sid TEXT,
  rejection_reason TEXT,
  sold_to_account_id UUID REFERENCES public.accounts(id),
  sold_at TIMESTAMPTZ,
  sale_price_ngn NUMERIC(14,2),
  commission_ngn NUMERIC(14,2),
  payout_ngn NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifier_tfns_status_idx ON public.verifier_tfns(status);
CREATE INDEX IF NOT EXISTS verifier_tfns_verifier_idx ON public.verifier_tfns(verifier_id);
CREATE INDEX IF NOT EXISTS verifier_tfns_sold_account_idx ON public.verifier_tfns(sold_to_account_id);

GRANT SELECT, INSERT, UPDATE ON public.verifier_tfns TO authenticated;
GRANT ALL ON public.verifier_tfns TO service_role;

ALTER TABLE public.verifier_tfns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_tfns self read"
  ON public.verifier_tfns FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
    OR sold_to_account_id = auth.uid()
  );

CREATE POLICY "verifier_tfns self insert"
  ON public.verifier_tfns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE POLICY "verifier_tfns admin update"
  ON public.verifier_tfns FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER verifier_tfns_touch BEFORE UPDATE ON public.verifier_tfns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- verifier_transactions
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  type public.verifier_tx_type NOT NULL,
  amount_ngn NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  tfn_id UUID REFERENCES public.verifier_tfns(id),
  withdrawal_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifier_tx_verifier_idx ON public.verifier_transactions(verifier_id, created_at DESC);

GRANT SELECT ON public.verifier_transactions TO authenticated;
GRANT ALL ON public.verifier_transactions TO service_role;

ALTER TABLE public.verifier_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_tx self read"
  ON public.verifier_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

-- =========================================================================
-- verifier_withdrawals
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.verifier_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  amount_ngn NUMERIC(14,2) NOT NULL CHECK (amount_ngn > 0),
  status public.verifier_withdrawal_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifier_wd_status_idx ON public.verifier_withdrawals(status);
CREATE INDEX IF NOT EXISTS verifier_wd_verifier_idx ON public.verifier_withdrawals(verifier_id, created_at DESC);

GRANT SELECT, INSERT ON public.verifier_withdrawals TO authenticated;
GRANT ALL ON public.verifier_withdrawals TO service_role;

ALTER TABLE public.verifier_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifier_wd self read"
  ON public.verifier_withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid())
    OR public.has_role('admin')
  );

CREATE POLICY "verifier_wd self insert"
  ON public.verifier_withdrawals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()));

CREATE POLICY "verifier_wd admin update"
  ON public.verifier_withdrawals FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER verifier_wd_touch BEFORE UPDATE ON public.verifier_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- Platform settings defaults
-- =========================================================================
INSERT INTO public.platform_settings (key, value)
VALUES
  ('tfn_flat_price_ngn', '15000'::jsonb),
  ('tfn_commission_pct', '25'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- RPCs
-- =========================================================================

-- Ensure a wallet exists for a verifier
CREATE OR REPLACE FUNCTION public.ensure_verifier_wallet(_verifier_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE wid UUID;
BEGIN
  SELECT id INTO wid FROM public.verifier_wallets WHERE verifier_id = _verifier_id;
  IF wid IS NULL THEN
    INSERT INTO public.verifier_wallets(verifier_id) VALUES (_verifier_id) RETURNING id INTO wid;
  END IF;
  RETURN wid;
END $$;

-- Sell one available verified TFN to an account (atomic).
-- Picks a random verified number, marks sold, credits verifier wallet with payout,
-- records commission, returns the assigned number + verifier info.
CREATE OR REPLACE FUNCTION public.claim_and_sell_verified_tfn(
  _account_id UUID,
  _price_ngn NUMERIC,
  _commission_pct NUMERIC
)
RETURNS TABLE(
  tfn_id UUID,
  phone_number TEXT,
  country TEXT,
  verifier_id UUID,
  payout_ngn NUMERIC,
  commission_ngn NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked RECORD;
  _payout NUMERIC;
  _commission NUMERIC;
  _new_balance NUMERIC;
BEGIN
  SELECT id, phone_number, country, verifier_id
    INTO picked
    FROM public.verifier_tfns
   WHERE status = 'verified'
   ORDER BY random()
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF picked.id IS NULL THEN
    RAISE EXCEPTION 'No verified numbers available';
  END IF;

  _commission := ROUND(_price_ngn * _commission_pct / 100.0, 2);
  _payout := _price_ngn - _commission;

  UPDATE public.verifier_tfns
     SET status = 'sold',
         sold_to_account_id = _account_id,
         sold_at = now(),
         sale_price_ngn = _price_ngn,
         commission_ngn = _commission,
         payout_ngn = _payout,
         updated_at = now()
   WHERE id = picked.id;

  PERFORM public.ensure_verifier_wallet(picked.verifier_id);

  UPDATE public.verifier_wallets
     SET balance_ngn = balance_ngn + _payout,
         lifetime_earned_ngn = lifetime_earned_ngn + _payout,
         updated_at = now()
   WHERE verifier_id = picked.verifier_id
  RETURNING balance_ngn INTO _new_balance;

  INSERT INTO public.verifier_transactions(verifier_id, type, amount_ngn, balance_after, tfn_id, description)
    VALUES (picked.verifier_id, 'sale_credit', _payout, _new_balance, picked.id,
            'Sale of ' || picked.phone_number);

  RETURN QUERY SELECT picked.id, picked.phone_number, picked.country, picked.verifier_id, _payout, _commission;
END $$;

-- Mark a withdrawal paid: debits wallet, logs transaction.
CREATE OR REPLACE FUNCTION public.mark_verifier_withdrawal_paid(
  _withdrawal_id UUID,
  _admin_note TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wd RECORD;
  _new_balance NUMERIC;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO wd FROM public.verifier_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF wd.id IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF wd.status <> 'pending' THEN RAISE EXCEPTION 'Withdrawal already %', wd.status; END IF;

  UPDATE public.verifier_wallets
     SET balance_ngn = balance_ngn - wd.amount_ngn,
         updated_at = now()
   WHERE verifier_id = wd.verifier_id
  RETURNING balance_ngn INTO _new_balance;

  IF _new_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF _new_balance < 0 THEN
    UPDATE public.verifier_wallets SET balance_ngn = balance_ngn + wd.amount_ngn WHERE verifier_id = wd.verifier_id;
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.verifier_withdrawals
     SET status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         admin_note = COALESCE(_admin_note, admin_note),
         updated_at = now()
   WHERE id = _withdrawal_id;

  INSERT INTO public.verifier_transactions(verifier_id, type, amount_ngn, balance_after, withdrawal_id, description)
    VALUES (wd.verifier_id, 'withdrawal_debit', -wd.amount_ngn, _new_balance, _withdrawal_id,
            'Withdrawal paid');

  RETURN _new_balance;
END $$;

-- Reject a pending withdrawal (no wallet movement)
CREATE OR REPLACE FUNCTION public.reject_verifier_withdrawal(
  _withdrawal_id UUID,
  _admin_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.verifier_withdrawals
     SET status = 'rejected',
         admin_note = _admin_note,
         updated_at = now()
   WHERE id = _withdrawal_id AND status = 'pending';
END $$;
