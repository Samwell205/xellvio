CREATE TABLE public.assistant_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, user_id uuid NOT NULL,
 kind text NOT NULL, arguments jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', outcome jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);
GRANT SELECT ON public.assistant_operations TO authenticated;
GRANT ALL ON public.assistant_operations TO service_role;
ALTER TABLE public.assistant_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own assistant proposals" ON public.assistant_operations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX assistant_operations_owner ON public.assistant_operations (account_id, user_id, created_at DESC);