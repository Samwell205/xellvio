
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS tollfree_setup_fee_paid_at TIMESTAMPTZ;
