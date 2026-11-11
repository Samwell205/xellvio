CREATE TABLE public.tenant_intl_subaccounts (
  account_id uuid PRIMARY KEY,
  subaccount_sid text UNIQUE,
  auth_token_enc text,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tenant_intl_subaccounts TO service_role;
ALTER TABLE public.tenant_intl_subaccounts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.tenant_intl_subaccounts IS 'One sub-account per business on the separate international carrier account; service-role only.';