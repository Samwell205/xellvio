
CREATE TABLE public.admin_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_push_subscriptions TO service_role;

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own push subs"
  ON public.admin_push_subscriptions
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::app_role) AND auth.uid() = user_id)
  WITH CHECK (public.has_role('admin'::app_role) AND auth.uid() = user_id);

CREATE INDEX admin_push_subs_user_idx ON public.admin_push_subscriptions(user_id);
