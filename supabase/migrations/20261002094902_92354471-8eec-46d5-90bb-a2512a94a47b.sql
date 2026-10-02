CREATE TABLE public.inbox_hidden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  phone_e164 text,
  message_id uuid,
  hidden_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inbox_hidden TO service_role;
ALTER TABLE public.inbox_hidden ENABLE ROW LEVEL SECURITY;
CREATE INDEX inbox_hidden_account_idx ON public.inbox_hidden(account_id);