CREATE TABLE public.blog_agent_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
 key_hash text NOT NULL UNIQUE,
 key_hint text NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
GRANT SELECT ON public.blog_agent_keys TO authenticated;
GRANT ALL ON public.blog_agent_keys TO service_role;
ALTER TABLE public.blog_agent_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view AI publishing keys" ON public.blog_agent_keys FOR SELECT TO authenticated USING (public.has_role('admin'));