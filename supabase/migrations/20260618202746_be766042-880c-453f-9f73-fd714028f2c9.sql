
-- country_rates
CREATE TABLE public.country_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  dial_prefix TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_price NUMERIC(10,6) NOT NULL DEFAULT 0,
  sell_price NUMERIC(10,6) NOT NULL DEFAULT 0,
  mms_multiplier NUMERIC(6,2) NOT NULL DEFAULT 3.0,
  sender_supports_inbound BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.country_rates TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.country_rates TO authenticated;
GRANT ALL ON public.country_rates TO service_role;

ALTER TABLE public.country_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "country_rates readable to all" ON public.country_rates
  FOR SELECT USING (true);
CREATE POLICY "country_rates admin write" ON public.country_rates
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE TRIGGER country_rates_updated_at BEFORE UPDATE ON public.country_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.country_rates (country_code, country_name, dial_prefix, sell_price, cost_price, sender_supports_inbound) VALUES
('US','United States','+1',0.015,0.009,true),
('CA','Canada','+1',0.015,0.009,true),
('GB','United Kingdom','+44',0.040,0.024,true),
('NG','Nigeria','+234',0.045,0.027,false),
('DE','Germany','+49',0.085,0.051,false),
('FR','France','+33',0.075,0.045,false),
('NL','Netherlands','+31',0.080,0.048,false),
('AU','Australia','+61',0.055,0.033,true),
('IN','India','+91',0.010,0.006,false),
('AE','United Arab Emirates','+971',0.090,0.054,false),
('ZA','South Africa','+27',0.035,0.021,false),
('BR','Brazil','+55',0.050,0.030,false),
('ES','Spain','+34',0.070,0.042,false),
('IT','Italy','+39',0.065,0.039,false),
('SE','Sweden','+46',0.075,0.045,false);

-- accounts: balance + auto-recharge
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_recharge_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_recharge_threshold NUMERIC(12,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_recharge_amount NUMERIC(12,2) NOT NULL DEFAULT 25;

-- credit_transactions ledger
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup','debit','rollover','refund')),
  amount NUMERIC(12,4) NOT NULL,
  balance_after NUMERIC(12,4) NOT NULL,
  campaign_id UUID NULL REFERENCES public.campaigns(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_tx select own" ON public.credit_transactions
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "credit_tx insert own" ON public.credit_transactions
  FOR INSERT TO authenticated WITH CHECK (account_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_credit_tx_account_created
  ON public.credit_transactions(account_id, created_at DESC);

-- messages.country_code
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- atomic debit
CREATE OR REPLACE FUNCTION public.debit_account(
  _account_id UUID, _amount NUMERIC, _campaign_id UUID, _description TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.accounts
    SET credit_balance = credit_balance - _amount
    WHERE id = _account_id
    RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF new_balance < 0 THEN
    UPDATE public.accounts SET credit_balance = credit_balance + _amount WHERE id = _account_id;
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (_account_id, 'debit', _amount, new_balance, _campaign_id, _description);
  RETURN new_balance;
END;
$$;

-- atomic topup
CREATE OR REPLACE FUNCTION public.topup_account(
  _account_id UUID, _amount NUMERIC, _description TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.accounts SET credit_balance = credit_balance + _amount
    WHERE id = _account_id
    RETURNING credit_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, description)
    VALUES (_account_id, 'topup', _amount, new_balance, _description);
  RETURN new_balance;
END;
$$;
