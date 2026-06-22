
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS gorgias_domain text,
  ADD COLUMN IF NOT EXISTS gorgias_email text,
  ADD COLUMN IF NOT EXISTS gorgias_api_key_enc text,
  ADD COLUMN IF NOT EXISTS gorgias_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.gorgias_ticket_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  gorgias_ticket_id bigint NOT NULL,
  gorgias_customer_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone_e164)
);

GRANT SELECT ON public.gorgias_ticket_map TO authenticated;
GRANT ALL ON public.gorgias_ticket_map TO service_role;
ALTER TABLE public.gorgias_ticket_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants read own gorgias map"
  ON public.gorgias_ticket_map FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());
