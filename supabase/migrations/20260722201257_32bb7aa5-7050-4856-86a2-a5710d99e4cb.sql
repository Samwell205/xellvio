
CREATE TABLE public.telnyx_transactions_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount numeric(12,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  category text,
  description text,
  reference text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX telnyx_txn_import_occurred_idx ON public.telnyx_transactions_import(occurred_at DESC);
CREATE INDEX telnyx_txn_import_batch_idx ON public.telnyx_transactions_import(batch_id);
CREATE INDEX telnyx_txn_import_category_idx ON public.telnyx_transactions_import(category);

GRANT SELECT, INSERT, DELETE ON public.telnyx_transactions_import TO authenticated;
GRANT ALL ON public.telnyx_transactions_import TO service_role;

ALTER TABLE public.telnyx_transactions_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read telnyx txn import"
  ON public.telnyx_transactions_import FOR SELECT
  TO authenticated USING (public.has_role('admin'));

CREATE POLICY "Admins write telnyx txn import"
  ON public.telnyx_transactions_import FOR INSERT
  TO authenticated WITH CHECK (public.has_role('admin'));

CREATE POLICY "Admins delete telnyx txn import"
  ON public.telnyx_transactions_import FOR DELETE
  TO authenticated USING (public.has_role('admin'));

-- Helpful index for TFN drill-down (per-sender query all-time)
CREATE INDEX IF NOT EXISTS messages_sender_used_idx
  ON public.messages(sender_used) WHERE sender_used IS NOT NULL;
