
ALTER TABLE public.events ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS events_account_id_idx ON public.events(account_id);

DROP POLICY IF EXISTS "Admins read all events" ON public.events;
CREATE POLICY "Admins read all events"
  ON public.events FOR SELECT TO authenticated
  USING (public.has_role('admin'));
