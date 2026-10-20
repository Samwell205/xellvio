CREATE TABLE public.account_assistant_threads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL DEFAULT 'New conversation', messages jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_assistant_threads TO authenticated;
GRANT ALL ON public.account_assistant_threads TO service_role;
ALTER TABLE public.account_assistant_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own assistant conversations" ON public.account_assistant_threads TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX account_assistant_threads_user ON public.account_assistant_threads(user_id, updated_at DESC);