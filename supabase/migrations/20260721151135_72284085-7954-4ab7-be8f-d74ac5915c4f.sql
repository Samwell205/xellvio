ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_credits_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_credits_check CHECK (credits >= 0);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status = ANY (ARRAY['pending','paid','failed','cancelled','refunded','refund_pending']));